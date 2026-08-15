import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCode } from "@/lib/invite-code";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CLAUDE.md §6: "Wrong code returns a generic failure that does not reveal
// whether the email exists." Also used for a 'rejected' member trying to
// re-request access, deliberately — that status shouldn't be distinguishable
// from a wrong code either.
function genericFailure() {
  return NextResponse.json(
    { ok: false, message: "That code and email combination didn't work. Double-check both and try again." },
    { status: 401 }
  );
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; inviteCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";

  if (!rawEmail || !EMAIL_RE.test(rawEmail) || !inviteCode) {
    return NextResponse.json(
      { ok: false, message: "Enter a valid email and the invite code." },
      { status: 400 }
    );
  }

  const email = rawEmail.toLowerCase();
  const admin = createAdminSupabaseClient();

  const { data: settingsRows, error: settingsError } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["invite_code_hash", "user_cap"]);

  if (settingsError) {
    return NextResponse.json({ ok: false, message: "Something went wrong. Try again shortly." }, { status: 500 });
  }

  const inviteCodeHash = settingsRows?.find((r) => r.key === "invite_code_hash")?.value;
  const userCapRaw = settingsRows?.find((r) => r.key === "user_cap")?.value;
  const userCap = userCapRaw ? parseInt(userCapRaw, 10) : 16;

  if (!inviteCodeHash) {
    // Not seeded yet — this is a deployment/config problem, not a user error.
    return NextResponse.json({ ok: false, message: "Signups aren't open yet." }, { status: 503 });
  }

  if (!verifyInviteCode(inviteCode, inviteCodeHash)) {
    return genericFailure();
  }

  const { data: existing, error: existingError } = await admin
    .from("members")
    .select("id, email, status")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, message: "Something went wrong. Try again shortly." }, { status: 500 });
  }

  const siteOrigin = request.nextUrl.origin;

  if (existing?.status === "approved") {
    const requestClient = createRequestScopedSupabaseClient();
    const { error: otpError } = await requestClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${siteOrigin}/auth/callback`,
      },
    });
    if (otpError) {
      return NextResponse.json({ ok: false, message: "Couldn't send the sign-in link. Try again shortly." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "magic_link_sent" });
  }

  if (existing?.status === "pending") {
    return NextResponse.json({ ok: true, action: "pending", atCapacity: false });
  }

  if (existing?.status === "rejected") {
    // Deliberately identical to the wrong-code response — see genericFailure().
    return genericFailure();
  }

  // No existing row: brand-new signup.
  const { count: approvedCount, error: countError } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  if (countError) {
    return NextResponse.json({ ok: false, message: "Something went wrong. Try again shortly." }, { status: 500 });
  }

  const atCapacity = (approvedCount ?? 0) >= userCap;

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });

  if (createUserError || !created?.user) {
    return NextResponse.json({ ok: false, message: "Something went wrong. Try again shortly." }, { status: 500 });
  }

  const { error: insertError } = await admin.from("members").insert({
    id: created.user.id,
    email,
    status: "pending",
  });

  if (insertError) {
    return NextResponse.json({ ok: false, message: "Something went wrong. Try again shortly." }, { status: 500 });
  }

  // TODO(M4/Resend): notify the curator by email that a new request is
  // waiting (CLAUDE.md §6 step 3). Not wired up in M1 — RESEND_API_KEY
  // wasn't part of what M1 asked for. For now the curator has to check
  // /admin. Flag this to the user before real signups open.

  return NextResponse.json({ ok: true, action: "pending", atCapacity });
}
