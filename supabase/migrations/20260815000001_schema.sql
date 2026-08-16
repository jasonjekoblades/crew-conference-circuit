-- CREW Conference Circuit — schema (CLAUDE.md §5)
-- Full data model per the spec. No email, no status, no visibility column —
-- all three were specced, built, and then deliberately cut (CLAUDE.md §6,
-- §7). This migration was rewritten in place rather than layered with
-- ALTERs: nothing has been deployed to a real Supabase project yet, so
-- there's no data to preserve and no reason to keep the old shape around.

create extension if not exists pgcrypto;

-- members ---------------------------------------------------------------
-- id is now a separate, STABLE uuid — deliberately NOT the same as the
-- linked auth user's id, unlike the previous (email-based) design. Why:
-- auth_user_id can change — a member who loses their session re-enters the
-- invite code and "relinks" an existing row to a new anonymous auth user
-- (CLAUDE.md §6) — while id must stay fixed forever, since attendances/
-- conferences.created_by/meetups.host_id all reference it. auth_user_id is
-- nullable specifically so the founding member can be seeded (name +
-- attendance already populated) before they've ever opened the app —
-- their row just sits unlinked until they pick their own name via the
-- "I've been here before" flow, the same mechanism anyone uses to recover
-- a lost session.
create table members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text,
  title text,
  company text,
  linkedin_url text,
  is_curator boolean not null default false,
  created_at timestamptz not null default now()
);

create index members_auth_user_id_idx on members (auth_user_id);

-- conference_series -------------------------------------------------------
create table conference_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null,
  website text,
  aliases text[] not null default '{}'
);

-- conferences ---------------------------------------------------------------
create table conferences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references conference_series (id) on delete cascade,
  year int not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  city text not null,
  country text not null,
  website text,
  category text not null,
  status text not null default 'published'
    check (status in ('published', 'pending_review')),
  source text not null default 'seed'
    check (source in ('seed', 'member', 'ai')),
  verified boolean not null default false,
  created_by uuid references members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (series_id, year)
);

create index conferences_status_idx on conferences (status);
create index conferences_start_date_idx on conferences (start_date);

-- attendances ---------------------------------------------------------------
-- No status column, deliberately (CLAUDE.md §5 notes): a row's presence means
-- "going." Do not add a "considering" state back in.
create table attendances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  conference_id uuid not null references conferences (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, conference_id)
);

create index attendances_conference_idx on attendances (conference_id);
create index attendances_member_idx on attendances (member_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger attendances_set_updated_at
  before update on attendances
  for each row
  execute function public.set_updated_at();

-- meetups ---------------------------------------------------------------
create table meetups (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references conferences (id) on delete cascade,
  host_id uuid not null references members (id) on delete restrict,
  title text not null,
  location text,
  state text not null default 'polling'
    check (state in ('polling', 'confirmed', 'cancelled')),
  confirmed_slot_id uuid,
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

create table meetup_slots (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references meetups (id) on delete cascade,
  starts_at timestamptz not null,
  label text not null
);

alter table meetups
  add constraint meetups_confirmed_slot_fk
  foreign key (confirmed_slot_id) references meetup_slots (id) on delete set null;

create table meetup_votes (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references meetups (id) on delete cascade,
  slot_id uuid not null references meetup_slots (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  unique (meetup_id, slot_id, member_id)
);

create table meetup_rsvps (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references meetups (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  status text not null check (status in ('going', 'out')),
  unique (meetup_id, member_id)
);

create index meetups_conference_idx on meetups (conference_id);
create index meetup_slots_meetup_idx on meetup_slots (meetup_id);
create index meetup_votes_meetup_idx on meetup_votes (meetup_id);
create index meetup_rsvps_meetup_idx on meetup_rsvps (meetup_id);

-- ai_lookups / conference_cache ---------------------------------------------
-- Milestone 4. Structure only for now — locked down entirely in 0003_rls.sql.
create table ai_lookups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  query text not null,
  result jsonb,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

create table conference_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null unique,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- app_settings ---------------------------------------------------------------
create table app_settings (
  key text primary key,
  value text not null
);

-- invite_code_attempts --------------------------------------------------
-- CLAUDE.md §16: the invite code is now the ONLY gate (no accounts, no
-- email), so brute-forcing it "must be slow and logged." rate_limit_events
-- (0004) is the generic sliding-window counter that actually throttles
-- attempts; this is a separate, permanent audit trail — every attempt,
-- success or failure, with no pruning — for the curator to eyeball if they
-- ever suspect the code leaked or is being guessed.
create table invite_code_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index invite_code_attempts_created_at_idx on invite_code_attempts (created_at);
