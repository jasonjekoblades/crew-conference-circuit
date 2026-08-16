-- Helper functions used by the RLS policies in 0003_rls.sql.
--
-- Every one of these is `security definer`, meaning it runs with the
-- privileges of the function owner (the migration role), not the calling
-- user — so it bypasses RLS internally. That is deliberate and is the ONLY
-- reason these exist: a plain subquery from inside another table's RLS
-- policy would itself be filtered by `members`' own RLS policies (own-row-
-- only for non-curators), which would make cross-member visibility checks
-- silently return "nothing visible" for everyone except curators. Each
-- function below is narrow on purpose — it returns a boolean or a single
-- enum value, never a row — so it can't be used to exfiltrate data beyond
-- what it's named for.
--
-- `set search_path = public, pg_temp` on every one of them: Postgres always
-- searches a session's temp schema (pg_temp) FIRST for table/view lookups
-- UNLESS it's explicitly listed in search_path — so a bare `search_path =
-- public` still leaves pg_temp implicitly first. Anyone with CREATE TEMP
-- privilege (any authenticated user, by default) could otherwise shadow
-- `members` with a same-named temp table and have these SECURITY DEFINER
-- functions read from it instead. Listing pg_temp explicitly (after public)
-- pins the search order and closes that off.

-- Is the calling user an approved member? (Not just present in `members` —
-- a pending or rejected row must not pass this.)
create or replace function public.is_approved_member()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from members
    where id = auth.uid() and status = 'approved'
  );
$$;

-- Is the calling user an approved curator?
create or replace function public.is_curator()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from members
    where id = auth.uid() and status = 'approved' and is_curator = true
  );
$$;

-- A single member's visibility setting, looked up by id. Used to implement
-- CLAUDE.md §7's "all_members" branch without exposing the rest of that
-- member's row to the caller.
create or replace function public.member_visibility(p_member_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select visibility from members where id = p_member_id;
$$;

-- The TRUE total attendee count for a conference, regardless of the caller's
-- visibility into individual rows. CLAUDE.md §7: "The attendee count is
-- always the true total ... Do not fudge the count to match the visible
-- names." Returns 0 for anyone who isn't an approved member (pending
-- sessions read nothing) rather than raising, since 0 leaks nothing.
create or replace function public.conference_attendee_count(p_conference_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not is_approved_member() then
    return 0;
  end if;
  return (
    select count(*)::int from attendances
    where conference_id = p_conference_id
  );
end;
$$;

-- Public (unauthenticated) teaser for /login: "three conferences with
-- attendee counts only, no names" (CLAUDE.md §8). Deliberately the only
-- function callable by the `anon` role — everything else here requires an
-- authenticated session. Returns published conferences with the highest
-- attendee counts; reveals nothing about who is attending.
create or replace function public.login_teaser()
returns table (name text, city text, attendee_count integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    c.name,
    c.city,
    count(a.id)::int as attendee_count
  from conferences c
  join attendances a on a.conference_id = c.id
  where c.status = 'published'
  group by c.id, c.name, c.city
  having count(a.id) > 0
  order by count(a.id) desc, c.start_date asc
  limit 3;
$$;

grant execute on function public.login_teaser() to anon, authenticated;
grant execute on function public.is_approved_member() to authenticated;
grant execute on function public.is_curator() to authenticated;
grant execute on function public.member_visibility(uuid) to authenticated;
grant execute on function public.conference_attendee_count(uuid) to authenticated;
