-- Row Level Security (CLAUDE.md §6, §7).
--
-- Pattern used throughout: `revoke all ... from anon, authenticated`, then
-- grant back exactly the table-level privileges each role needs, THEN add
-- the RLS policy that further restricts which rows. Table grants and RLS
-- are both enforced — an operation needs to pass both. Revoking the
-- privileges Supabase grants new tables by default means a missing or
-- buggy policy fails closed instead of silently relying on RLS alone.
--
-- Every table below has RLS enabled, even ai_lookups/conference_cache/
-- app_settings which get zero policies for anon/authenticated — enabling
-- RLS with no policy means "nobody except the service role (which bypasses
-- RLS entirely) can touch this," which is exactly what we want until M4.
--
-- Every table ALSO gets an explicit `grant select, insert, update, delete
-- ... to service_role`. This looks redundant with "bypasses RLS entirely"
-- above, but it isn't: service_role's `BYPASSRLS` attribute only skips
-- POLICY checks. Postgres checks ordinary table-level GRANTs first, as a
-- completely separate layer, and nothing grants those to service_role by
-- default. Skipping this line is a silent, total outage — every server
-- route and the seed script all use the service-role client — not a data
-- leak, so it's easy to not notice until the first real write is attempted.
-- Confirmed against a live local stack: without this line, service_role got
-- "permission denied for table members" on a plain insert.

-- members ---------------------------------------------------------------
alter table members enable row level security;
grant select, insert, update, delete on members to service_role;
revoke all on members from anon, authenticated;

-- Row-insert is NOT granted to anon or authenticated at all: signup is
-- server-side only (see /api/signup), using the service role key, so it can
-- check the invite code and the user cap before creating a row. There is no
-- policy under which a client could INSERT into members directly.

-- A member can read their own row. This is what lets /pending and
-- /onboarding check "am I approved yet / have I onboarded yet."
grant select on members to authenticated;

create policy members_select_own
  on members for select
  to authenticated
  using (id = auth.uid());

-- A curator can read every row — this is the /admin approval queue. Uses
-- is_curator() (security definer) rather than a plain subquery so this
-- policy doesn't recurse into members' own RLS.
create policy members_select_curator
  on members for select
  to authenticated
  using (public.is_curator());

-- A member can update ONLY their own onboarding fields, and only once
-- approved (a pending member has nothing to onboard into yet). status,
-- is_curator, email, approved_at, and id are not in the column grant below,
-- so Postgres rejects any UPDATE that touches them — not just filtered by
-- row, but by column, before RLS even runs. Approve/reject (which change
-- `status`) go through /api/admin/* using the service role key instead.
grant update (name, title, company, linkedin_url, visibility) on members to authenticated;

create policy members_update_own_profile
  on members for update
  to authenticated
  using (id = auth.uid() and status = 'approved')
  with check (id = auth.uid());

-- conference_series ---------------------------------------------------------
alter table conference_series enable row level security;
grant select, insert, update, delete on conference_series to service_role;
revoke all on conference_series from anon, authenticated;
grant select on conference_series to authenticated;

-- Any approved member can browse the catalog. Pending members read nothing
-- (is_approved_member() is false for them, so this policy excludes every
-- row). No INSERT/UPDATE policy: member-submitted conferences are M4.
create policy conference_series_select_approved
  on conference_series for select
  to authenticated
  using (public.is_approved_member());

-- conferences ---------------------------------------------------------------
alter table conferences enable row level security;
grant select, insert, update, delete on conferences to service_role;
revoke all on conferences from anon, authenticated;
grant select on conferences to authenticated;

-- Approved members see published conferences (the seeded catalog). Curators
-- additionally see pending_review ones — the M4 review queue — so this
-- policy is already correct once that queue exists; nothing writes
-- pending_review rows yet.
create policy conferences_select_published
  on conferences for select
  to authenticated
  using (public.is_approved_member() and status = 'published');

create policy conferences_select_curator_all
  on conferences for select
  to authenticated
  using (public.is_curator());

-- attendances ---------------------------------------------------------------
-- This is the policy CLAUDE.md §7 is actually about. Read it as: an approved
-- member can see an attendance row if —
--   (a) it's their own row, or
--   (b) that attendee's global visibility is 'all_members', or
--   (c) the viewer is themselves attending the same conference (the
--       "co_attendees" default — visible only to fellow attendees).
-- This single policy implements both the conference-page roster rule and
-- the member-page rule in CLAUDE.md §7, because both boil down to the same
-- question: "can viewer V see attendee M's row for conference C?"
--
-- It does NOT implement "attendee count is always the true total" — that's
-- deliberately impossible from a row-filtering policy (a hidden row can't
-- be both invisible and counted), which is why conference_attendee_count()
-- exists as a separate security-definer function in 0002. Any UI showing a
-- count must call that function, not count visible rows.
alter table attendances enable row level security;
grant select, insert, update, delete on attendances to service_role;
revoke all on attendances from anon, authenticated;
grant select on attendances to authenticated;

create policy attendances_select_per_visibility
  on attendances for select
  to authenticated
  using (
    public.is_approved_member()
    and (
      member_id = auth.uid()
      or public.member_visibility(member_id) = 'all_members'
      or exists (
        select 1 from attendances viewer_row
        where viewer_row.conference_id = attendances.conference_id
          and viewer_row.member_id = auth.uid()
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy yet: tap-to-toggle attendance is M2 (the
-- year grid). Write access will be scoped to `member_id = auth.uid()` when
-- that lands — a member can only ever create/remove their own attendance.

-- meetups / meetup_slots / meetup_votes / meetup_rsvps -----------------------
-- CLAUDE.md §7: "Meetups are visible only to attendees of the parent
-- conference. No exceptions" — explicitly including curators, so there is
-- no is_curator() bypass here (unlike conferences above).
--
-- Read-only for now: M3 builds the poll → confirm state machine and its
-- write rules (host-only slot lock, un-attend cascade, etc.), which aren't
-- specified precisely enough here to encode correctly without that feature
-- existing to validate against. Until M3 adds INSERT/UPDATE policies these
-- tables are visible to conference attendees but nothing can write to them.
alter table meetups enable row level security;
grant select, insert, update, delete on meetups to service_role;
revoke all on meetups from anon, authenticated;
grant select on meetups to authenticated;

create policy meetups_select_conference_attendees
  on meetups for select
  to authenticated
  using (
    public.is_approved_member()
    and exists (
      select 1 from attendances a
      where a.conference_id = meetups.conference_id
        and a.member_id = auth.uid()
    )
  );

alter table meetup_slots enable row level security;
grant select, insert, update, delete on meetup_slots to service_role;
revoke all on meetup_slots from anon, authenticated;
grant select on meetup_slots to authenticated;

create policy meetup_slots_select_conference_attendees
  on meetup_slots for select
  to authenticated
  using (
    public.is_approved_member()
    and exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = auth.uid()
      where m.id = meetup_slots.meetup_id
    )
  );

alter table meetup_votes enable row level security;
grant select, insert, update, delete on meetup_votes to service_role;
revoke all on meetup_votes from anon, authenticated;
grant select on meetup_votes to authenticated;

create policy meetup_votes_select_conference_attendees
  on meetup_votes for select
  to authenticated
  using (
    public.is_approved_member()
    and exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = auth.uid()
      where m.id = meetup_votes.meetup_id
    )
  );

alter table meetup_rsvps enable row level security;
grant select, insert, update, delete on meetup_rsvps to service_role;
revoke all on meetup_rsvps from anon, authenticated;
grant select on meetup_rsvps to authenticated;

create policy meetup_rsvps_select_conference_attendees
  on meetup_rsvps for select
  to authenticated
  using (
    public.is_approved_member()
    and exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = auth.uid()
      where m.id = meetup_rsvps.meetup_id
    )
  );

-- ai_lookups / conference_cache ---------------------------------------------
-- M4. RLS enabled, zero policies: fully inaccessible to anon/authenticated.
-- The future AI route will use the service role key, which bypasses RLS,
-- exactly like /api/signup and /api/admin/* do today.
alter table ai_lookups enable row level security;
grant select, insert, update, delete on ai_lookups to service_role;
revoke all on ai_lookups from anon, authenticated;

alter table conference_cache enable row level security;
grant select, insert, update, delete on conference_cache to service_role;
revoke all on conference_cache from anon, authenticated;

-- app_settings ---------------------------------------------------------------
-- Holds invite_code_hash. Zero client policies, on purpose — not even a
-- curator SELECT policy, since there's no UI need to read the raw row and
-- the hash should never leave the server. /api/signup and /api/admin/*
-- read/write it with the service role key. If /admin ever needs to display
-- or edit user_cap, that goes through a dedicated API route (also service
-- role), not a relaxed RLS policy on this table.
alter table app_settings enable row level security;
grant select, insert, update, delete on app_settings to service_role;
revoke all on app_settings from anon, authenticated;
