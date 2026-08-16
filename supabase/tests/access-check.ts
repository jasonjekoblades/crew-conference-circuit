/**
 * Repeatable, real-API verification of CLAUDE.md §6/§7's access model —
 * re-run this after ANY change to RLS in supabase/migrations/. Renamed from
 * visibility-check.ts: the thing it verifies changed. §7 used to require a
 * different visible row-set per viewer; now it needs to prove exactly two
 * things — a valid session reads the FULL roster (no partial visibility
 * left anywhere), and NO session (or a session with no linked members row)
 * reads nothing.
 *
 * Unlike the old script, this doesn't hand-sign JWTs. Anonymous auth needs
 * no interactivity — supabase.auth.signInAnonymously() returns a real,
 * valid session in one call — so every "viewer" here is a genuine session
 * through the genuine auth flow, not a simulation of one.
 *
 * Requires the LOCAL Supabase stack (`supabase start`, with
 * enable_anonymous_sign_ins = true in supabase/config.toml) — it can't
 * reach a real deployed project. Run with:
 *
 *   npm run test:access
 *
 * Creates obviously-fake test conferences (prefixed "ZZZ TEST"). Safe to
 * re-run — everything is upserted or freshly created per run.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const API_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  process.env.LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SERIES = [
  { id: "10000000-0000-0000-0000-00000000a001", slug: "zzz-test-conf-a", name: "ZZZ TEST Conference A" },
  { id: "10000000-0000-0000-0000-00000000a002", slug: "zzz-test-conf-b", name: "ZZZ TEST Conference B" },
] as const;

const CONFERENCES = [
  { id: "10000000-0000-0000-0000-00000000c001", seriesId: SERIES[0].id, name: "ZZZ TEST Conference A 2099" },
  { id: "10000000-0000-0000-0000-00000000c002", seriesId: SERIES[1].id, name: "ZZZ TEST Conference B 2099" },
] as const;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)),
  ]);
}

async function seed() {
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

  // Two named test members, both attending Conference A.
  const { data: alice, error: aliceErr } = await admin
    .from("members")
    .upsert({ id: "10000000-0000-0000-0000-0000000d0001", name: "Alice Test" }, { onConflict: "id" })
    .select("id")
    .single();
  if (aliceErr) throw aliceErr;
  const { data: bob, error: bobErr } = await admin
    .from("members")
    .upsert({ id: "10000000-0000-0000-0000-0000000d0002", name: "Bob Test" }, { onConflict: "id" })
    .select("id")
    .single();
  if (bobErr) throw bobErr;

  await admin
    .from("attendances")
    .upsert({ member_id: alice.id, conference_id: CONFERENCES[0].id }, { onConflict: "member_id,conference_id" });
  await admin
    .from("attendances")
    .upsert({ member_id: bob.id, conference_id: CONFERENCES[0].id }, { onConflict: "member_id,conference_id" });

  console.log("Seeded 2 test conferences, 2 test members (Alice, Bob), 2 attendance rows.\n");
  return { aliceId: alice.id as string, bobId: bob.id as string };
}

async function newAnonymousClient(): Promise<{ client: SupabaseClient; authUserId: string }> {
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error("signInAnonymously returned no session");
  return { client, authUserId: data.user!.id };
}

async function main() {
  const { aliceId } = await seed();

  console.log("=== A linked session reads the full roster ===");
  console.log('Signing in anonymously and linking to "Alice Test" via auth_user_id (what /api/enter/confirm does).\n');

  const { client: aliceClient, authUserId: aliceAuthUserId } = await newAnonymousClient();
  const { error: linkError } = await admin
    .from("members")
    .update({ auth_user_id: aliceAuthUserId })
    .eq("id", aliceId);
  if (linkError) throw linkError;

  const start = Date.now();
  const { data: attendances, error: attError } = await withTimeout(
    aliceClient.from("attendances").select("member_id, conference_id"),
    5000,
    "attendances as linked member"
  );
  const elapsedMs = Date.now() - start;

  if (attError) {
    console.log(`  ERROR: ${attError.message} (${elapsedMs}ms)`);
  } else {
    const sawBoth = (attendances ?? []).filter((a) => a.conference_id === CONFERENCES[0].id).length;
    console.log(`  attendances: ${attendances?.length} row(s) total, ${sawBoth} for Conference A (expect 2 — Alice + Bob), ${elapsedMs}ms`);
  }

  const { data: allMembers } = await aliceClient.from("members").select("id, name");
  console.log(`  members: ${allMembers?.length} row(s) visible (full roster, no partial names — §7)`);

  const { data: allConferences } = await aliceClient.from("conferences").select("id").eq("status", "published");
  console.log(`  conferences: ${allConferences?.length} published row(s) visible`);

  console.log("\n=== No session reads nothing ===");

  // Reports "N row(s)" only for a genuinely successful empty/non-empty
  // result, and "error(<code>)" when the query was rejected outright — a
  // rejected query and a successful-but-empty one both mean "reads
  // nothing," but they're different outcomes and worth telling apart.
  function describe(data: unknown[] | null, error: { code?: string } | null): string {
    if (error) return `error(${error.code})`;
    return `${data?.length ?? 0} row(s)`;
  }

  console.log("-- Genuinely no session (fresh anon-key client, never signed in) --");
  const noSessionClient = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: noSessionMembers, error: noSessionMembersErr } = await noSessionClient.from("members").select("id");
  const { data: noSessionAttendances, error: noSessionAttendancesErr } = await noSessionClient
    .from("attendances")
    .select("id");
  const { data: teaser, error: teaserErr } = await noSessionClient.rpc("login_teaser");
  console.log(`  members=${describe(noSessionMembers, noSessionMembersErr)}`);
  console.log(`  attendances=${describe(noSessionAttendances, noSessionAttendancesErr)}`);
  console.log(
    `  login_teaser=${teaserErr ? `error(${teaserErr.code})` : `${(teaser as unknown[])?.length} row(s), correctly public`}`
  );

  console.log("-- Anonymous session that exists but is NOT linked to any members row --");
  const { client: unlinkedClient } = await newAnonymousClient();
  const { data: unlinkedMembers, error: unlinkedMembersErr } = await unlinkedClient.from("members").select("id");
  const { data: unlinkedAttendances, error: unlinkedAttendancesErr } = await unlinkedClient
    .from("attendances")
    .select("id");
  const { data: unlinkedConferences, error: unlinkedConferencesErr } = await unlinkedClient
    .from("conferences")
    .select("id");
  console.log(`  members=${describe(unlinkedMembers, unlinkedMembersErr)}`);
  console.log(`  attendances=${describe(unlinkedAttendances, unlinkedAttendancesErr)}`);
  console.log(`  conferences=${describe(unlinkedConferences, unlinkedConferencesErr)}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
