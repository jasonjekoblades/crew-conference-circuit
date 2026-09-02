# Handoff to CREW

This repository is a working prototype of a conference-overlap tool for CREW members.
It is being handed off to CREW's team to be rebuilt properly inside CREW's own platform
(Circle) — not run as-is. This file is the starting point for that rebuild.

---

## What this is

Members mark which conferences they're attending, and immediately see which other
members are going to the same ones. That single loop — mark a conference, see who else
is going — is the entire product. Meetup coordination is designed but not built (see
"Deliberately out of scope" below); everything else in the app supports the core loop.

---

## Read in this order

1. **This file.**
2. **`CLAUDE.md`** — the full product specification and the reasoning behind every
   design decision. Long, but each decision is stated with the reasoning that produced
   it, which is more useful than the conclusion alone.
3. **`README.md`** — setup and architecture: how to run it, the data model, the security
   model, and the project layout.

---

## What to keep

- **The product decisions in `CLAUDE.md`.** Roughly two dozen of them, each with the
  reasoning behind it. This is the most valuable thing in the repository — more valuable
  than the code itself, since the code will be rebuilt but the reasoning transfers
  directly.
- **Conferences-first onboarding.** Ask a new member for the conferences they're
  attending before asking for anything else, and show the payoff — who else is going —
  immediately afterward. Profile fields, if any, come later or not at all. This ordering
  is what makes the core loop land in under a minute; reversing it (profile first, payoff
  later) was tried in an earlier design and produced worse first-run engagement.
- **Duplicate detection**, including matching on event dates as well as event name. See
  "Conference data lessons" below — this exists because of specific, reproducible
  failures, not general caution.
- **The seeded conference catalog and its verification standard**: every entry checked
  against the organizer's own domain rather than an aggregator listing.
- **AI-assisted conference lookup**, including its guardrails: the API key is
  server-side only, there are per-member and global rate limits, results are cached
  aggressively, there's an application-level kill switch, and a hard spend cap is set
  outside the application (in the API provider's own console). Keep all of these even if
  the surrounding UI is rebuilt — the guardrails cost little and the failure mode without
  them (an exposed key, an unbounded bill) is expensive.

## What to throw away

**The entire access model.** Invite code, anonymous sessions, typed-name identity —
none of it should be carried into a CREW rebuild. It exists only because the prototype
had no identity system to draw on. Inside CREW, identity is already solved, and every
mechanism built to work around its absence (the invite-code gate, session recovery by
picking a name from a list, the onboarding friction this created) disappears with it.

**No per-member visibility settings.** Every member sees every other member's
conferences, by name — there is no privacy toggle. This was designed with two visibility
modes and partial name lists first, then cut: it was the most bug-prone part of the
design and protected almost nothing, since a member who doesn't want a conference known
simply doesn't add it. Worth reconsidering only if actual members ask for it — don't
rebuild it preemptively.

**No email, no notifications.** The prototype sends no message of any kind. That was a
direct consequence of having no identity system; inside CREW, any notifications this
needs should go through Circle's existing channels rather than a new one built for this
feature.

**No messaging.** Members already message each other on CREW's own platform. This tool's
job is to tell a member *that* they should reach out, never to be a second inbox.

## Deliberately out of scope

Not built, and each one considered and set aside rather than overlooked:

- **Meetup coordination.** The natural next step — someone proposes drinks Tuesday at a
  conference, other attendees vote on a time, one slot is confirmed. Fully designed
  (`CLAUDE.md` §10) but not built. The prototype scoped itself to proving the first half
  of the idea: knowing who's there.
- **Calendar view.** A month grid of everyone's travel. A list already answers "who's
  going where"; the grid is a prettier way to show the same answer, not a more useful
  one.
- **Session-level matching.** Knowing two members are at the same conference is useful.
  Knowing they're in the same breakout session is a much harder data problem for a
  smaller payoff.
- **A "considering" attendance state.** Going or not going. A maybe list adds noise and
  makes every roster less trustworthy.
- **Profile fields** — title, company, LinkedIn. Cut because CREW's own member profiles
  already supply this; building a parallel profile system for the prototype would only
  have created something to migrate away from.

---

## The Circle constraint — check this first

CREW's community runs on Circle. Circle's Headless API and Auth API require a Business
plan; the Data API requires an enterprise tier. **Which plan CREW is on determines
whether this becomes an embed or a native build**, and that decision shapes almost every
other choice in the rebuild. Establish this before anything else.

The prototype was built iframe-safe throughout in case embedding turned out to be the
answer: auth tokens in localStorage rather than cookies (third-party cookies are
unreliable or blocked inside an iframe on another domain), no frame-blocking headers, and
a mobile-first layout that survives a narrow embedded width. None of these constraints
apply to a native build — but they were deliberate engineering choices made for a
specific deployment shape, not defaults, which is worth knowing before assuming they can
simply be dropped.

---

## Conference data lessons

These came from building the seed catalog and watching real conference-adding attempts,
not from general principle. They are easy to lose when rebuilding from a clean slate.

- **The member is the primary source; AI is the verifier, never the reverse.** In
  testing, a member supplied seven conferences from memory and was correct on six of
  them — more reliable than AI lookup or third-party aggregator listings for the same
  events.
- **Organizer domains beat aggregator listings.** Aggregators were wrong repeatedly
  during testing — one placed a real conference at the wrong venue entirely. Weight the
  organizer's own site heavily; treat aggregator and listing sites as corroboration only.
- **Near-identical event names are the real hazard, more than typos.** Reuters Events
  alone runs Momentum AI Austin, Momentum AI New York, and Momentum AI Finance — distinct
  events, similar names. In testing, a member's typed event name matched the *wrong* one
  of these while their typed dates matched the *right* one. **Match on dates as well as
  name, and when the two disagree, surface both candidates instead of resolving
  silently.** This is the single most important lesson here.
- **Split rosters are the failure mode that makes the tool look broken** — the same
  real-world conference existing as two separate entries, with attendees split across
  both. Duplicate detection is what prevents this, and it matters more than it looks like
  it should from the outside.
- **Wrong dates are the one unrecoverable error.** Someone books a flight off this data.
  A conference added from an unverified source should be visibly marked as such until
  confirmed.

---

## Operating cost

Measured figures, not projections: roughly **2¢ per AI-assisted conference lookup**
(Claude Haiku plus web search). Supabase and Vercel free tiers covered the entire
prototype's usage without needing a paid tier.

**Actual usage, pulled directly from the live database:**

| | |
|---|---|
| Sessions that entered and got past the access gate | 24 |
| Of those, sessions that completed setup with a name | 6 |
| Conferences with at least one member attending | several, 16 attendance records total |
| Conferences added by a member rather than pre-seeded | 1 |
| AI-assisted lookups actually performed | 0 |

Two things worth knowing about these numbers before drawing conclusions from them: most
of the 24 sessions cluster in short bursts on the two days the prototype was being built
and tested, which is development activity rather than distinct people trying the tool.
Real, spread-out usage — sessions on separate days, by different named members — accounts
for a small handful of the total. And the AI lookup feature has zero recorded calls in
production; the one member-added conference above was entered manually. The 2¢ figure is
a development-time cost measurement, not a cost the prototype has actually incurred in
use.

Read this as: the mechanics work end-to-end and nothing broke under real use, but the
usage volume is far too small to draw conclusions about member interest from it.

---

## Known issues

- **One member-added conference is awaiting curator verification** — normal workflow
  state (an unverified marker shows until confirmed), not a defect.
- **One seeded conference is deliberately left unverified** as a working example of the
  unverified-marker behavior — intentional, not an oversight.
- **A small number of sessions entered the access gate but never completed setup** (no
  name recorded). Not investigated further; noted only because it means "sessions
  created" and "members" are not the same count if you're reading the database directly.
- **The admin/curator panel is not at the URL `CLAUDE.md` and `README.md` describe.**
  It was relocated late in development for obscurity, and the spec documents predate
  that move. `README.md`'s "Known gaps" section has the current URL.

No other defects are currently known. An earlier add-flow bug (members hitting a dead
end when the duplicate-conference warning appeared) was found and fixed during
development; it does not affect the current build.
