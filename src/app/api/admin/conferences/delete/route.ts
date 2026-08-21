import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// Run 6, Stage 5. Attendee-count confirmation lives client-side (the
// curator sees the number before confirming) — this route just does the
// delete once confirmed. attendances cascade-delete via the existing FK
// (ON DELETE CASCADE); that's correct here, unlike a member's own
// self-delete, because deleting the conference itself is the explicit,
// deliberate action being confirmed, not an accidental side effect.
export async function POST(request: NextRequest) {
  const caller = await requireMember(request);
  if (!caller || !caller.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: { conferenceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const conferenceId = typeof body.conferenceId === "string" ? body.conferenceId : "";
  if (!conferenceId) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: conf } = await admin.from("conferences").select("series_id").eq("id", conferenceId).maybeSingle();
  if (!conf) {
    return NextResponse.json({ message: "Conference not found." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("conferences").delete().eq("id", conferenceId);
  if (deleteError) {
    return NextResponse.json({ message: "Couldn't delete that conference." }, { status: 500 });
  }

  // Clean up a now-orphaned series (no other year/edition left under it) so
  // it doesn't keep surfacing as a stale duplicate-check candidate.
  const { count: remaining } = await admin
    .from("conferences")
    .select("id", { count: "exact", head: true })
    .eq("series_id", conf.series_id);
  if ((remaining ?? 0) === 0) {
    await admin.from("conference_series").delete().eq("id", conf.series_id);
  }

  return NextResponse.json({ ok: true });
}
