import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// Run 6, Stage 5. "Split rosters are the failure mode that makes this app
// look broken" (CLAUDE.md §9) — merging moves every attendance from the
// duplicate (source) onto the survivor (target) before the source is
// deleted, so nobody's "going" status silently disappears. A member
// attending BOTH rows already (rare, but possible before a curator catches
// the duplicate) would collide with attendances' unique(member_id,
// conference_id) constraint on a straight re-point, so this reads source
// attendances first and inserts one at a time, ignoring the individual
// conflict rather than failing the whole merge.
export async function POST(request: NextRequest) {
  const caller = await requireMember(request);
  if (!caller || !caller.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: { sourceId?: unknown; targetId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ message: "Pick two different conferences." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: sourceConf } = await admin.from("conferences").select("series_id").eq("id", sourceId).maybeSingle();
  if (!sourceConf) {
    return NextResponse.json({ message: "Source conference not found." }, { status: 404 });
  }
  const { data: targetConf } = await admin.from("conferences").select("id").eq("id", targetId).maybeSingle();
  if (!targetConf) {
    return NextResponse.json({ message: "Target conference not found." }, { status: 404 });
  }

  const { data: sourceAttendances, error: fetchError } = await admin
    .from("attendances")
    .select("member_id, note")
    .eq("conference_id", sourceId);
  if (fetchError) {
    return NextResponse.json({ message: "Couldn't read attendees to move." }, { status: 500 });
  }

  let moved = 0;
  let alreadyThere = 0;
  for (const row of sourceAttendances ?? []) {
    const { error: insertError } = await admin
      .from("attendances")
      .insert({ conference_id: targetId, member_id: row.member_id, note: row.note });
    if (insertError) {
      alreadyThere += 1; // unique-constraint conflict: they were already attending the survivor too.
    } else {
      moved += 1;
    }
  }

  await admin.from("attendances").delete().eq("conference_id", sourceId);
  const { error: deleteError } = await admin.from("conferences").delete().eq("id", sourceId);
  if (deleteError) {
    return NextResponse.json({ message: "Moved attendance, but couldn't remove the duplicate." }, { status: 500 });
  }

  const { count: remaining } = await admin
    .from("conferences")
    .select("id", { count: "exact", head: true })
    .eq("series_id", sourceConf.series_id);
  if ((remaining ?? 0) === 0) {
    await admin.from("conference_series").delete().eq("id", sourceConf.series_id);
  }

  return NextResponse.json({ ok: true, moved, alreadyThere });
}
