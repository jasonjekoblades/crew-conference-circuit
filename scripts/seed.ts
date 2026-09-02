/**
 * One-time / idempotent seed script. Run with `npm run seed` after filling
 * in .env.local (needs SUPABASE_SERVICE_ROLE_KEY, INVITE_CODE, and
 * FOUNDING_MEMBER_NAME — see .env.example).
 *
 * No more auth.admin.createUser() call: there's no email to key a founding
 * member on anymore, and members.auth_user_id is nullable specifically so
 * this script can seed a fully-formed member (name, profile, attendance)
 * with NO linked auth user at all — they link it themselves the first time
 * they open the app, via /enter's "I've been here before" picker, same
 * mechanism anyone uses to recover a lost session (CLAUDE.md §6).
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
const FOUNDING_MEMBER_NAME = requireEnv("FOUNDING_MEMBER_NAME").trim();
const MEMBER_CAP = process.env.MEMBER_CAP ? parseInt(process.env.MEMBER_CAP, 10) : 16;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type SeedSeries = {
  slug: string;
  name: string;
  category: string;
  website: string | null;
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
  website: string | null;
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
  // invite_code_hash is the one row always re-set — re-running seed with a
  // new INVITE_CODE is the documented way to rotate it. Every other row
  // here is only ever INSERTed if missing: member_cap, ai_enabled, and the
  // other caps/message are all curator-editable from /panel without a
  // deploy, and a later reseed (e.g. adding more conferences) must never
  // silently clobber a runtime change back to these env-var defaults.
  const inviteCodeHash = createHash("sha256").update(INVITE_CODE.trim()).digest("hex");
  const { error: inviteError } = await supabase
    .from("app_settings")
    .upsert({ key: "invite_code_hash", value: inviteCodeHash }, { onConflict: "key" });
  if (inviteError) throw inviteError;

  const { data: existingSettings } = await supabase.from("app_settings").select("key");
  const existingKeys = new Set((existingSettings ?? []).map((r) => r.key));
  const defaultsIfMissing: { key: string; value: string }[] = [
    { key: "member_cap", value: String(MEMBER_CAP) },
    { key: "ai_enabled", value: "false" },
    { key: "ai_global_daily_limit", value: "100" },
    {
      key: "pilot_full_message",
      value: "This pilot is full. It's capped while I test the idea — reach out to Jason Blades in the CREW community and I'll make room.",
    },
  ].filter((row) => !existingKeys.has(row.key));

  if (defaultsIfMissing.length > 0) {
    const { error: defaultsError } = await supabase.from("app_settings").insert(defaultsIfMissing);
    if (defaultsError) throw defaultsError;
  }
  console.log(
    `app_settings: invite code set; ${defaultsIfMissing.length > 0 ? `first-time defaults inserted for ${defaultsIfMissing.map((r) => r.key).join(", ")}` : "member_cap/ai_enabled/AI caps already set — left untouched"}`
  );

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

  // --- founding member (curator) -----------------------------------------
  // No auth_user_id yet — nothing to link to until they open the app and
  // pick their own name via /enter's returning-member picker.
  const { data: existingMember } = await supabase
    .from("members")
    .select("id, is_curator")
    .eq("name", FOUNDING_MEMBER_NAME)
    .is("auth_user_id", null)
    .maybeSingle();

  let curatorId: string;
  if (existingMember) {
    curatorId = existingMember.id;
    if (!existingMember.is_curator) {
      const { error } = await supabase.from("members").update({ is_curator: true }).eq("id", curatorId);
      if (error) throw error;
    }
    console.log(`members: ${FOUNDING_MEMBER_NAME} already seeded — ensured is_curator`);
  } else {
    const { data: created, error: insertError } = await supabase
      .from("members")
      .insert({ name: FOUNDING_MEMBER_NAME, is_curator: true })
      .select("id")
      .single();
    if (insertError || !created) throw insertError ?? new Error("insert returned no row");
    curatorId = created.id;
    console.log(`members: seeded founding member/curator ${FOUNDING_MEMBER_NAME}`);
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

  console.log(
    `\nDone. Go to /enter, enter the invite code, choose "I've been here before," and pick "${FOUNDING_MEMBER_NAME}."`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
