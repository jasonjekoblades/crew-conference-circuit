# Handoff & Migration Notes

Read this if you're picking this project up from Jason Blades, or when it's
time to move it into CREW's own Circle community. `CLAUDE.md` is the product
spec and `README.md` is the setup/architecture doc — this file is neither.
It's the operational map: where things live, who can access what, and what
"finishing the job" (a real Circle integration) actually involves.

---

## What this is, right now

A live, single-maintainer proof of concept. Not affiliated with or run by
CREW itself — one member built it to demonstrate the idea before asking
CREW to adopt it for real. Capped at 16 pilot users, invite-only.

**Live URL:** https://crew-conference-circuit.vercel.app

**Current build status** (as of 2026-08-21, Run 5):

- ✅ M1 — auth, schema, RLS, Vercel deploy
- ✅ M2 core loop — home screen, conference detail + roster, onboarding,
  member-added conferences (manual entry, always works standalone) with
  optional AI verification layered on top (Claude Haiku 4.5 + web search)
- ✅ Member cards (`/m/[id]`) — thin: name, avatar, their conferences
- ✅ Profile fields (title/company/LinkedIn) deliberately removed — see
  "Why no profiles" below
- ❌ M3 — meetups. Fully specced (`CLAUDE.md` §10), zero code. Deliberately
  deferred; the core loop was the priority.
- ❌ Calendar view. Not started.
- 15 seeded conferences. Spec calls for expanding to 30–50 before opening
  the pilot to all 16 members — not done yet.

---

## Accounts and where things live

**GitHub** — `github.com/jasonjekoblades/crew-conference-circuit` (private).
Source of truth for code. Not connected to Vercel's Git integration (see
below) — pushing here does not by itself trigger a deploy.

**Vercel** — project `crew-conference-circuit`, team `jeko2`
(org id `team_osHCgN3a5YrwMJuVh9J3IZoC`). Whoever has access to that Vercel
team can manage env vars, view deploy logs, and see the domain.

Deploys currently happen by running `vercel --prod` from a local clone —
**not** via GitHub push-to-deploy. If you'd rather have deploys fire
automatically on push to `main`, connect the repo in the Vercel dashboard:
**Project Settings → Git → Connect Git Repository** — but note this changes
the release process from "someone runs a command" to "every push to main
goes live," which is worth deciding on deliberately rather than defaulting
into.

**Supabase** — project ref `mkpiehoysmzrnytoiicn`, region `us-west-2`.
Dashboard: `supabase.com/dashboard/project/mkpiehoysmzrnytoiicn`. Whoever
owns this project can rotate keys, read the database directly, and reset
the database password (needed for `supabase db push` — see README.md).

One setting that's easy to miss and everything depends on: **Authentication
→ Sign In / Providers → Anonymous Sign-Ins must stay enabled.** The entire
access model (invite code → anonymous session, no email/password) breaks
without it.

**Anthropic** — the API key powering `/api/conferences/ai-lookup` lives in
Vercel's environment variables, server-side only, never exposed to the
browser. The kill switch (`app_settings.ai_enabled`, toggleable from
`/admin`) defaults to **off** — a new deploy or a fresh seed does not
silently turn AI lookups on. Whoever owns the Anthropic account should have
a monthly spend cap set in the Anthropic Console (`CLAUDE.md` §9's backstop
guardrail) — confirm this is still set if you're taking over billing.

**Credentials, all together:** `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY`
(secret), `ANTHROPIC_API_KEY` — all set in Vercel's **Production**
environment variables (Project Settings → Environment Variables, all marked
Sensitive). A local `.env.local` (gitignored, never committed — see
`.env.example` for the shape) needs the same values for local dev; ask
Jason for them or regenerate: Supabase keys from Project Settings → API,
Anthropic key from `console.anthropic.com`.

**The invite code itself is not recoverable from the database** — only its
hash is stored (`app_settings.invite_code_hash`). The plaintext code lives
wherever Jason distributed it (text/DM/CREW post). If it's lost, a new one
can be set by re-running `npm run seed` with a new `INVITE_CODE` in
`.env.local` (idempotent — safe to re-run against the same project).

---

## Why no profiles (context for the "member is just a name" decision)

Run 5 deliberately deleted `title`, `company`, and `linkedin_url` from
`members` entirely, everywhere. This wasn't a scope cut for time — it's a
bet that a parallel profile system for a 16-person pilot creates work to
migrate away from once this connects to CREW's own member directory, where
that data already lives. If you're the one doing that Circle integration,
this means member identity resolution is exactly "map 16 names to 16 real
CREW identities," a one-time reconciliation — not a data migration.

---

## Migrating into CREW's Circle (the actual eventual goal)

This app was explicitly built to not foreclose a real Circle integration
later (`CLAUDE.md` §11), even though none of that integration work has
started. What's already in place to make it easier:

- **Identity**: members self-identify by name only, no email collected —
  reconciling ~16 names to real Circle identities is a one-time manual
  step, not a migration script.
- **Auth**: token-in-localStorage, not cookies, specifically because a
  cookie-based session breaks inside a third-party iframe (which is how
  this would eventually be embedded in Circle). Don't migrate this to
  `@supabase/ssr` or cookie sessions without revisiting this constraint —
  see README.md's "Why localStorage, not cookies."
- **Auth logic is isolated** in `src/lib/auth/` and `src/lib/supabase/` so
  it can be swapped for Circle SSO without touching page components.
- **No profile data to migrate** — see above.

What integration actually requires, per `CLAUDE.md` §11: CREW admin
cooperation and a paid Circle API tier. Neither exists yet — this is a
business/partnership step, not an engineering one, and it hasn't been
raised with CREW formally yet. **`reference/deferred-features.md`** has the
pitch framing prepared for that conversation — what's cut and why, what a
real version would add, and the recommended order for asking CREW to try
it, use the name, and eventually integrate it properly.

---

## Permanently out of scope (don't re-propose these as "obvious" additions)

Cut deliberately, not by omission — re-adding any of these means reopening
a settled decision, not filling a gap:

- Email or accounts of any kind, including magic-link auth
- Per-member visibility settings ("everyone sees everything" is the model)
- In-app messaging or notifications
- Rich member profiles, photos, bios

See `CLAUDE.md` §14 for the full list and the reasoning behind each cut.

---

## If something looks broken

- **RLS is the entire security boundary** — there is no middleware
  enforcing permissions. A blank screen or empty roster is more likely a
  missing/wrong RLS policy than an app bug. See README.md's "Security
  model" section before adding any server-side workaround.
- **`supabase/tests/access-check.ts`** (`npm run test:access`) is the
  fastest way to confirm the access model still holds — it creates real
  anonymous sessions and proves a linked session reads the full roster
  while an unlinked one reads nothing. Runs against local Supabase by
  default; see the file's header comment for pointing it at a hosted
  project instead.
- **Anonymous sign-ins disabled** is the single most likely "the whole app
  is broken" cause after a fresh Supabase project or a settings reset — see
  the Supabase section above.
