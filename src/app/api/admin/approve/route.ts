import { NextRequest, NextResponse } from "next/server";
import { requireCurator } from "@/lib/auth/require-curator";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";

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
    .select("id, email, status")
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
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", memberId);

  if (updateError) {
    return NextResponse.json({ ok: false, message: "Couldn't approve this member." }, { status: 500 });
  }

  const siteOrigin = request.nextUrl.origin;
  const requestClient = createRequestScopedSupabaseClient();
  const { error: otpError } = await requestClient.auth.signInWithOtp({
    email: target.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteOrigin}/auth/callback`,
    },
  });

  if (otpError) {
    // The member row IS approved at this point; only the email failed. Don't
    // roll back the approval — surface the email failure so the curator can
    // resend or tell the member to use /login again, which will also
    // trigger a magic link since they're now approved.
    return NextResponse.json(
      { ok: true, approved: true, magicLinkSent: false, message: "Approved, but the sign-in email failed to send." },
      { status: 200 }
    );
  }

  // TODO(M4/Resend): "you've been approved" transactional email (CLAUDE.md
  // §12). The magic link above IS the functional sign-in email; a separate
  // friendlier notification is a Resend-era addition, not M1.

  return NextResponse.json({ ok: true, approved: true, magicLinkSent: true });
}
