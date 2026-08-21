import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// Curator's "Remove" button in /admin. Same reasoning as /api/me/delete —
// routed through the server specifically so the target's Supabase
// anonymous auth user is actually removed too, not just their members row.
export async function POST(request: NextRequest) {
  const caller = await requireMember(request);
  if (!caller || !caller.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  let body: { memberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }
  if (memberId === caller.id) {
    return NextResponse.json({ message: "Use 'delete me and my data' on /me instead." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: row } = await admin.from("members").select("auth_user_id").eq("id", memberId).maybeSingle();
  if (!row) {
    return NextResponse.json({ message: "Member not found." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("members").delete().eq("id", memberId);
  if (deleteError) {
    return NextResponse.json({ message: "Couldn't remove that member." }, { status: 500 });
  }

  if (row.auth_user_id) {
    await admin.auth.admin.deleteUser(row.auth_user_id);
  }

  return NextResponse.json({ ok: true });
}
