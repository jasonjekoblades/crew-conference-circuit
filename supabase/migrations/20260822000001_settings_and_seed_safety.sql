-- Run 7: opening the pilot from 16 invited people to a public CREW forum
-- post (~100 expected). Two new admin-editable app_settings rows, plus a
-- documentation-only note (enforced in scripts/seed.ts, not SQL) that
-- re-seeding must never silently clobber a curator's runtime setting.
--
-- ai_global_daily_limit: was a hardcoded 40 in the route; now editable from
-- /jeko43 without a deploy, same as member_cap already was.
-- pilot_full_message: shown to a visitor when member_cap is reached, and
-- reused as the generic "how to get unstuck" line on /enter — curator-
-- editable so Jason isn't hardcoded into app copy.
insert into app_settings (key, value) values
  ('ai_global_daily_limit', '100'),
  ('pilot_full_message', 'This pilot is full. It''s capped while I test the idea — reach out to Jason Blades in the CREW community and I''ll make room.')
on conflict (key) do nothing;

-- Raising the cap for the forum post, per Stage 2's explicit instruction.
-- (An UPDATE, not part of the insert above, so re-running this migration a
-- second time is still a no-op rather than re-lowering a curator's later
-- change — though migrations are append-only in practice, this is cheap
-- insurance.)
update app_settings set value = '100' where key = 'member_cap' and value = '16';
