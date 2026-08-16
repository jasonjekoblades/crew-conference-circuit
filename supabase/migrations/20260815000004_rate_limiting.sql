-- Backs /api/signup's rate limiting (CLAUDE.md §16: "Rate limiting on the
-- magic-link endpoint"). A DB-backed counter rather than in-memory because
-- this runs on Vercel — separate serverless invocations don't share memory,
-- so an in-process counter would silently do nothing in production.
--
-- Locked down exactly like ai_lookups/app_settings: RLS enabled, no
-- policies granted to anon/authenticated. Only the service role (used by
-- /api/signup) can read or write it.
create table rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_bucket_created_idx
  on rate_limit_events (bucket_key, created_at);

alter table rate_limit_events enable row level security;
revoke all on rate_limit_events from anon, authenticated;

-- Housekeeping: rows older than a day are never read by anything (the
-- signup route only ever looks back 15 minutes), so they're safe to prune
-- opportunistically rather than needing a cron job.
create or replace function public.prune_old_rate_limit_events()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from rate_limit_events where created_at < now() - interval '1 day';
$$;
