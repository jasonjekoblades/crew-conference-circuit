import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCodeRequest, ARTIFICIAL_DELAY_MS, sleep } from "@/lib/enter";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Replaces an earlier "pick your name from a visible list" relink flow.
 * Showing every name is a convenience among a handful of personally
 * invited members, but becomes a directory anyone can browse and
 * impersonate with one tap once the invite reaches a wider group. This
 * route never returns the roster — the member types their name, it's
 * matched server-side, and a non-match and an ambiguous match get the
 * exact same generic response (same status, same message, same artificial
 * delay) so a caller can't distinguish "no such name" from "more than one
 * member has that name" by probing.
 *
 * This doesn't eliminate impersonation (CLAUDE.md §6 already accepts that
 * risk for a small group of vetted peers) — it just stops it being a
 * single tap against a browsable list, matching the same brute-force
 * posture already applied to the invite code itself: rate-limited by IP,
 * delayed, logged.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing session." }, { status: 401 });
  }

  let body: { code?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  const typedName = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || !typedName) {
    return NextResponse.json({ ok: false, message: "Enter the invite code and your name." }, { status: 400 });
  }

  const verification = await verifyInviteCodeRequest(request, code);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, message: verification.message }, { status: verification.status });
  }

  const ip = requestIp(request);
  const { limited } = await checkRateLimit(`relink:ip:${ip}`, 8, 15);
  if (limited) {
    await sleep(ARTIFICIAL_DELAY_MS);
    return NextResponse.json({ ok: false, message: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }

  const requestClient = createRequestScopedSupabaseClient();
  const { data: userData, error: userError } = await requestClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ ok: false, message: "Invalid session." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  // Escape ILIKE wildcards so a typed "%" or "_" can't turn this into a
  // pattern match instead of the exact (case-insensitive) match intended.
  const escaped = typedName.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data: matches } = await admin.from("members").select("id").ilike("name", escaped);

  const GENERIC_NO_MATCH =
    "That name doesn't match anyone here — check spelling and capitalization, or continue as new if this is your first time.";

  if (!matches || matches.length !== 1) {
    // Zero matches AND multiple matches (two members with the same name)
    // return the identical response — deliberately not distinguishing the
    // two so neither reveals anything about who's actually registered.
    await sleep(ARTIFICIAL_DELAY_MS);
    return NextResponse.json({ ok: false, message: GENERIC_NO_MATCH }, { status: 404 });
  }

  const memberId = matches[0].id;
  const { error: updateError } = await admin.from("members").update({ auth_user_id: userData.user.id }).eq("id", memberId);
  if (updateError) {
    return NextResponse.json({ ok: false, message: "Couldn't link that member." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memberId });
}
