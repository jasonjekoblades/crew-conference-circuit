import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// Run 6, Stage 5: curator edit for a conference's own fields. This is a
// plain column UPDATE — attendance rows reference conferences.id, which
// never changes here, so editing can never touch (let alone drop) anyone
// already marked as going. CLAUDE.md is explicit this must not be
// implemented as delete-then-recreate; a straight UPDATE is the only way
// that's structurally true rather than just tested to be true.
export async function POST(request: NextRequest) {
  const caller = await requireMember(request);
  if (!caller || !caller.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: {
    conferenceId?: unknown;
    name?: unknown;
    start_date?: unknown;
    end_date?: unknown;
    city?: unknown;
    website?: unknown;
    verified?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const conferenceId = typeof body.conferenceId === "string" ? body.conferenceId : "";
  if (!conferenceId) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.start_date === "string" && body.start_date) update.start_date = body.start_date;
  if (typeof body.end_date === "string" && body.end_date) update.end_date = body.end_date;
  if (typeof body.city === "string" && body.city.trim()) update.city = body.city.trim();
  if (typeof body.website === "string") update.website = body.website.trim() || null;
  if (typeof body.verified === "boolean") update.verified = body.verified;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("conferences").update(update).eq("id", conferenceId);
  if (error) {
    return NextResponse.json({ message: "Couldn't save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
