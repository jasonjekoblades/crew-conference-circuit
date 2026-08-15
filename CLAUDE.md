# CREW Conference Circuit — Build Specification

This file is the source of truth for this project. Read it fully before writing code.
When a decision isn't covered here, ask rather than invent.

---

## 1. What this is

A private web app for members of CREW, an executive peer community. Members mark
which industry conferences they're attending, see which other members will be there,
and organize meetups on the ground.

It is a **proof of concept**, capped at 16 approved users, run by a single member
(not by CREW itself). It is not connected to CREW's Circle community. It may be later,
so build in a way that doesn't foreclose that (see §11).

**The core loop:** open the app → tap the conferences you're attending → see who else
is going → coordinate a dinner.

**The thing that makes it fail:** nobody enters their conferences. Every design decision
below is subordinate to making input take under 60 seconds and feel rewarding.

---

## 2. Non-negotiable constraints

1. **No passwords.** Magic-link email auth only. These are senior executives; a password
   form loses a meaningful share of them.
2. **Mobile-first.** The primary use is a phone in a conference hallway. Desktop is
   secondary but must not look broken.
3. **Iframe-safe from day one.** This may eventually be embedded in Circle. Use
   token-in-localStorage auth, not cookie sessions. No dependency on a top-level nav.
   Layout must survive a 380px-wide embed.
4. **Never build messaging.** Members message each other on CREW's own platform.
   Contact affordances are outbound links only.
5. **Member records are keyed on the email address they use for CREW.** This is what makes
   a future SSO migration a mapping exercise instead of a data re-entry project.
6. **The Anthropic API key is never exposed client-side.** See §9.

---

## 3. Stack

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres, magic-link auth, Row Level Security)
- Resend for transactional email
- Vercel hosting
- PWA manifest so it installs to a home screen. No native app, no app store.

Prefer boring, well-documented choices over clever ones throughout.

---

## 4. Design direction

Understated and executive. Serif headings, navy, generous whitespace, hairline rules.
No gradients, no bright accents, no emoji in the UI. It should feel closer to a
well-made internal tool than a consumer social app.

### Tokens

> **⚠ PLACEHOLDER VALUES.** These approximate CREW's brand from their public site.
> Replace with real values before the pitch build — the audience for this app owns
> that brand and will notice.

```
--ink:     #101E33   /* primary navy, headings, filled states */
--ink-2:   #2A3C57   /* secondary text, avatars */
--slate:   #68788F   /* meta text, labels */
--line:    #DEE4EC   /* hairlines, borders */
--paper:   #EEF1F5   /* app background */
--card:    #FFFFFF
--brass:   #A8791F   /* accent — used ONLY to mark "you". Nothing else. */
```

Type: Newsreader (or similar transitional serif) for headings and conference names;
Inter for body, labels, and data. Section labels are 11px, uppercase, 0.14em tracking.

Avatars are **initials only** — colored circle, white letters. No photo uploads anywhere
in v1. The current user's avatar uses `--brass`; everyone else uses `--ink-2`.

A static wireframe of the intended look exists at `/reference/wireframe.html`.
Match its density and restraint.

---

## 5. Data model

```sql
members
  id, email (unique, lowercased), name, title, company, linkedin_url,
  status            -- 'pending' | 'approved' | 'rejected'
  visibility        -- 'all_members' | 'co_attendees'   DEFAULT 'co_attendees'
  is_curator        -- boolean, default false
  created_at, approved_at

conference_series           -- year-over-year identity
  id, name, slug, category, website, aliases (text[])

conferences
  id, series_id, year, name, start_date, end_date, city, country, website,
  category,
  status            -- 'published' | 'pending_review'
  source            -- 'seed' | 'member' | 'ai'
  verified          -- boolean; false until curator confirms dates
  created_by, created_at

attendances
  id, member_id, conference_id, note (text, nullable), created_at, updated_at
  UNIQUE (member_id, conference_id)

meetups
  id, conference_id, host_id, title, location (text, nullable),
  state             -- 'polling' | 'confirmed' | 'cancelled'
  confirmed_slot_id (nullable), created_at

meetup_slots
  id, meetup_id, starts_at, label

meetup_votes
  id, meetup_id, slot_id, member_id
  UNIQUE (meetup_id, slot_id, member_id)

meetup_rsvps
  id, meetup_id, member_id, status   -- 'going' | 'out'
  UNIQUE (meetup_id, member_id)

ai_lookups                  -- audit + rate limiting
  id, member_id, query, result (jsonb), cached (bool), created_at

conference_cache            -- normalized name -> enrichment result
  id, normalized_query (unique), result (jsonb), created_at

app_settings                -- key/value
  key, value                -- 'ai_enabled', 'user_cap', 'invite_code_hash'
```

Notes:
- There is **no attendance status field.** Presence of an `attendances` row means going.
  "Considering" was cut deliberately — do not add it back.
- `conference_series` exists so that January doesn't require re-entering the catalog.
  Money20/20 2026 and Money20/20 2027 are two `conferences` rows sharing one series.
- `aliases` on the series is what powers duplicate detection.

---

## 6. Auth and access control

**Sign-up flow:**
1. Visitor enters email + invite code (code is shared in the CREW community post).
2. Wrong code → generic failure. Don't reveal whether the email exists.
3. Correct code → `members` row created with `status='pending'`, curator notified by email.
4. Curator approves in `/admin` → member receives a magic link and can sign in.
5. **Hard cap:** if approved member count >= `user_cap` (default 16), new requests are
   accepted but held, and the requester sees a message saying the pilot is full.

**Session:** Supabase magic link. Store the token in localStorage, not cookies, so the
app works inside an iframe.

**Every route except `/login` and `/pending` requires an approved session.**
Enforce this in Postgres RLS, not only in the app layer. A member with `status='pending'`
can read nothing.

---

## 7. Visibility rules — implement exactly

Each member has one global setting:

- `all_members` — my conferences are visible to any approved member
- `co_attendees` — my conferences are visible only to members attending that same
  conference **(default)**

There is no "private" state. If a member doesn't want their attendance known, they
don't add the conference.

**On a conference page, viewer V looking at conference C:**

- **The attendee count is always the true total**, regardless of visibility.
- **Names shown** = attendees with `visibility='all_members'`, plus — only if V is also
  attending C — every other attendee of C.
- So a non-attendee may see "9 going" with 6 names listed. This is intended. Do not
  fudge the count to match the visible names.

**On a member page, viewer V looking at member M:**

- If `M.visibility='all_members'` → show all of M's conferences.
- If `M.visibility='co_attendees'` → show only conferences V and M both attend.

**Meetups are visible only to attendees of the parent conference.** No exceptions.

Write tests for this section. It's the part where a bug is a privacy incident rather
than an inconvenience.

---

## 8. Screens

### `/login`
Email + invite code. Below the form, a live teaser: three conferences with attendee
counts only, no names. This is the hook — show that the room isn't empty.

### `/pending`
Holding state. Plain, no spinner theater. "Your request is with the organizer."

### `/onboarding`
Name, title, company, LinkedIn URL (optional), visibility choice.
Explain the two visibility options in one plain sentence each — don't make people
guess what `co_attendees` means. Then drop them straight into `/`.

### `/` — the year grid (the centerpiece)

Two sections:

1. **Where CREW is going** — conferences with ≥1 attendee, grouped by month,
   chronological. This is the default and the bulk of the screen.
2. **Browse all** — collapsed by default. Seeded conferences with zero attendees.
   Exists so a new member always has something to tap.

Each row: conference name (serif), dates + city (small, slate), overlapping initial
avatars, count, and a check circle.

- **Tapping anywhere on the row toggles attendance.** No modal, no save button.
  The row fills, the avatar slides in, the count increments. That immediate feedback
  is the entire reason this design works.
- A small chevron on the right opens the detail page. Keep its tap target clearly
  separate from the row toggle.
- Filter chips at top: All / Payments / Tech / Healthcare / Retail / Mine.
- A search field that doubles as "add a conference" (see §9).

### `/c/[slug]` — conference detail
Header: name, dates, city, website link. Primary button toggles attendance.
If attending, an inline field for the free-text note ("In Sun–Wed, free Tuesday evening").
Then the roster per §7 rules, then meetups.

### `/m/[id]` — member card (deliberately thin)
Name, title, company, initials avatar, shared/visible conferences per §7, and an
outbound LinkedIn link. **No bio, no photos, no messaging, no activity feed.**
This is a footnote, not a directory.

### `/calendar`
Two toggles: **Mine** and **All CREW**.
- Desktop: month grid with multi-day bars.
- Mobile: heavily pared down — compact month with dots on days that have conferences;
  tapping a day lists them below. Do not attempt bars in a 380px grid.

### `/me`
Profile fields, visibility setting, list of your conferences with notes, sign out,
and a working "delete my account and data" button.

### `/admin` (curator only)
Member approval queue · conference review queue (unverified entries) · duplicate merge
tool · AI kill switch · user cap. Functional, not pretty.

---

## 9. Adding conferences + AI enrichment

**The member is the primary source; AI is the verifier.** This ordering was established
empirically — in the initial seed pass a member supplied seven conferences from memory
and was correct on six, while AI lookup and third-party aggregators were the less reliable
inputs. Do not invert this.

**Flow:** member types a conference name **and its dates** into the add form. Then:

1. **Duplicate check first, always.** Fuzzy-match against existing `conference_series`
   names and `aliases`. If a likely match exists, show it and ask "Did you mean
   Money20/20 USA?" before creating anything. *This matters more than the lookup does* —
   a split roster is the failure mode that makes the app look broken.
2. **Match on dates, not just name.** Organizers run near-identically named events in
   different cities and months — Reuters Events alone runs Momentum AI Austin, Momentum
   AI New York, and Momentum AI Finance. In testing, a member's event name matched the
   *wrong* event while their dates matched the right one. When name and date disagree,
   **surface both candidates and let the member choose.** Never silently resolve on name.
3. **AI lookup as verification.** Server route calls Anthropic with web search to confirm
   dates, city, venue, and official URL. **Weight the organizer's own domain heavily**;
   treat listing and aggregator sites as corroboration only — they were wrong or vague on
   several entries during the seed pass.
4. **Disagreement is surfaced, not resolved.** If AI-found dates differ from the member's,
   show both and flag for curator review. Do not overwrite the member's entry.
5. **Low confidence → ask for a URL.** Prompt the member to paste the conference website,
   then extract from that page only.
6. The conference is created with `verified=false` and displays an **"unverified"** marker
   until the curator confirms it in `/admin`.

Dates must never silently be wrong — someone books a flight off this. The unverified
marker is not optional.

### API key guardrails — implement all of these

- Key lives in `ANTHROPIC_API_KEY`, server-side only. **Never** `NEXT_PUBLIC_*`.
  All calls go through one server route. No client ever touches the key.
- Route rejects any request without an approved member session.
- **Per-member limit:** 10 lookups per rolling 24h.
- **Global limit:** 100 lookups per day across all users.
- **Kill switch:** `app_settings.ai_enabled`. When false, the route returns immediately
  and the UI falls back to manual entry. Toggleable from `/admin`.
- **Cache aggressively:** normalize the query (lowercase, strip punctuation) and check
  `conference_cache` before every call. Repeat conferences must never re-call the API.
- Model: Claude Haiku. `max_tokens: 400`. Input capped at 120 characters.
- Reject inputs that don't look like a conference name (excessive length, code, prompt-like
  text) before spending a call.
- Log every call to `ai_lookups`, cached or not.
- **Backstop:** set a hard monthly spend limit in the Anthropic Console. This is the one
  guardrail that doesn't depend on the code above being correct.

---

## 10. Meetups

**Meetups and polls are one object, not two.** A meetup is created in `polling` state.

1. Any attendee of a conference can create a meetup: title, optional location,
   and 3–5 proposed time slots.
2. Other attendees check every slot that works for them (multi-select, not single).
3. The **host** — whoever created it — locks a slot. State becomes `confirmed`.
4. On confirmation, everyone who voted for the winning slot is auto-RSVP'd `going`.
   They can drop out.
5. No capacity caps in v1. Groups sort that out themselves.

Any meetup may be flagged **official** by a curator. This is a badge and nothing else —
no permissions attached. There is no attendee-count threshold logic anywhere.

**Un-attending cascade:** when a member removes a conference, silently delete their
votes and RSVPs for meetups there. **Exception:** if they host a meetup, block the
removal and make them either hand off the host role to another attendee or cancel
the meetup first.

---

## 11. Circle compatibility (build for it, don't build it)

Do not integrate with Circle now — it requires an admin's cooperation and a paid API tier.
Just don't foreclose it:

- Members keyed on CREW email (§2.5)
- Token auth, iframe-safe (§2.3)
- Keep auth logic in one module so it can be swapped for SSO later
- No profile data that would need migrating — that's why member pages are thin

---

## 12. Email (Resend)

Required: magic link, "you've been approved."
Milestone 4: weekly digest of new attendees on your conferences; a single nudge three
weeks before a conference with ≥3 attendees and no meetup, with a one-tap link to
propose one.

That nudge email is probably responsible for most of the value the app produces.
Every non-transactional email needs a working unsubscribe.

---

## 13. Seed data

**Use `/reference/seed-conferences.json`.** Fifteen conferences across fifteen series —
every date, city, and venue checked against the organizer's own domain — plus the
founding member's attendance across seven of them.

**Seed the founding member's attendance before opening signups.** The first user to arrive
must see a populated app with a name they recognize on it, not an empty list. This is the
single highest-leverage thing in the launch sequence.

The seed contains three deliberate test cases. Use them; don't clean them up:

- **Skift Global Forum 2026 and Skift Meetings Forum 2026** share a venue *and* a start
  date. Hardest dedupe case in the file.
- **Momentum AI Finance and Momentum AI New York** are near-identically named Reuters
  events six months apart. Anyone typing "Momentum AI NYC" must be shown both.
- **HITEC North America 2027** is deliberately left `verified=false` — its dates came from
  aggregators only. It's the live example of the unverified marker rendering.

Expand to 30–50 before opening signups, using the coverage gaps in the seed file's `_todo`.
**Verify every addition against the organizer's own site.** Do not invent dates.

### Categories (corrected)

The founding member's mix spans CRM, enterprise AI, private equity, pharma, fintech, and
cloud. CREW's wider membership is heaviest in **payments and travel**, so those two
categories should end up the deepest in the catalog even though they aren't where the
founding member's own conferences sit. Filter chips:

`AI & Data` · `Enterprise Tech` · `Cloud & Infrastructure` · `Fintech & Payments` ·
`Private Equity & Finance` · `Healthcare & Pharma` · `Travel & Hospitality`

plus `All` and `Mine`.

---

## 14. Explicitly out of scope

Do not build these, even if they seem like natural extensions:

- In-app messaging or chat of any kind
- Photo uploads or avatars beyond initials
- A "considering / maybe" attendance state
- Session- or agenda-level matching within a conference
- Meeting schedulers, calendar sync, or .ics feeds
- Capacity caps, waitlists, or cost splitting on meetups
- Attendee-count thresholds for meetup permissions
- Rich member profiles, bios, activity feeds, or follower graphs
- Sponsors, ads, or anything monetized
- Native mobile apps

---

## 15. Build order

**M1 — Skeleton.** Next.js + Supabase + Tailwind. Schema and RLS. Magic-link auth,
invite code, pending state, admin approval queue. Deployed to Vercel.

**M2 — The core loop.** Seed the catalog. Year grid with tap-to-toggle. Conference
detail with roster. Visibility rules with tests. This is the point where the app is
genuinely usable and worth showing someone.

**M3 — Meetups.** Poll → confirm state machine. Un-attend cascade. Official flag.

**M4 — Everything else.** Calendar views. AI conference add with full guardrails.
Member cards. Digest and nudge emails.

Do not start M2 until auth and RLS are verified working. Do not start M4 until a real
person has used M2 and entered at least one conference.

---

## 16. Security checklist

- [ ] Repo is **private** on GitHub from the first commit
- [ ] `.env` gitignored; secrets only in Vercel environment variables
- [ ] RLS policies written by hand and read line by line — not accepted unreviewed.
      A mistake here means every member can read every other member's travel plans.
- [ ] Visibility rules (§7) covered by tests
- [ ] Anthropic key server-side only, spend limit set in Console
- [ ] Privacy policy and terms pages, even for a PoC
- [ ] Working account-and-data deletion
- [ ] Rate limiting on the magic-link endpoint
- [ ] No real CREW member data in seed files, fixtures, or commits
