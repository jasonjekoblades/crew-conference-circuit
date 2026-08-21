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
- **No email, no accounts, no passwords.** One shared invite code creates a Supabase
  anonymous session. Do not add signup, approval states, or notifications (§6, §12).
- **`SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-side only.** Never
  prefix either with `NEXT_PUBLIC_`.
- **Never hardcode colors.** Everything lives in `src/styles/tokens.css`.
- **No real member data in this repo.** Seed catalog is public conference info only.
- **Never build messaging or notifications.** Explicitly and permanently out of scope.

## Three things that were cut on purpose

**Email** (§6, §12), **per-member visibility settings** (§7), and **profile fields —
title, company, LinkedIn** (§8). A member is a name and a list of conferences. CREW's own
profiles supply the rest in the full version. Both were fully specced
and then deliberately removed as disproportionate for a 16-person pilot sharing public
conference schedules. Every member sees every other member's conferences by name, and
attendee counts always equal the number of names shown. If you find yourself adding a
notification, a signup flow, or a privacy toggle, stop and read those sections.

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
