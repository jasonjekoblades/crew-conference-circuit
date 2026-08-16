/**
 * Repeatable, real-API verification of the §7 visibility rules — re-run this
 * after ANY change to the attendances RLS policy or the visibility-related
 * functions in supabase/migrations/.
 *
 * This does NOT simulate anything in raw SQL. It creates real auth users,
 * mints real signed session JWTs (HS256, same algorithm and same claim
 * shape GoTrue issues — role + sub is all PostgREST/RLS actually reads),
 * and calls the same REST API the deployed app calls. If this script says a
 * viewer can/can't see something, that's what the real app would return too.
 *
 * Requires the LOCAL Supabase stack (`supabase start`), not a production
 * project — it creates and inserts obviously-fake test members and
 * conferences (prefixed "ZZZ TEST"). Run with:
 *
 *   npm run test:visibility
 *
 * Safe to re-run: all test rows use fixed uuids and are upserted.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const API_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  process.env.LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
// Well-known Supabase CLI local-dev default — identical for every local
// project, not a secret, printed by `supabase status`.
const JWT_SECRET =
  process.env.LOCAL_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Hand-signed HS256 JWT — same algorithm and claim shape GoTrue issues.
 * Avoids adding a jsonwebtoken dependency for a ~15-line test-only need. */
function mintSessionToken(userId: string, email: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    email,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac("sha256", JWT_SECRET).update(unsigned).digest());
  return `${unsigned}.${signature}`;
}

function clientAs(userId: string, email: string) {
  const token = mintSessionToken(userId, email);
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Fixed test uuids so this is idempotent across runs.
const MEMBERS = [
  { id: "00000000-0000-0000-0000-0000000000a1", email: "alice@test.local", name: "Alice (all_members)", visibility: "all_members" },
  { id: "00000000-0000-0000-0000-0000000000b2", email: "bob@test.local", name: "Bob (co_attendees)", visibility: "co_attendees" },
  { id: "00000000-0000-0000-0000-0000000000c3", email: "carol@test.local", name: "Carol (co_attendees)", visibility: "co_attendees" },
  { id: "00000000-0000-0000-0000-0000000000d4", email: "dave@test.local", name: "Dave (all_members)", visibility: "all_members" },
] as const;

const SERIES = [
  { id: "00000000-0000-0000-0000-00000000a001", slug: "zzz-test-conf-a", name: "ZZZ TEST Conference A" },
  { id: "00000000-0000-0000-0000-00000000a002", slug: "zzz-test-conf-b", name: "ZZZ TEST Conference B" },
  { id: "00000000-0000-0000-0000-00000000a003", slug: "zzz-test-conf-c", name: "ZZZ TEST Conference C" },
] as const;

const CONFERENCES = [
  { id: "00000000-0000-0000-0000-00000000c001", seriesId: SERIES[0].id, name: "ZZZ TEST Conference A 2099" },
  { id: "00000000-0000-0000-0000-00000000c002", seriesId: SERIES[1].id, name: "ZZZ TEST Conference B 2099" },
  { id: "00000000-0000-0000-0000-00000000c003", seriesId: SERIES[2].id, name: "ZZZ TEST Conference C 2099" },
] as const;

// Alice: A, B  |  Bob: A, C  |  Carol: A  |  Dave: B
const ATTENDANCE: [string, string][] = [
  [MEMBERS[0].id, CONFERENCES[0].id],
  [MEMBERS[0].id, CONFERENCES[1].id],
  [MEMBERS[1].id, CONFERENCES[0].id],
  [MEMBERS[1].id, CONFERENCES[2].id],
  [MEMBERS[2].id, CONFERENCES[0].id],
  [MEMBERS[3].id, CONFERENCES[1].id],
];

async function seed() {
  for (const m of MEMBERS) {
    const { data: existing } = await admin.auth.admin.getUserById(m.id).catch(() => ({ data: null }) as never);
    if (!existing?.user) {
      const { error } = await admin.auth.admin.createUser({
        id: m.id,
        email: m.email,
        email_confirm: true,
      });
      if (error && !error.message.includes("already been registered")) throw error;
    }
  }

  const { error: memberError } = await admin.from("members").upsert(
    MEMBERS.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      title: "Test Title",
      company: "Test Co",
      status: "approved",
      visibility: m.visibility,
      approved_at: new Date().toISOString(),
    })),
    { onConflict: "id" }
  );
  if (memberError) throw memberError;

  for (const s of SERIES) {
    const { error } = await admin
      .from("conference_series")
      .upsert({ id: s.id, slug: s.slug, name: s.name, category: "AI & Data" }, { onConflict: "id" });
    if (error) throw error;
  }

  for (const c of CONFERENCES) {
    const { error } = await admin.from("conferences").upsert(
      {
        id: c.id,
        series_id: c.seriesId,
        year: 2099,
        name: c.name,
        start_date: "2099-01-01",
        end_date: "2099-01-03",
        city: "Test City",
        country: "USA",
        category: "AI & Data",
        status: "published",
        source: "seed",
        verified: true,
      },
      { onConflict: "id" }
    );
    if (error) throw error;
  }

  for (const [memberId, conferenceId] of ATTENDANCE) {
    const { error } = await admin
      .from("attendances")
      .upsert({ member_id: memberId, conference_id: conferenceId }, { onConflict: "member_id,conference_id" });
    if (error) throw error;
  }

  console.log(`Seeded ${MEMBERS.length} test members, ${CONFERENCES.length} test conferences, ${ATTENDANCE.length} attendance rows.\n`);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)),
  ]);
}

async function main() {
  await seed();

  console.log("=== 1a. Recursion / hang check ===");
  console.log("Running `select * from attendances` as each viewer, 5s timeout each.\n");
  for (const viewer of MEMBERS) {
    const client = clientAs(viewer.id, viewer.email);
    const start = Date.now();
    const { data, error } = await withTimeout(
      client.from("attendances").select("id, member_id, conference_id"),
      5000,
      `attendances as ${viewer.name}`
    );
    const elapsedMs = Date.now() - start;
    if (error) {
      console.log(`  ${viewer.name}: ERROR — ${error.message} (${elapsedMs}ms)`);
    } else {
      console.log(`  ${viewer.name}: OK, ${data?.length} row(s) visible, ${elapsedMs}ms`);
    }
  }

  console.log("\n=== 1c. Visibility grid ===");
  console.log("For each conference: TRUE count (via conference_attendee_count, bypasses row filtering)");
  console.log("vs. names each viewer actually sees (via the attendances RLS policy).\n");

  for (const conf of CONFERENCES) {
    const trueCountClient = clientAs(MEMBERS[0].id, MEMBERS[0].email);
    const { data: trueCount, error: countError } = await trueCountClient.rpc("conference_attendee_count", {
      p_conference_id: conf.id,
    });
    if (countError) throw countError;

    console.log(`--- ${conf.name} --- TRUE COUNT: ${trueCount}`);

    for (const viewer of MEMBERS) {
      const client = clientAs(viewer.id, viewer.email);
      const { data: rows, error } = await client
        .from("attendances")
        .select("member_id")
        .eq("conference_id", conf.id);
      if (error) throw error;

      const memberIds = (rows ?? []).map((r) => r.member_id);
      // Two-step, deliberately: attendances tells you WHO is attending;
      // member_profiles (not the base `members` table) is what resolves
      // those ids to names, per the RLS row-visibility gap this test caught.
      const { data: profiles, error: profileError } = await client
        .from("member_profiles")
        .select("id, name")
        .in("id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profileError) throw profileError;

      const names = (profiles ?? []).map((p) => p.name).filter(Boolean);
      console.log(
        `  viewer=${viewer.name.padEnd(24)} sees ${rows?.length ?? 0} attendance row(s), ${names.length} resolvable name(s): [${names.join(", ")}]`
      );
    }
    console.log("");
  }

  console.log("=== Sanity: a pending member sees nothing ===");
  const pendingId = "00000000-0000-0000-0000-0000000000e5";
  const pendingEmail = "erin-pending@test.local";
  const { data: existingPending } = await admin.auth.admin.getUserById(pendingId).catch(() => ({ data: null }) as never);
  if (!existingPending?.user) {
    const { error } = await admin.auth.admin.createUser({ id: pendingId, email: pendingEmail, email_confirm: true });
    if (error && !error.message.includes("already been registered")) throw error;
  }
  await admin.from("members").upsert(
    { id: pendingId, email: pendingEmail, status: "pending" },
    { onConflict: "id" }
  );
  const pendingClient = clientAs(pendingId, pendingEmail);
  const { data: pendingAttendances } = await pendingClient.from("attendances").select("id");
  const { data: pendingConferences } = await pendingClient.from("conferences").select("id");
  const { data: pendingCount } = await pendingClient.rpc("conference_attendee_count", {
    p_conference_id: CONFERENCES[0].id,
  });
  // Alice is visibility='all_members' — a pending viewer must NOT be able to
  // read her profile through member_profiles despite that, since the view
  // gates on the VIEWER's own approval status too, not just the target row.
  const { data: pendingProfiles } = await pendingClient
    .from("member_profiles")
    .select("id, name")
    .eq("id", MEMBERS[0].id);
  console.log(
    `  pending member: attendances=${pendingAttendances?.length ?? "?"} rows, conferences=${pendingConferences?.length ?? "?"} rows, count()=${pendingCount}, member_profiles(Alice)=${pendingProfiles?.length ?? "?"} rows`
  );

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
