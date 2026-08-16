# CREW Conference Circuit

A private web app that lets members of [CREW](https://crewexec.com/) see which
conferences other members are attending, and coordinate meeting up.

**Status:** proof of concept. Capped at 16 pilot users, invite-only, all data
self-entered and opt-in. Not affiliated with or endorsed by CREW — this is a member-built
prototype intended to demonstrate the concept and, if it lands, be rebuilt natively
inside CREW's Circle community.

---

## The problem it solves

CREW members mention in passing that they're going to Money20/20, or Dreamforce, or
Shoptalk. Someone else in the community is going to the same event and neither finds out
until afterwards. There's no shared view of who's going where.

This app is that view. A member marks the conferences they're attending, and immediately
sees which other members are going to the same ones.

**That single loop is the entire product.** Meetup coordination exists but is explicitly
secondary. If you are contributing to this repo, optimize for the core loop.

---

## Read this first

**[`CLAUDE.md`](./CLAUDE.md) is the source of truth for product decisions.**

It contains the full specification: data model, visibility rules, screen-by-screen
behavior, AI guardrails, and the reasoning behind roughly 27 design decisions that were
settled before any code was written. This README covers *how to run and work on* the
project. `CLAUDE.md` covers *what it should do and why*.

When the two disagree, `CLAUDE.md` wins — and the disagreement is a bug in this file.

Despite the filename, `CLAUDE.md` is tool-agnostic. It's the spec regardless of which
assistant or human is reading it. See [`AGENTS.md`](./AGENTS.md) for the short version
that other harnesses (Cursor, Codex, Copilot) should pick up.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Vercel deploy, server routes for API-key work |
| Styling | Tailwind + shadcn/ui | Fast, and design tokens stay in one file |
| Database | Supabase (Postgres) | Row Level Security is the security model here |
| Auth | Supabase magic links | No passwords, ever |
| Email | Resend | Currently stubbed |
| Hosting | Vercel | |
| AI | Claude Haiku 4.5 + web search | Conference lookup only, server-side only |

---

## Quick start

**Prerequisites:** Node 18+, a Supabase project, and (for conference lookup) an
Anthropic API key.

```bash
git clone <repo-url>
cd crew-conference-circuit
npm install
cp .env.example .env.local   # then fill in the values below
```

### Environment variables

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Safe to expose — RLS is what protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS entirely. Never prefix with `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | **server only** | Conference lookup. Set a monthly spend cap in the Anthropic Console |
| `INVITE_CODE` | server only | Hashed into `app_settings` on seed |
| `CURATOR_EMAIL` | server only | Seeded as the first approved curator |

> Any secret that reaches the browser is compromised. `NEXT_PUBLIC_` is the tripwire —
> if you're adding it to a variable name, stop and reconsider.

### Database setup

```bash
supabase link --project-ref <your-ref>
supabase db push          # applies migrations in supabase/migrations/
npm run seed              # loads the conference catalog + curator account
```

### Run

```bash
npm run dev     # http://localhost:3000
npm run build   # must pass before any commit
npm run lint    # must pass before any commit
```

---

## Architecture

### Security model — read this before touching the database

**Row Level Security is the entire security boundary.** There is no middleware layer
enforcing permissions and no server-side gatekeeping on reads. The anon key is public by
design; what stops a member reading another member's data is the RLS policy on the table.

Consequences:

- A missing or wrong RLS policy is a data breach, not a bug.
- Any new table needs policies written *with* the table, in the same migration.
- The service role key bypasses RLS completely. It's used for exactly three things:
  signup (after invite-code check), seeding, and the AI lookup route. Nothing else.
- Client-side checks are UX, never security. Assume every client is hostile.

### Visibility rules

The one piece of logic worth understanding before reading any code. Each member has a
global setting:

- **`all_members`** *(default)* — my conferences are visible to any approved member
- **`co_attendees`** — visible only to members attending the same conference

On a conference page: **the attendee count is always the true total**, but names shown
are only the `all_members` attendees — plus, if the viewer is also attending, everyone.
So a non-attendee can legitimately see "9 going" with 6 names listed. That's intended.
Do not "fix" it by making the count match the names.

Full rules in `CLAUDE.md` §7. There's a repeatable verification script under
`supabase/` — run it after any change to these policies.

### Why localStorage, not cookies

Auth tokens live in localStorage via `@supabase/supabase-js` with PKCE. **Do not migrate
to `@supabase/ssr` or cookie-based sessions.** The app is designed to eventually run
inside an iframe in CREW's Circle community, where third-party cookies are unreliable or
blocked outright. This constraint shapes several architectural choices and is not
negotiable without revisiting the whole deployment plan.

Related: no `X-Frame-Options: DENY`, no top-level-navigation assumptions, and every
screen must work at narrow widths.

### AI conference lookup

When a member adds a conference not in the seeded catalog, a server route calls Claude
Haiku with web search to fill in dates, city, venue, and URL. The member confirms or
edits before it's saved, and it's stored as `verified=false`.

Guardrails (all in `CLAUDE.md` §9, all mandatory):

- Server-side only. The API key never reaches the client.
- Approved-member sessions only.
- 10 lookups per member per day, 40 per day globally.
- Aggressive caching — the same query must never hit the API twice.
- Kill switch in `app_settings.ai_enabled`, toggleable from `/admin`.
- Hard monthly spend cap set in the Anthropic Console — the one guardrail that survives
  a bug in the code above.

**The manual entry path must always work.** The AI is a convenience. If it fails, is
disabled, or is rate-limited, the member falls through to a form and never sees an error.

Roughly $0.034 per lookup at current pricing.

---

## Project layout

```
CLAUDE.md              Product spec — the source of truth
AGENTS.md              Short pointer file for AI coding tools
README.md              This file

src/
  app/                 Next.js App Router
    page.tsx           Home — the core loop. The screen that matters.
    login/             Invite code + magic link
    pending/           Awaiting approval
    onboarding/        Name → conferences → payoff → optional profile
    c/[slug]/          Conference detail + roster
    m/[id]/            Member card (deliberately thin)
    me/                Profile, visibility, sign out
    admin/             Curator: approval queue, AI kill switch
    auth/callback/     Magic link handler
    api/               Server routes (signup, AI lookup)
  styles/tokens.css    ALL colors and type scale. One file, on purpose.

supabase/
  migrations/          Schema + RLS. Policies live with their tables.
  VERIFY.md            Manual verification walkthrough

scripts/seed.ts        Conference catalog + curator account
reference/             Wireframe, seed data, original build prompts
```

---

## Conventions

- **Design tokens are centralized.** Every color and type value lives in
  `src/styles/tokens.css`. Never hardcode a hex value in a component — the CREW brand
  palette is expected to change and it must be a one-file edit.
- **Mobile first.** Most pilot users will open this on a phone, standing in a hallway at
  a conference. Desktop is the secondary case.
- **No new dependencies without a reason** that survives being written down.
- `npm run build` and `npm run lint` must pass before any commit.
- Migrations are append-only once applied to the deployed database.

---

## Testing what matters

Two checks carry disproportionate weight:

1. **Visibility rules.** Run the verification script in `supabase/`. It seeds test
   members with mixed settings and prints a grid of who-sees-what. A bug here is a
   privacy incident, not a glitch.
2. **A pending member reads nothing.** Sign up with a second real email, don't approve
   it, and confirm every table returns zero rows. `supabase/VERIFY.md` has the steps.

---

## Deployment

Vercel, connected to this repo, deploying from `main`. Set every environment variable in
the Vercel dashboard — with `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` scoped
to server-side only. Supabase migrations are applied separately via `supabase db push`;
they are not part of the Vercel build.

---

## Roadmap

| | | |
|---|---|---|
| M1 | Auth, schema, RLS, admin approval | ✅ Complete |
| M2 | Core loop: home, conference detail, onboarding, member-added conferences | 🔨 In progress |
| M3 | Meetups — poll → confirm, un-attend cascade, official flag | Not started |
| M4 | Calendar views, member cards, digest emails | Not started |

**Explicitly out of scope**, and likely to stay that way: in-app messaging, photo
uploads, a "considering" attendance state, session-level matching, calendar sync,
capacity caps, rich profiles, monetization, native apps. See `CLAUDE.md` §14 — several
of these were considered and deliberately rejected, so proposing them means re-opening a
settled decision rather than raising a new idea.

---

## Known gaps

- **Approval notification emails are stubbed.** Approved members aren't told
  automatically; the curator contacts them directly. Fine at 16 users, not beyond.
- **Design tokens are placeholder navy.** Real CREW brand values pending.
- **No automated test suite yet.** Verification is currently script-driven and manual.
- **No CREW member data.** Everything in the seed catalog is public conference
  information. No real member names, emails, or attendance data exist in this repo, and
  none should be added until CREW grants permission.

---

## Contributing

The pilot is a single-maintainer project, but if you're picking it up:

1. Read `CLAUDE.md` in full. It's long, and it will save you from re-litigating
   decisions that already have answers.
2. Check the roadmap before building — several obvious features are deliberately absent.
3. When the spec is ambiguous, resolve toward the core loop, then update `CLAUDE.md` to
   record what you decided. An unrecorded decision gets re-made differently later.

---

## License

Private. Not licensed for redistribution.
