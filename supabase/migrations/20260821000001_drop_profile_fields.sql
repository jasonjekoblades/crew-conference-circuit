-- Run 5, Stage 1b: cut profile fields entirely (CLAUDE.md §5, §8).
-- A member is now a name and a list of conferences, nothing more. In the
-- full version this connects to CREW's own member profiles, so a parallel
-- profile system here would only be something to migrate away from.
--
-- No real member data exists yet that matters (CLAUDE.md §16: "no real CREW
-- member data in seed files, fixtures, or commits"), so this is a straight
-- destructive column drop rather than a preserve-and-migrate step. Dropping
-- a column also drops any column-level GRANTs referencing it automatically
-- (members_update_own_profile's USING/WITH CHECK only reference `id`, so
-- the policy itself is untouched) — no separate revoke needed.

alter table members
  drop column title,
  drop column company,
  drop column linkedin_url;
