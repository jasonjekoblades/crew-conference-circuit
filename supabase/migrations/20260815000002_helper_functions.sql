-- Helper functions used by the RLS policies in 0003_rls.sql.
--
-- Every one of these is `security definer` (runs with the privileges of the
-- function owner, bypassing RLS internally) for the same reason as before:
-- a plain subquery from inside another table's RLS policy would itself be
-- filtered by `members`' own RLS, and — separately — Postgres flatly
-- rejects a policy that references its own table in a subquery (confirmed
-- live last run: error 42P17, "infinite recursion detected in policy").
--
-- `set search_path = public, pg_temp` on every one: Postgres always
-- searches a session's temp schema (pg_temp) FIRST for table/view lookups
-- UNLESS it's explicitly listed in search_path — a bare `search_path =
-- public` still leaves pg_temp implicitly first. Listing it explicitly
-- (after public) pins the search order and closes off a shadow-table
-- attack via CREATE TEMP, which any authenticated user can do by default.
--
-- What got DELETED here and why: member_visibility(), member_attends_
-- conference(), shares_a_conference_with(), and conference_attendee_
-- count() all existed solely to implement per-member visibility (CLAUDE.md
-- §7, old version) — partial name lists, and a count that could legally
-- disagree with the names shown. §7 now says "everyone sees everything";
-- attendee counts are just count(*) with no bypass function needed, since
-- RLS no longer hides any attendance row from any member. Keeping those
-- functions around unused would be a workaround left in after the problem
-- it worked around was deleted — the instruction was to actually delete
-- it, not park it.

-- Does the caller have ANY linked members row? (Not "approved" — that
-- state doesn't exist anymore. Just: is this auth.uid() linked to a member
-- at all.)
create or replace function public.is_member()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from members where auth_user_id = auth.uid()
  );
$$;

-- Is the caller a curator?
create or replace function public.is_curator()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from members where auth_user_id = auth.uid() and is_curator = true
  );
$$;

-- The calling member's OWN members.id — needed everywhere a policy used to
-- write `member_id = auth.uid()`. That shortcut no longer holds: auth.uid()
-- is the auth_user_id, and it can change (relinking), while every foreign
-- key (attendances.member_id, conferences.created_by, meetups.host_id, ...)
-- points at the stable members.id instead. Returns null for a session with
-- no linked row, which correctly makes every `= current_member_id()`
-- comparison false rather than matching NULL foreign keys by accident.
create or replace function public.current_member_id()
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select id from members where auth_user_id = auth.uid();
$$;

-- Public (unauthenticated) teaser for /enter: "three conferences with
-- attendee counts only, no names" (CLAUDE.md §8). Unchanged by the §6/§7
-- rewrite — it never depended on visibility, and it's still the one
-- function callable by the `anon` role since it runs before any session
-- (anonymous or otherwise) exists.
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
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_curator() to authenticated;
grant execute on function public.current_member_id() to authenticated;
