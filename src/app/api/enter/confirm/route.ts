import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCodeRequest, getMemberCap } from "@/lib/enter";

/**
 * Step 2 of /enter: the client has already created its own anonymous
 * session (supabase.auth.signInAnonymously() — free, ungated, doesn't need
 * the code) and sends its access token here alongside the code, re-
 * validated independently of /check. Two outcomes:
 *
 * - relinkMemberId set: "I've been here before" — repoint that existing
 *   member's auth_user_id at this session. CLAUDE.md §6: no ownership
 *   check on the target row on purpose ("this means a member could pick
 *   someone else's name... accepted risk. Do not add verification").
 * - relinkMemberId absent: "I'm new" — create a fresh members row linked
 *   to this session, blocked at member_cap.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing session." }, { status: 401 });
  }

  let body: { code?: unknown; relinkMemberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  const relinkMemberId = typeof body.relinkMemberId === "string" ? body.relinkMemberId : null;
  if (!code) {
    return NextResponse.json({ ok: false, message: "Enter the invite code." }, { status: 400 });
  }

  const verification = await verifyInviteCodeRequest(request, code);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, message: verification.message }, { status: verification.status });
  }

  const requestClient = createRequestScopedSupabaseClient();
  const { data: userData, error: userError } = await requestClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ ok: false, message: "Invalid session." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  if (relinkMemberId) {
    const { data: target, error: targetError } = await admin
      .from("members")
      .select("id")
      .eq("id", relinkMemberId)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ ok: false, message: "Member not found." }, { status: 404 });
    }

    const { error: updateError } = await admin
      .from("members")
      .update({ auth_user_id: userData.user.id })
      .eq("id", relinkMemberId);

    if (updateError) {
      return NextResponse.json({ ok: false, message: "Couldn't link that member." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, memberId: relinkMemberId });
  }

  const [{ count: memberCount }, cap] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }),
    getMemberCap(),
  ]);

  if ((memberCount ?? 0) >= cap) {
    return NextResponse.json({ ok: false, message: "The pilot is full." }, { status: 403 });
  }

  const { data: created, error: insertError } = await admin
    .from("members")
    .insert({ auth_user_id: userData.user.id })
    .select("id")
    .single();

  if (insertError || !created) {
    return NextResponse.json({ ok: false, message: "Couldn't create your account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memberId: created.id });
}
