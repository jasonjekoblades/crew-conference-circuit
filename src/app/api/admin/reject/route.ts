import { NextRequest, NextResponse } from "next/server";
import { requireCurator } from "@/lib/auth/require-curator";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const auth = await requireCurator(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  let body: { memberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ ok: false, message: "memberId is required." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: target, error: targetError } = await admin
    .from("members")
    .select("id, status")
    .eq("id", memberId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ ok: false, message: "Member not found." }, { status: 404 });
  }

  if (target.status !== "pending") {
    return NextResponse.json(
      { ok: false, message: `Member is already ${target.status}, not pending.` },
      { status: 409 }
    );
  }

  const { error: updateError } = await admin
    .from("members")
    .update({ status: "rejected" })
    .eq("id", memberId);

  if (updateError) {
    return NextResponse.json({ ok: false, message: "Couldn't reject this member." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rejected: true });
}
