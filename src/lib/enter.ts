import "server-only";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyInviteCode } from "@/lib/invite-code";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

type CodeCheckResult = { ok: true } | { ok: false; status: number; message: string };

export const ARTIFICIAL_DELAY_MS = 800;

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The one function that decides "is this invite code correct." Called
 * independently by both /api/enter/check and /api/enter/confirm — neither
 * trusts that the other already validated it, since a client could hit
 * /confirm directly with a guessed code and its own freshly-minted
 * anonymous session.
 *
 * CLAUDE.md §16: the invite code is now the only gate, so brute-forcing it
 * "must be slow and logged." Rate limited by IP (checkRateLimit, same
 * DB-backed sliding window as before), an artificial delay on every
 * non-early-exit path so response timing doesn't leak anything, and every
 * attempt — success or failure — written to invite_code_attempts, which is
 * never pruned (unlike rate_limit_events) so it stays a permanent log the
 * curator can review.
 */
export async function verifyInviteCodeRequest(
  request: NextRequest,
  submittedCode: string
): Promise<CodeCheckResult> {
  const admin = createAdminSupabaseClient();
  const ip = requestIp(request);

  const { limited } = await checkRateLimit(`enter:ip:${ip}`, 8, 15);
  if (limited) {
    await admin.from("invite_code_attempts").insert({ ip, success: false });
    await sleep(ARTIFICIAL_DELAY_MS);
    return {
      ok: false,
      status: 429,
      message: "Too many attempts. Wait a few minutes and try again.",
    };
  }

  const { data: settingsRow, error: settingsError } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "invite_code_hash")
    .maybeSingle();

  if (settingsError || !settingsRow) {
    // Not seeded yet — a deployment/config problem, not a user error. Don't
    // log this one; it isn't a real attempt against a real code.
    return { ok: false, status: 503, message: "Not open yet." };
  }

  const correct = verifyInviteCode(submittedCode, settingsRow.value);
  await admin.from("invite_code_attempts").insert({ ip, success: correct });

  if (!correct) {
    await sleep(ARTIFICIAL_DELAY_MS);
    return {
      ok: false,
      status: 401,
      message: "That code didn't work. Double-check it and try again.",
    };
  }

  return { ok: true };
}

export async function getMemberCap(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "member_cap")
    .maybeSingle();
  return data?.value ? parseInt(data.value, 10) : 16;
}

const DEFAULT_PILOT_FULL_MESSAGE = "This pilot is full for now.";

export async function getPilotFullMessage(): Promise<string> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "pilot_full_message")
    .maybeSingle();
  return data?.value || DEFAULT_PILOT_FULL_MESSAGE;
}
