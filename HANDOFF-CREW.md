# Handoff to CREW — start here

You're a developer at CREW picking this up cold. This file exists so you don't have to
reconstruct decisions from commit history. It doesn't contain setup instructions —
`README.md` has those.

**Read in this order:**
1. **`CLAUDE.md`** — the full spec and, more importantly, the reasoning behind every
   product decision. Long, but it will save you from re-litigating settled arguments.
2. **`deferred-features.md`** — everything cut, and why. Read this before you write any
   code, or you will rebuild something that was deliberately removed.
3. **This file** — what to keep, what to throw away, and the lessons that don't live in
   code.
4. **`README.md`** — how to actually run it.

---

## What this is, and what it proved

A proof of concept built by one CREW member (not CREW itself), to test a single
question: if members could see who else was going to the same conferences, would they
actually use it?

It is not connected to CREW's Circle community, has no real member data beyond a small
pilot group, and was never meant to be the production version — it exists to make the
idea concrete enough to evaluate.

**Honest usage numbers**, pulled directly from the live database on 2026-09-02, not
estimated:

| | Count |
|---|---|
| Anonymous sessions created (entered the invite code) | 24 |
| Members who completed onboarding (have a name) | 6 |
| — of which are real pilot participants (not the founder, not a blank test session) | 3 |
| Conferences with at least one attendee marked | multiple, 16 attendance rows total |
| Member-added conferences | 1 (AI lookup was never actually invoked — see below) |

Context that matters more than the raw numbers: the 24 sessions are not 24 distinct
people who tried the app. Most of them cluster in tight bursts on 2026-08-21 and
2026-08-22 — the two days the app was being built and tested — which is developer
testing, not pilot usage. The real usage is spread thin: one founding member (seeded with
7 conferences), then three more named members joining on three separate days
(2026-08-27 ×2, 2026-08-31) over the following ten days, two of whom added conferences
of their own (2 and 7 respectively) and one who joined but added none. Two more sessions
entered the invite code and never got past naming themselves.

**Read this as:** the core loop works mechanically and a handful of real people used it
without anything breaking, but this is nowhere near enough usage to say the idea is
validated. It's a working demo, not evidence of product-market fit. Treat the pitch
framing in `deferred-features.md` accordingly — "try it" is still the honest first ask.

One more data point: the AI conference-lookup feature has **zero recorded calls** in the
live database. The one member-added conference was entered manually. Everything said
below about AI lookup cost and behavior comes from development-time testing, not pilot
usage — it has not yet been exercised by a real user in production.

---

## What to keep

- **The product decisions in `CLAUDE.md`.** Not just the conclusions — the reasoning.
  Several designs (visibility, profiles, meetups) were built in a more elaborate form
  first and cut after turning out to be the buggiest, highest-risk part of the spec.
  That history is why the current design looks minimal; it isn't unfinished, it's
  post-simplification.
- **The conferences-first onboarding flow.** Name, then conferences, then show the
  payoff immediately. The ordering is deliberate: a new member has to see another
  member's name next to a conference before they're asked for anything else.
- **The duplicate-detection approach.** Fuzzy-match on name against `conference_series`
  and its `aliases`, but treat date agreement as equally important as name agreement, and
  surface ambiguity to the member instead of silently resolving it. See "conference data
  lessons" below — this exists because of real failures, not caution for its own sake.
- **The seeded conference catalog and its verification standard**: every entry checked
  against the organizer's own domain, not an aggregator. Cheap to maintain, expensive to
  get right the first time, worth preserving that standard rather than relaxing it.
- **The AI lookup design, guardrails included**: server-side only key, per-member and
  global rate limits, aggressive caching, a kill switch, manual entry as the path that
  always works regardless of AI state. These guardrails cost little and the failure mode
  without them (an exposed key, an unbounded bill) is bad enough to keep all of them even
  if you rebuild the surrounding UI.

## What to throw away

**The entire access model.** Invite code, anonymous Supabase sessions, typed-name
"relinking" to recover identity, the member cap. All of it exists for one reason: there
was no identity system available to a single member building outside CREW's platform.
Inside CREW, identity is already solved — every one of these mechanisms should disappear,
not be adapted. Don't try to preserve the invite-code gate as a feature; it was a
workaround, not a design choice anyone would make with real auth available.

Concretely, this means: no `members.auth_user_id` reconciliation dance, no anonymous
auth, no "pick your name from a list" recovery flow, no hard-coded member cap. Identity
resolution becomes "this is CREW user #4231," full stop.

---

## The first thing to check: which Circle plan CREW is on

The community runs on Circle. Circle's **Headless API and Auth API require a Business
plan**; the **Data API requires an enterprise tier**. This determines the entire shape of
the rebuild before any other decision matters:

- If CREW has API access at the right tier, this can be a genuine embed — native
  identity, no separate auth system, no separate member list.
- If not, this becomes a native build against whatever Circle exposes at the current
  plan (or a standalone app that links out to Circle), which is a different project with
  different tradeoffs.

Check this first. It changes the answer to almost every other question in this file.

---

## Why the app is iframe-safe, and why that mattered here

Every architectural choice below was made because this PoC might end up embedded in
Circle, and needed to not foreclose that:

- **Auth tokens live in localStorage, not cookies.** Third-party cookies are unreliable
  or blocked outright inside an iframe on another domain; localStorage isn't.
- **No frame-blocking headers** (no `X-Frame-Options: DENY`), and no assumption of a
  top-level navigation bar.
- **Mobile-first throughout**, including surviving a 380px-wide embed.

**If you build natively inside Circle** (i.e., not as an iframe), none of these
constraints apply anymore — you can use normal cookie sessions, you're not fighting frame
width, and you should feel free to drop all of it. The point of flagging this is so you
know these were deliberate engineering choices in service of a specific deployment shape,
not defaults — so you don't spend time puzzling over why auth doesn't use cookies before
realizing you don't need to preserve it.

---

## Conference data lessons

These came from actually building the seed catalog and watching members add conferences,
not from principle. They're easy to lose if you're rebuilding from a clean slate — write
them into whatever replaces this system.

- **The member is the primary source; AI is the verifier, never the reverse.** During
  seeding, a member supplied seven conferences from memory and was correct on six of
  them. AI lookup and third-party aggregator listings were less reliable than that. Don't
  build a system that lets AI silently overwrite what a member typed.
- **Organizer domains beat aggregator listings.** Aggregators were wrong repeatedly
  during testing — one placed Fintech Meetup at the wrong venue entirely. Weight the
  organizer's own site heavily; treat listing/aggregator sites as corroboration only.
- **Near-duplicates are the real hazard, more than typos.** Reuters Events alone runs
  Momentum AI Austin, Momentum AI New York, and Momentum AI Finance — near-identical
  names, different cities and months. In testing, a member's typed event name matched the
  *wrong* one of these while their typed dates matched the *right* one.
  **Match on dates, not just name, and when the two disagree, surface both candidates
  instead of resolving silently.** This is the single most important lesson in this list.
- **Split rosters are the failure mode that makes the app look broken.** If the same
  real-world conference exists as two separate rows because a duplicate wasn't caught,
  attendees get split across them and the app appears to be missing people who are
  actually there. Whatever you build to replace duplicate detection, treat this as the
  failure case to design against, not an edge case to tolerate.

---

## Operating costs at pilot scale

Real measured numbers, not projections:

- **AI conference lookup: roughly 2¢ per lookup** (Claude Haiku + web search, ~$0.03
  ceiling per call at worst case with retries). Note again: this cost was never actually
  incurred in production — the live pilot has zero AI lookups on record. These are
  development-time measurements.
- **Supabase and Vercel free tiers were sufficient for the entire pilot**, at the usage
  levels above (single-digit real members, low hundreds of database rows). Neither was
  close to a paid-tier limit at any point.
- These numbers do not tell you anything about cost at CREW's actual membership scale —
  they only establish that infrastructure cost was never a constraint at pilot size.

---

## Known issues

- **Two anonymous sessions never completed onboarding** (entered the invite code, never
  supplied a name). Not investigated further — could be people who bounced, or duplicate
  attempts from the same person. Worth noting only because "sessions created" and
  "members" are not the same number, and a naive count of one will overstate the other.
- **One member-added conference (MRC London) is still unverified** in the curator review
  queue — normal workflow state, not a bug, but flagging it so it isn't mistaken for
  broken data if you inspect the database directly.
- **One seed conference (HITEC North America 2027) is deliberately left unverified** —
  its dates came from aggregators only. This is intentional (see `CLAUDE.md` §13); it's
  the live example of the "unverified" marker rendering, not an oversight.
- **A previously-open bug is now fixed and can be ignored**: an earlier build had a dead
  end in the conference add-flow (internally called "the TRANSACT dead end," after the
  conference name that surfaced it) where a disabled submit button silently ate taps
  during duplicate-detection warnings. Fixed in the commit titled "Fix add-flow dead
  ends, open pilot to ~100 people." No action needed — mentioned here only in case you
  find that phrase in old commit messages and wonder if it's still a problem.
- **The admin panel lives at `/jeko43`, not `/admin`.** This is a deliberate rename for
  obscurity (it adds no real security — the route is still gated the same way `/admin`
  was) but it means `CLAUDE.md` and `README.md`'s references to `/admin` no longer match
  the actual URL. If you're looking for the curator tools, they're at `/jeko43`.
