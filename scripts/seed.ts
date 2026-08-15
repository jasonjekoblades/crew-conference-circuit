/**
 * One-time / idempotent seed script. Run with `npm run seed` after filling
 * in .env.local (needs SUPABASE_SERVICE_ROLE_KEY, INVITE_CODE, and
 * CURATOR_EMAIL — see .env.example).
 *
 * Does NOT import from src/lib — those files pull in the `server-only`
 * package, which only enforces itself inside Next's bundler. Running them
 * under plain tsx would hit the "cannot be imported outside a Server
 * Component" throw unconditionally. Small enough logic to duplicate here.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}. Check .env.local.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const INVITE_CODE = requireEnv("INVITE_CODE");
const CURATOR_EMAIL = requireEnv("CURATOR_EMAIL").trim().toLowerCase();
const USER_CAP = process.env.USER_CAP ? parseInt(process.env.USER_CAP, 10) : 16;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SeedSeries = {
  slug: string;
  name: string;
  category: string;
  website: string;
  aliases: string[];
};

type SeedConference = {
  series_slug: string;
  year: number;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  country: string;
  website: string;
  verified: boolean;
  source: "seed" | "member" | "ai";
};

type SeedFile = {
  series: SeedSeries[];
  conferences: SeedConference[];
  seed_attendance: { member: string; conference_slugs: string[] }[];
};

async function main() {
  const seedPath = resolve(__dirname, "../reference/seed-conferences.json");
  const seed: SeedFile = JSON.parse(readFileSync(seedPath, "utf-8"));

  console.log(`Seeding from ${seedPath}`);

  // --- app_settings ---------------------------------------------------
  const inviteCodeHash = createHash("sha256").update(INVITE_CODE.trim()).digest("hex");
  const { error: settingsError } = await supabase.from("app_settings").upsert(
    [
      { key: "invite_code_hash", value: inviteCodeHash },
      { key: "user_cap", value: String(USER_CAP) },
      { key: "ai_enabled", value: "false" },
    ],
    { onConflict: "key" }
  );
  if (settingsError) throw settingsError;
  console.log(`app_settings: invite code set, user_cap=${USER_CAP}, ai_enabled=false`);

  // --- conference_series ------------------------------------------------
  const seriesIdBySlug = new Map<string, string>();
  for (const s of seed.series) {
    const { data, error } = await supabase
      .from("conference_series")
      .upsert(
        { name: s.name, slug: s.slug, category: s.category, website: s.website, aliases: s.aliases },
        { onConflict: "slug" }
      )
      .select("id, slug")
      .single();
    if (error) throw error;
    seriesIdBySlug.set(data.slug, data.id);
  }
  console.log(`conference_series: ${seriesIdBySlug.size} upserted`);

  // --- conferences ------------------------------------------------------
  const conferenceIdBySlugYear = new Map<string, string>();
  for (const c of seed.conferences) {
    const seriesId = seriesIdBySlug.get(c.series_slug);
    if (!seriesId) throw new Error(`Unknown series_slug in seed file: ${c.series_slug}`);

    const { data, error } = await supabase
      .from("conferences")
      .upsert(
        {
          series_id: seriesId,
          year: c.year,
          name: c.name,
          start_date: c.start_date,
          end_date: c.end_date,
          city: c.city,
          country: c.country,
          website: c.website,
          category: seed.series.find((s) => s.slug === c.series_slug)!.category,
          status: "published",
          source: c.source,
          verified: c.verified,
        },
        { onConflict: "series_id,year" }
      )
      .select("id")
      .single();
    if (error) throw error;
    conferenceIdBySlugYear.set(`${c.series_slug}-${c.year}`, data.id);
  }
  console.log(`conferences: ${conferenceIdBySlugYear.size} upserted`);

  // --- curator / founding member -----------------------------------------
  const { data: existingMember } = await supabase
    .from("members")
    .select("id, status, is_curator")
    .eq("email", CURATOR_EMAIL)
    .maybeSingle();

  let curatorId: string;
  if (existingMember) {
    curatorId = existingMember.id;
    const { error } = await supabase
      .from("members")
      .update({ status: "approved", is_curator: true, visibility: "all_members", approved_at: new Date().toISOString() })
      .eq("id", curatorId);
    if (error) throw error;
    console.log(`members: ${CURATOR_EMAIL} already existed — ensured approved + curator`);
  } else {
    const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
      email: CURATOR_EMAIL,
      email_confirm: false,
    });
    if (createUserError || !created?.user) throw createUserError ?? new Error("createUser returned no user");
    curatorId = created.user.id;

    const { error: insertError } = await supabase.from("members").insert({
      id: curatorId,
      email: CURATOR_EMAIL,
      status: "approved",
      is_curator: true,
      visibility: "all_members",
      approved_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    console.log(`members: created curator ${CURATOR_EMAIL}`);
  }

  // --- founding member's seeded attendance -----------------------------
  const foundingRow = seed.seed_attendance.find((a) => a.member === "FOUNDING_MEMBER");
  if (foundingRow) {
    const attendanceRows = foundingRow.conference_slugs.map((slug) => {
      const conferenceId = conferenceIdBySlugYear.get(slug);
      if (!conferenceId) throw new Error(`seed_attendance references unknown conference: ${slug}`);
      return { member_id: curatorId, conference_id: conferenceId };
    });
    const { error } = await supabase
      .from("attendances")
      .upsert(attendanceRows, { onConflict: "member_id,conference_id" });
    if (error) throw error;
    console.log(`attendances: seeded ${attendanceRows.length} rows for the founding member`);
  }

  console.log("\nDone. Sign in at /login with the curator email and the invite code.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
