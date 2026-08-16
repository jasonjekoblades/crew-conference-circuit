# Verifying RLS

This is M1 acceptance criterion 7, and the one that actually matters — the
UI can look right while the database quietly hands out more than it should.

**For local development, run `npm run test:visibility` first** (needs
`supabase start`, i.e. Docker running). It's a real, repeatable script —
`supabase/tests/visibility-check.ts` — that creates real auth users, mints
real signed session tokens, and hits the actual REST API with them, printing
a plain-language grid of who sees what plus a recursion/timing check. Run it
after ANY change to `attendances`' policy, `member_profiles`, or the helper
functions in `supabase/migrations/`. It has already caught two real bugs
this way (a self-reference recursion error, and a view that silently
returned nothing for anyone but the caller) that reading the SQL never
would have.

That script only works against a local stack, though — it can't reach a
real deployed Supabase project. For checking the actual production database
(after `npm run seed` has been run against it), use the manual dashboard
walkthrough below instead.

## Why you can't just log in as a pending member

By design, a pending member never receives a magic link — only
`/api/admin/approve` (or a repeat `/api/signup` call for an already-approved
email) triggers one. So there's no real session to test with; a "pending
session" only exists at the database level (an `auth.users` row plus a
`members` row with `status='pending'`). To test what THAT session could read,
we simulate its JWT directly in SQL — this is Supabase's own documented way
to exercise RLS policies without needing a real logged-in browser.

## Steps

1. **Create a pending member.** On the deployed app (or `localhost:3000`),
   go to `/login` and sign up with a new email + the correct invite code.
   You'll land on `/pending`. Note the email you used.

2. **Find that member's id.** In the Supabase dashboard → **SQL Editor**,
   run:

   ```sql
   select id, email, status from members where email = 'the-email-you-used@example.com';
   ```

   Copy the `id` (a uuid). Confirm `status` reads `pending`.

3. **Simulate that member's session and try to read things.** Still in the
   SQL Editor, run (as one query, or paste the block and execute together —
   `set local` only lasts for the current transaction/statement batch):

   ```sql
   begin;
   select set_config('request.jwt.claims', json_build_object('sub', '<paste-the-id-here>', 'role', 'authenticated')::text, true);
   set local role authenticated;

   select * from members;                -- should return ONLY the pending member's own row
   select * from conference_series;       -- should return 0 rows
   select * from conferences;             -- should return 0 rows
   select * from attendances;             -- should return 0 rows
   select public.conference_attendee_count(  -- should return 0, not the real count
     (select id from conferences limit 1)
   );

   rollback;
   ```

   `rollback` at the end undoes nothing (these are all reads) and drops the
   simulated role/claims cleanly.

**Expected result:** every query except the first returns zero rows (or 0),
and the first returns exactly one row — the pending member's own. That's
"a pending member's session can read nothing" holding at the database layer,
independent of anything the app's UI does or doesn't enforce.

## While you're in there: confirm visibility works for an approved member too

Same technique, using an **approved** member's id instead:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<approved-member-id>', 'role', 'authenticated')::text, true);
set local role authenticated;

select * from members where id = auth.uid();   -- their own row: 1 result
select * from conference_series;                -- the catalog: should return rows
select * from conferences where status = 'published'; -- the seeded catalog
select * from attendances;                       -- only rows visible per §7 (own row,
                                                   -- all_members-visibility attendees, or
                                                   -- fellow attendees of a conference they're
                                                   -- also on) — NOT every attendance row
select * from member_profiles;                    -- names resolve for exactly the same set
                                                   -- of members as the attendances rows above
                                                   -- (own row, or all_members, or a shared
                                                   -- conference) — never email/status
rollback;
```

If `select * from attendances` under an approved-but-non-curator member ever
returns a row for someone whose `visibility` is `co_attendees` and who
doesn't share a conference with the simulated member, that's the bug this
whole exercise exists to catch. Same for `member_profiles` returning a name
for someone the `attendances` query above didn't also return a row for.
