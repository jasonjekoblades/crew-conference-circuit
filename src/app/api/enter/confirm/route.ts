import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCodeRequest, getMemberCap, getPilotFullMessage } from "@/lib/enter";

/**
 * Step 2 of /enter, "I'm new here" only. The client has already created its
 * own anonymous session (supabase.auth.signInAnonymously() — free,
 * ungated, doesn't need the code) and sends its access token here alongside
 * the code, re-validated independently of /check. Creates a fresh members
 * row linked to this session, blocked at member_cap.
 *
 * Returning members ("I've been here before") go through /api/enter/relink
 * instead (Run 7, Stage 3) — that route matches a typed name server-side
 * rather than accepting a client-supplied member id, since a client-trusted
 * id is exactly the "browse and pick anyone" shortcut that route exists to
 * remove.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing session." }, { status: 401 });
  }

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
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

  const [{ count: memberCount }, cap] = await Promise.all([
    admin.from("members").select("id", { count: "exact", head: true }),
    getMemberCap(),
  ]);

  if ((memberCount ?? 0) >= cap) {
    await admin.from("rate_limit_events").insert({ bucket_key: "member-cap:rejected" });
    const message = await getPilotFullMessage();
    return NextResponse.json({ ok: false, message }, { status: 403 });
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
