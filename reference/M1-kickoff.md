# Milestone 1 kickoff — paste into Claude Code

Read `CLAUDE.md` at the repo root in full before writing any code. It is the source of
truth for this project. Also read `/reference/seed-conferences.json` and open
`/reference/wireframe.html` to see the intended visual density.

Build **Milestone 1 only** (see §15 of the spec). Do not start M2. Do not build anything
listed in §14 (out of scope).

## Scope of M1

1. Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deployed to Vercel.
2. Supabase schema per §5, with Row Level Security policies per §6 and §7.
3. Magic-link auth. No passwords anywhere.
4. Invite code + email on the login screen. Wrong code returns a generic failure that
   does not reveal whether the email exists.
5. Pending/approved/rejected member states, with the `/pending` holding screen.
6. `/admin` member approval queue, restricted to curator accounts.
7. Hard user cap (default 16) read from `app_settings`.
8. Seed the conference catalog from the JSON file.
9. `/onboarding` capturing name, title, company, LinkedIn (optional), and the global
   visibility setting.

Auth must work end to end before M1 is considered done.

## What I need from you before you start

Ask me for these rather than guessing:
- Supabase project URL and anon key
- Supabase service role key (for the admin routes)
- The invite code string
- My email, so you can flag my account as curator in the seed

## Constraints to hold

- **Token in localStorage, not cookie sessions.** This app must survive being iframed
  later. Do not use cookie-based Supabase auth helpers.
- **RLS is written by hand and explained to me.** Do not generate policies and move on.
  For each table, tell me in plain language who can read and who can write. I am going to
  read these line by line — a mistake here means every member can read every other
  member's travel plans.
- `.env` is gitignored from the first commit. Secrets go in Vercel env vars.
- No real CREW member data anywhere — not in seeds, fixtures, tests, or commits.

## Design

Follow §4 of the spec. The tokens there are placeholders and will be replaced with real
CREW brand values later, so **put every color and font in one tokens file** (CSS custom
properties or Tailwind theme config) and reference them everywhere. Do not hardcode hex
values in components.

## Acceptance criteria for M1

I should be able to, on the deployed Vercel URL, from my phone:

1. Visit the login page and see the teaser counts.
2. Enter a wrong invite code and get a generic failure.
3. Enter the right code with a new email and land on `/pending`.
4. Sign in as curator, see that request in `/admin`, approve it.
5. Receive a magic link at that address, click it, complete onboarding.
6. Land on `/` — which can be a stub in M1, but must prove I am authenticated
   and must show the seeded conferences exist.
7. Confirm in the Supabase dashboard that a pending member's session can read nothing.

Step 7 is the one that actually matters. Show me how to verify it.

## How to work

Work in small commits with clear messages. After each meaningful chunk, tell me what you
did and what you want me to check. If something in `CLAUDE.md` is ambiguous or looks
wrong, stop and ask rather than inventing an answer — the spec was written deliberately
and a surprise is more likely to be a misreading than a gap.
