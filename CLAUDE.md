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

1. **No accounts, no email, no passwords.** One shared invite code is the only gate.
   These are 16 vetted peers looking at a list of public conferences — account
   infrastructure costs more than it protects. See §6.
2. **Mobile-first.** The primary use is a phone in a conference hallway. Desktop is
   secondary but must not look broken.
3. **Iframe-safe from day one.** This may eventually be embedded in Circle. Use
   token-in-localStorage auth, not cookie sessions. No dependency on a top-level nav.
   Layout must survive a 380px-wide embed.
4. **Never build messaging.** Members message each other on CREW's own platform.
   Contact affordances are outbound links only.
5. **Members self-identify by name only.** No email is collected. A future migration to
   CREW SSO maps names to real identities once — a one-time reconciliation of 16 rows,
   which is cheaper than the email infrastructure it replaces.
6. **The Anthropic API key is never exposed client-side.** See §9.

---

## 3. Stack

- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres, anonymous auth, Row Level Security)
- No email service. The app sends no email (§12).
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
  id, auth_user_id (unique, -> auth.users.id), name,
  is_curator        -- boolean, default false
  created_at

  -- NO email. NO status. NO visibility. NO title/company/linkedin_url.
  -- Entry via invite code is the gate; there is no pending/approved state, no
  -- per-member privacy setting, and no profile fields. All cut deliberately
  -- (§6, §7, §8). A member is a name and a list of conferences, nothing more.

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
  key, value                -- 'ai_enabled', 'member_cap', 'invite_code_hash'
```

Notes:
- There is **no attendance status field.** Presence of an `attendances` row means going.
  "Considering" was cut deliberately — do not add it back.
- `conference_series` exists so that January doesn't require re-entering the catalog.
  Money20/20 2026 and Money20/20 2027 are two `conferences` rows sharing one series.
- `aliases` on the series is what powers duplicate detection.
- `members.auth_user_id` links to a Supabase **anonymous** auth user. That anonymous
  session is what RLS keys on — the security model is unchanged, only the way identity
  is established.

---

## 6. Access — invite code, no accounts

**There is no email in this app.** No magic links, no SMTP, no notifications, no
approval queue, no password. A member never receives a message from this system.

Rationale: the pilot is 16 people the curator already knows personally, sharing which
public conferences they plan to attend. Email-based auth would add SMTP configuration, a
verified sending domain, rate limits, deliverability failures against corporate mail
scanners, and an approval queue — all to protect information that is, by design, shared
with everyone who gets in. The invite code is the gate. That is proportionate.

**Entry flow:**
1. Visitor opens the app and enters the shared invite code (distributed by the curator
   directly — text, DM, or the CREW post).
2. Wrong code → generic failure, with a short delay. No hint about what's wrong.
3. Correct code → `supabase.auth.signInAnonymously()` creates an anonymous session, and
   a `members` row is created linked to that anonymous user. Straight into onboarding.
4. **Hard cap:** if member count >= `member_cap` (default 16), the code stops working
   and the visitor sees a message that the pilot is full.

**Returning members.** The session lives in localStorage and persists. If it's lost
(cleared browser, new device), the member re-enters the invite code and is shown the
list of existing members to pick themselves from — which restores their identity and
re-links the row to the new anonymous user. Also offer "I'm new here."

Yes, this means a member could pick someone else's name. Among 16 vetted peers viewing
public conference schedules, that is an acceptable risk and the honest tradeoff for
deleting the entire account system. Do not add verification to close it.

**Curator.** `is_curator` is set directly in the database by the maintainer. There is no
in-app promotion path and no self-service route to it.

**Session:** Supabase anonymous auth, token in localStorage, not cookies, so the app
works inside an iframe.

**RLS still does the work.** Every table's policies key on the anonymous `auth.uid()`
exactly as they would with email auth. Removing email removes a signup flow, not the
security model. Anyone without a valid session reads nothing.

---

## 7. Visibility — everyone sees everything

**There is no visibility setting.** Every member sees every other member's conferences,
by name. Full stop.

This was cut deliberately after being specced. The earlier design had two modes, partial
name lists, and a count that intentionally disagreed with the names shown. It was the
most bug-prone part of the spec and the highest-consequence place to get something
wrong — and it protected almost nothing, because CREW exists for members to meet each
other and the app is opt-in at the row level.

**The privacy control is not adding the conference.** A member who doesn't want their
attendance known simply doesn't add it. That is sufficient, and it is the whole model.

Consequences, all of them simplifications:

- Attendee counts always equal the number of names shown. If they ever differ, that's
  a bug, not a feature.
- `/c/[slug]` shows the full roster to any member.
- `/m/[id]` shows all of that member's conferences.
- No `visibility` column, no toggle in `/me`, no conditional logic anywhere.

**Meetups** are visible to attendees of the parent conference, plus curators read-only
so they can flag one official. This is the only remaining conditional-visibility rule
in the app — keep it simple and don't let it grow.

Do not reintroduce a visibility setting without an actual member asking for one.

---

## 8. Screens

### `/enter`
One field: the invite code. No email, no password. Below it, a live teaser — three
conferences with attendee counts only, no names. This is the hook: show the room isn't
empty before asking for anything.

On success, an anonymous session is created and the member goes straight to onboarding.
Returning members who've lost their session get a "I've been here before" link that
shows the member list to pick their name from (§6).

`/login` and `/pending` no longer exist. Delete them.

### `/onboarding` — conferences first, profile later

**This is the most important flow in the app.** A new member must reach the payoff —
seeing another member's name next to a conference — in under 60 seconds. There are no
profile fields to fill in at all. Do not ask for anything beyond a name and their
conferences.

Three steps:

**Step 1 — Name only.** One field. "What should other members call you?" Nothing else.
A name is the minimum needed for anyone else to recognize them.

**Step 2 — "What conferences are you going to?"** The seeded catalog as a tap-to-toggle
list, same interaction as the home screen. **Members must be able to add a conference
that isn't listed, right here** — the catalog is only 15 entries and hitting a dead end
at this exact moment defeats the purpose of the step. Same add flow as `/add`, AI lookup
included.

A visible **Skip for now** option, with subtext directly beneath it: *"You can add
conferences later."* Skipping must not feel like forfeiting something. Below the
list, one plain sentence: *"Other CREW members will see you're going."* That's the whole
disclosure. There is no visibility choice to present (§7) — if a member doesn't want a
conference known, they don't add it.

**Step 3 — The payoff.** Immediately after step 2, show what they just unlocked:
- *"You're going to Money20/20 with 4 other CREW members."* — names and titles listed
- For conferences where they're first: *"You're the first CREW member here. Others will
  see you when they add it."* — framed as useful, never as empty
- If they skipped: show the 3 conferences with the most attendees and a prompt to add one

**There is no step 4.** Profile fields were cut — a member is a name and a list of
conferences. Step 3 ends with a button straight to `/`. Do not add a profile step back.

In the full version this connects to CREW's own member profiles, so building a parallel
profile system now would only create something to migrate away from later.

Nothing else is asked at onboarding. No email, no visibility setting, no account
creation — the invite code was the gate and it's already been passed.

### `/` — home (the centerpiece)

**This screen is the product.** Everything else supports it. A member should open it and
immediately see the answer to "who am I going to run into?" — not a dashboard, not a
grid of options to work through. Think of it as the list this will become when it lives
inside Circle: your conferences, and who else is going to each one.

Three sections, in this order:

1. **Yours** — conferences you're attending, chronological, soonest first. Under each,
   the other CREW members going, by name. **This is the only section that matters.**
   Not a count with an expand affordance — the names, right there, on first load.
   If a conference has no one else yet: *"First one here."* Quiet, not an error state.
2. **Where CREW is going** — conferences with ≥1 attendee that you're *not* attending.
   Grouped by month. This is the discovery section.
3. **Browse all** — collapsed by default. Seeded conferences with zero attendees, so a
   new member always has something to tap.

If the member is attending nothing, section 1 collapses to a single prompt to add one
and section 2 carries the screen. It must never look empty.

Keep it clean. This screen is the one thing that gets judged, and restraint reads as
confidence — resist adding stats, badges, or activity feeds to it.

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
Then the full roster — every attendee, by name — then meetups.

### `/m/[id]` — member card (deliberately thin)
Name, initials avatar, and every conference that member is attending. That's the whole
card. **No title, company, LinkedIn, bio, photos, messaging, or activity feed.**

Its one job: a member taps a name on a roster and finds out where else they'll overlap.
In the full version this links out to the member's real CREW profile.

### `/calendar`
Two toggles: **Mine** and **All CREW**.
- Desktop: month grid with multi-day bars.
- Mobile: heavily pared down — compact month with dots on days that have conferences;
  tapping a day lists them below. Do not attempt bars in a 380px grid.

### `/me`
Your name (editable), your conferences with notes, and a working "delete me and my data"
button. That's all. **No title, company, or LinkedIn** — those were cut (§8 onboarding).
**No visibility setting** (§7). No sign-out — there's no account to sign out of.

### `/admin` (curator only)
Functional, not pretty. Must cover:

- **Member list** with remove.
- **Conference review queue** — unverified (member-added) entries awaiting confirmation.
- **Edit any conference** — name, dates, city, venue, website. **Editing must preserve
  attendance.** Wrong dates entered from memory are the expected case, not the rare one;
  a curator fixing them must not silently drop everyone already marked as going.
- **Mark verified** — clears the unverified badge.
- **Delete a conference**, with a warning naming how many members are attending. Deleting
  one with attendees should feel deliberate.
- **Duplicate merge** — combine two conference rows, moving all attendance to the
  survivor. Split rosters are the failure mode that makes the app look broken (§9).
- **AI kill switch** and **member cap**.

The curator is one non-technical person. Every routine cleanup task — fixing a date,
removing a test entry, merging a duplicate — must be doable in the app. If a task
requires database access, it will not get done.

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
- Route rejects any request without a valid member session.
- **Per-member limit:** 10 lookups per rolling 24h.
- **Global limit:** 40 lookups per day across all users. (At ~$0.034 per lookup this
  caps worst-case exposure near $40/month. 16 members will not come close.)
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

> **Priority note.** Meetups are **secondary**. The primary function of this app — the
> thing it will be judged on — is letting a member see which other CREW members are going
> to which conferences. Meetups only need to work well enough to prove the concept: a
> member can propose one, others can see it and say they're in, and one person is clearly
> in charge. Rough edges here are acceptable. Rough edges in the core loop are not.
> If effort must be traded between the two, the core loop wins every time.

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

- Members self-identify by name; mapping 16 names to CREW identities at migration is a
  one-time reconciliation (§2.5)
- Token auth, iframe-safe (§2.3)
- Keep auth logic in one module so it can be swapped for SSO later
- No profile data that would need migrating — that's why member pages are thin

---

## 12. Email — none

**This app sends no email.** No auth emails, no notifications, no digests, no approval
messages. Resend is not a dependency. `RESEND_API_KEY` is not an environment variable.
Supabase SMTP is not configured because nothing uses it.

The curator communicates with the 16 pilot members directly, outside the app.

If a future version needs email, that's a decision to make then, with a reason. Do not
add a notification system because it seems expected.

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

**Cut after being specced** — these were designed, then removed. Reintroducing one means
re-opening a settled decision, not proposing a new idea:
- Email of any kind, including magic-link auth (§6, §12)
- Per-member visibility settings (§7)
- Pending/approved member states and the approval queue (§6)
- Profile fields — title, company, LinkedIn (§8). CREW profiles will supply these in the
  full version; a parallel profile system now is only something to migrate away from.


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

**M1 — Skeleton.** Next.js + Supabase + Tailwind. Schema and RLS. Invite code +
anonymous session. Deployed to Vercel.

**M2 — The core loop.** Seed the catalog. Home screen with tap-to-toggle. Conference
detail with roster. `/me`. **Member-added conferences with AI lookup** (§9, moved up
from M4 — without it, a member whose conference isn't seeded hits a dead end at exactly
the moment the app is supposed to prove itself). This is the point where the app is
genuinely usable and worth showing someone.

**M3 — Meetups.** Poll → confirm state machine. Un-attend cascade. Official flag.
Secondary priority per §10.

**M4 — Everything else.** Calendar views. Member cards.

Do not start M2 until auth and RLS are verified working. Do not start M3 until a real
person has used M2 and entered at least one conference.

---

## 16. Security checklist

- [ ] Repo is **private** on GitHub from the first commit
- [ ] `.env` gitignored; secrets only in Vercel environment variables
- [ ] RLS policies written by hand and read line by line — not accepted unreviewed.
      A mistake here means every member can read every other member's travel plans.
- [ ] Invite code stored **hashed** in `app_settings`, never readable by a client
- [ ] Anthropic key server-side only, spend limit set in Console
- [ ] Privacy policy and terms pages, even for a PoC
- [ ] Working member-and-data deletion
- [ ] Rate limiting + delay on the invite-code endpoint — it's the only gate, so
      brute-forcing it must be slow and logged
- [ ] No real CREW member data in seed files, fixtures, or commits
