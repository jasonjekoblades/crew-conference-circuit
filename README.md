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

1. **Create a Supabase project** at supabase.com (free tier is fine). From
   **Project Settings → API**, you'll need the Project URL, the `anon`
   public key, and the `service_role` secret key.

2. **Run the migrations.** In the Supabase dashboard → **SQL Editor**, paste
   and run the contents of each file in `supabase/migrations/` **in order**
   (`20260815000001_schema.sql`, then `...0002...`, `...0003...`,
   `...0004...`). Each one depends on the tables/functions the previous one
   created. (If you have the Supabase CLI installed and the project linked,
   `supabase db push` does this in one step instead.)

3. **Configure Auth redirect URLs.** Dashboard → **Authentication → URL
   Configuration**: set **Site URL** to your dev/deploy URL (e.g.
   `http://localhost:3000` while developing), and add
   `http://localhost:3000/auth/callback` (and later your Vercel URL +
   `/auth/callback`) under **Redirect URLs**. Magic links won't complete
   sign-in without this.

4. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from step 1
   - `INVITE_CODE` — pick a code; it's hashed before being stored, never
     kept as plaintext
   - `CURATOR_EMAIL` — the email to seed as the founding curator (must be
     an email you can receive mail at, to test the full flow)
   - `USER_CAP` — defaults to 16 if you leave it

5. `npm install`

6. `npm run seed` — seeds the conference catalog, the invite code hash, the
   user cap, and creates + approves the curator account from `CURATOR_EMAIL`.
   Safe to re-run; everything it does is an upsert.

7. `npm run dev`, then visit `/login`. Sign in with `CURATOR_EMAIL` + your
   invite code to get a magic link as the curator.

8. **Deploying:** push this repo to a **private** GitHub repo, connect it in
   Vercel, and set the same four runtime env vars (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `INVITE_CODE`) in the Vercel project's Environment Variables —
   `CURATOR_EMAIL`/`USER_CAP` are only read by the local seed script, not at
   runtime, so they don't need to be set there. After the first deploy,
   go back to step 3 and add `https://<your-vercel-url>/auth/callback` to
   Supabase's Redirect URLs.

See **`supabase/VERIFY.md`** for how to confirm, directly in the Supabase
dashboard, that a pending member's session can't read anything.

## Non-negotiables

- No passwords. Magic-link auth only.
- Token in localStorage, not cookie sessions — this must survive being iframed.
- RLS policies are reviewed by hand, not generated and trusted.
- No real CREW member data in seeds, fixtures, tests, or commits.
