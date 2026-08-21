import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// app_settings has zero client RLS policies on purpose (see the RLS
// migration) — this is the one narrow, curator-gated read/write path for
// the single setting /admin needs to see and flip (CLAUDE.md §9's kill
// switch).
export async function GET(request: NextRequest) {
  const member = await requireMember(request);
  if (!member || !member.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "ai_enabled").maybeSingle();
  return NextResponse.json({ enabled: data?.value === "true" });
}

export async function POST(request: NextRequest) {
  const member = await requireMember(request);
  if (!member || !member.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("app_settings")
    .update({ value: body.enabled ? "true" : "false" })
    .eq("key", "ai_enabled");

  if (error) {
    return NextResponse.json({ message: "Couldn't update that setting." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
