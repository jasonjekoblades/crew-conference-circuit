# CREW Conference Circuit

A private web app for CREW members to see which conferences they're both attending,
and to coordinate meetups on the ground.

**Status:** proof of concept. Capped at 16 approved users. Not affiliated with or
endorsed by CREW — built by a member.

## Start here

- **`CLAUDE.md`** — the build specification. Source of truth. Read it fully before
  writing any code.
- **`reference/M1-kickoff.md`** — paste into Claude Code to begin Milestone 1.
- **`reference/seed-conferences.json`** — 15 verified conferences plus deliberate
  duplicate-detection test cases.
- **`reference/wireframe.html`** — visual reference. Open in a browser; the rows in the
  first screen are clickable.

## Setup

1. `cp .env.example .env.local` and fill in Supabase values
2. `npm install`
3. `npm run dev`

## Non-negotiables

- No passwords. Magic-link auth only.
- Token in localStorage, not cookie sessions — this must survive being iframed.
- RLS policies are reviewed by hand, not generated and trusted.
- No real CREW member data in seeds, fixtures, tests, or commits.
