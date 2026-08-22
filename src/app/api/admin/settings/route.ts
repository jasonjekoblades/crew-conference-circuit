import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// Run 7: every cap that used to be a hardcoded number or env var is now
// readable and editable here, curator-gated, no deploy required — Stage 2
// and 3 both need this so Jason can react to real traffic after the CREW
// forum post without asking for another deploy each time. Supersedes the
// old single-purpose /api/admin/ai-toggle route.
const KEYS = ["ai_enabled", "member_cap", "ai_global_daily_limit", "pilot_full_message"] as const;
type Key = (typeof KEYS)[number];

export async function GET(request: NextRequest) {
  const member = await requireMember(request);
  if (!member || !member.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("app_settings").select("key, value").in("key", KEYS);
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));

  return NextResponse.json({
    ai_enabled: byKey.get("ai_enabled") === "true",
    member_cap: parseInt(byKey.get("member_cap") ?? "16", 10),
    ai_global_daily_limit: parseInt(byKey.get("ai_global_daily_limit") ?? "40", 10),
    pilot_full_message: byKey.get("pilot_full_message") ?? "",
  });
}

export async function POST(request: NextRequest) {
  const member = await requireMember(request);
  if (!member || !member.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: Partial<Record<Key, unknown>>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const updates: { key: Key; value: string }[] = [];

  if ("ai_enabled" in body) {
    if (typeof body.ai_enabled !== "boolean") {
      return NextResponse.json({ message: "ai_enabled must be true/false." }, { status: 400 });
    }
    updates.push({ key: "ai_enabled", value: body.ai_enabled ? "true" : "false" });
  }

  if ("member_cap" in body) {
    const n = Number(body.member_cap);
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      return NextResponse.json({ message: "member_cap must be a positive whole number." }, { status: 400 });
    }
    updates.push({ key: "member_cap", value: String(n) });
  }

  if ("ai_global_daily_limit" in body) {
    const n = Number(body.ai_global_daily_limit);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      return NextResponse.json({ message: "ai_global_daily_limit must be a non-negative whole number." }, { status: 400 });
    }
    updates.push({ key: "ai_global_daily_limit", value: String(n) });
  }

  if ("pilot_full_message" in body) {
    const s = typeof body.pilot_full_message === "string" ? body.pilot_full_message.trim() : "";
    if (!s || s.length > 500) {
      return NextResponse.json({ message: "pilot_full_message must be 1-500 characters." }, { status: 400 });
    }
    updates.push({ key: "pilot_full_message", value: s });
  }

  if (updates.length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  for (const { key, value } of updates) {
    const { error } = await admin.from("app_settings").update({ value }).eq("key", key);
    if (error) {
      return NextResponse.json({ message: `Couldn't update ${key}.` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
