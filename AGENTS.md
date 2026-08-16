# AGENTS.md

Instructions for AI coding assistants working in this repository. Applies to Claude
Code, Cursor, Codex, Copilot, and anything else pointed at this repo.

## Before you write anything

1. Read **`CLAUDE.md`** in full. It is the product specification and the source of truth
   for every design decision. Despite the filename it is tool-agnostic.
2. Read **`README.md`** for setup, architecture, and conventions.

Most questions you're about to ask are answered in one of those two files.

## What this project is

A private web app letting members of a peer community see which conferences other
members are attending. Proof of concept, 16 users, invite-only.

**The core loop — a member marks conferences and sees who else is going — is the entire
product.** Meetups are secondary (`CLAUDE.md` §10). When trading off effort or
resolving ambiguity, the core loop wins.

## Hard constraints — do not violate

- **Row Level Security is the whole security model.** No middleware enforces
  permissions. Every new table needs RLS policies in the same migration. A missing
  policy is a data breach.
- **Auth tokens in localStorage, not cookies.** Do not migrate to `@supabase/ssr` or
  cookie sessions. The app must survive being iframed into a third-party community
  platform where third-party cookies are blocked.
- **No passwords.** Magic links only.
- **`SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-side only.** Never
  prefix either with `NEXT_PUBLIC_`.
- **Never hardcode colors.** Everything lives in `src/styles/tokens.css`.
- **No real member data in this repo.** Seed catalog is public conference info only.
- **Never build messaging.** Explicitly and permanently out of scope.

## The rule people get wrong

Attendee counts always show the true total, but names shown depend on each attendee's
visibility setting. A non-attendee seeing "9 going" with 6 names is **correct behavior**,
not a bug. Read `CLAUDE.md` §7 before touching anything related to this, and re-run the
verification script under `supabase/` afterward.

## Working style

The maintainer has **no coding background**. Therefore:

- Don't ask for code review. Verify things by running them and report in plain language.
- Prove, don't describe. Show actual output, not "I checked and it works."
- When you need a decision, spell out the options without jargon and recommend one.
- Say what you're unsure about.

## Before committing

- `npm run build` and `npm run lint` must pass.
- If you resolved a spec ambiguity, record the decision in `CLAUDE.md`. An unrecorded
  decision gets re-made differently by the next person or tool.
