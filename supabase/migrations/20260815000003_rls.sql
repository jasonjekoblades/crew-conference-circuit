-- Row Level Security (CLAUDE.md §6, §7).
--
-- Pattern used throughout: `revoke all ... from anon, authenticated`, then
-- grant back exactly the table-level privileges each role needs, THEN add
-- the RLS policy that further restricts which rows. Both layers are
-- enforced — an operation needs to pass both. Every table also gets an
-- explicit `grant ... to service_role`: BYPASSRLS (which service_role has)
-- only skips POLICY checks, not ordinary table-level GRANTs, which are a
-- separate layer Postgres checks first — confirmed live last run
-- ("permission denied for table members" with no grant at all).
--
-- This version is dramatically simpler than the previous one. §7 used to
-- require a different visible row-set per viewer (own row, all_members-
-- visibility attendees, or fellow attendees only) — that's gone. "Everyone
-- sees everything" means most SELECT policies below are just is_member(),
-- full stop. The one surviving conditional-visibility rule is meetups
-- (§7): visible to conference attendees, plus curators read-only.

-- members ---------------------------------------------------------------
alter table members enable row level security;
grant select, insert, update, delete on members to service_role;
revoke all on members from anon, authenticated;

-- No email, no status, no visibility column left to protect — any member
-- can read every members row. (No INSERT policy: rows are created, and
-- auth_user_id is (re)linked, only by /api/enter using the service role,
-- after it has independently verified the invite code. A client could
-- otherwise relink ANY member's row to their own session with no code at
-- all, which is a real account-takeover path, not just an access-model
-- inconsistency — this is the one place removing "no accounts" doesn't
-- also remove the need for a server-side check.)
grant select on members to authenticated;

create policy members_select_any_member
  on members for select
  to authenticated
  using (public.is_member());

-- A member can edit their own profile fields. auth_user_id and is_curator
-- are deliberately NOT in this column grant — auth_user_id changes only via
-- the service-role relink path above, and is_curator is set directly in the
-- database by the maintainer (CLAUDE.md §6), with no in-app path at all.
grant update (name, title, company, linkedin_url) on members to authenticated;

create policy members_update_own_profile
  on members for update
  to authenticated
  using (id = public.current_member_id())
  with check (id = public.current_member_id());

-- /me's "delete me and my data" (CLAUDE.md §8, §16). ON DELETE CASCADE on
-- attendances/meetup_votes/meetup_rsvps means those go with it; meetups.
-- host_id is ON DELETE RESTRICT, so a member hosting a live meetup can't
-- delete themselves until it's handed off or cancelled — the same
-- protection §10 asks for on un-attending, for free, at the FK level.
create policy members_delete_own
  on members for delete
  to authenticated
  using (id = public.current_member_id());

-- /admin's member list "(with remove)" — a curator can remove anyone.
create policy members_delete_curator
  on members for delete
  to authenticated
  using (public.is_curator());

-- conference_series ---------------------------------------------------------
alter table conference_series enable row level security;
grant select, insert, update, delete on conference_series to service_role;
revoke all on conference_series from anon, authenticated;
grant select, insert on conference_series to authenticated;

create policy conference_series_select_member
  on conference_series for select
  to authenticated
  using (public.is_member());

-- A brand-new conference (one that didn't match anything in the duplicate
-- check, §9) needs a brand-new series to attach to — conferences.series_id
-- isn't nullable. No ownership column on conference_series to check
-- against; any member can create one.
create policy conference_series_insert_member
  on conference_series for insert
  to authenticated
  with check (public.is_member());

-- conferences ---------------------------------------------------------------
alter table conferences enable row level security;
grant select, insert, update, delete on conferences to service_role;
revoke all on conferences from anon, authenticated;
grant select, insert on conferences to authenticated;

-- Members see published conferences (the seeded catalog, plus anything a
-- member has added — the INSERT policy below forces new rows to
-- verified=false, status='published', so they show up immediately with an
-- unverified marker rather than sitting hidden). Curators additionally see
-- pending_review ones, reserved for a future moderation flow that doesn't
-- exist yet — nothing currently writes that status.
create policy conferences_select_published
  on conferences for select
  to authenticated
  using (public.is_member() and status = 'published');

create policy conferences_select_curator_all
  on conferences for select
  to authenticated
  using (public.is_curator());

-- CLAUDE.md §9: "the member is the primary source." A member can add a
-- conference themselves (with or without the AI lookup filling in details)
-- but the row must be attributed to them (created_by = their own members
-- id, not forgeable), and can never masquerade as seed data or claim to be
-- pre-verified — that's the curator's call, made later in /admin.
create policy conferences_insert_member
  on conferences for insert
  to authenticated
  with check (
    public.is_member()
    and created_by = public.current_member_id()
    and source in ('member', 'ai')
    and verified = false
  );

-- attendances ---------------------------------------------------------------
-- CLAUDE.md §7: "everyone sees everything." Any member reads every
-- attendance row, full stop — no per-viewer filtering, no security-definer
-- workaround needed, because there's nothing left to hide. (The previous
-- version of this file had a self-referencing policy here that Postgres
-- rejected outright with a recursion error, worked around via a
-- security-definer function. That whole problem existed only to implement
-- partial visibility, which is deleted — so the workaround is deleted too,
-- not kept around unused.)
alter table attendances enable row level security;
grant select, insert, update, delete on attendances to service_role;
revoke all on attendances from anon, authenticated;
grant select, insert, delete on attendances to authenticated;
grant update (note) on attendances to authenticated;

create policy attendances_select_any_member
  on attendances for select
  to authenticated
  using (public.is_member());

-- Write access (M2, tap-to-toggle): a member can only ever create, edit
-- the note on, or remove their OWN attendance — never anyone else's.
create policy attendances_insert_own
  on attendances for insert
  to authenticated
  with check (member_id = public.current_member_id());

create policy attendances_update_own_note
  on attendances for update
  to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

create policy attendances_delete_own
  on attendances for delete
  to authenticated
  using (member_id = public.current_member_id());

-- meetups / meetup_slots / meetup_votes / meetup_rsvps -----------------------
-- CLAUDE.md §7: the one surviving conditional-visibility rule. Visible to
-- attendees of the parent conference, PLUS curators (read-only — they can
-- flag a meetup official without having to attend, but this policy grants
-- no write access; there is no curator branch in any INSERT/UPDATE policy).
-- Read-only for everyone for now regardless: M3 builds the poll -> confirm
-- state machine and its write rules (host-only slot lock, un-attend
-- cascade, etc.), which aren't specified precisely enough here to encode
-- correctly without that feature existing to validate against.
alter table meetups enable row level security;
grant select, insert, update, delete on meetups to service_role;
revoke all on meetups from anon, authenticated;
grant select on meetups to authenticated;

create policy meetups_select_attendees_and_curators
  on meetups for select
  to authenticated
  using (
    public.is_curator()
    or exists (
      select 1 from attendances a
      where a.conference_id = meetups.conference_id
        and a.member_id = public.current_member_id()
    )
  );

alter table meetup_slots enable row level security;
grant select, insert, update, delete on meetup_slots to service_role;
revoke all on meetup_slots from anon, authenticated;
grant select on meetup_slots to authenticated;

create policy meetup_slots_select_attendees_and_curators
  on meetup_slots for select
  to authenticated
  using (
    public.is_curator()
    or exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = public.current_member_id()
      where m.id = meetup_slots.meetup_id
    )
  );

alter table meetup_votes enable row level security;
grant select, insert, update, delete on meetup_votes to service_role;
revoke all on meetup_votes from anon, authenticated;
grant select on meetup_votes to authenticated;

create policy meetup_votes_select_attendees_and_curators
  on meetup_votes for select
  to authenticated
  using (
    public.is_curator()
    or exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = public.current_member_id()
      where m.id = meetup_votes.meetup_id
    )
  );

alter table meetup_rsvps enable row level security;
grant select, insert, update, delete on meetup_rsvps to service_role;
revoke all on meetup_rsvps from anon, authenticated;
grant select on meetup_rsvps to authenticated;

create policy meetup_rsvps_select_attendees_and_curators
  on meetup_rsvps for select
  to authenticated
  using (
    public.is_curator()
    or exists (
      select 1 from meetups m
      join attendances a
        on a.conference_id = m.conference_id and a.member_id = public.current_member_id()
      where m.id = meetup_rsvps.meetup_id
    )
  );

-- ai_lookups / conference_cache ---------------------------------------------
-- M2 now (moved up from M4), not built yet. RLS enabled, zero policies for
-- anon/authenticated: fully inaccessible until the AI lookup route lands,
-- which will use the service role key like everything else server-side.
alter table ai_lookups enable row level security;
grant select, insert, update, delete on ai_lookups to service_role;
revoke all on ai_lookups from anon, authenticated;

alter table conference_cache enable row level security;
grant select, insert, update, delete on conference_cache to service_role;
revoke all on conference_cache from anon, authenticated;

-- app_settings ---------------------------------------------------------------
-- Holds invite_code_hash. Zero client policies, on purpose — not even a
-- curator SELECT policy, since there's no UI need to read the raw row and
-- the hash should never leave the server. /api/enter and /api/admin/* read/
-- write it with the service role key.
alter table app_settings enable row level security;
grant select, insert, update, delete on app_settings to service_role;
revoke all on app_settings from anon, authenticated;

-- invite_code_attempts --------------------------------------------------
-- Audit log. Service role only — /api/enter writes to it, nothing reads it
-- through the app. A curator who wants to check it does so directly in the
-- Supabase dashboard.
alter table invite_code_attempts enable row level security;
grant select, insert, update, delete on invite_code_attempts to service_role;
revoke all on invite_code_attempts from anon, authenticated;
