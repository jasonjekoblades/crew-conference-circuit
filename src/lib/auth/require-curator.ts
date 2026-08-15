import "server-only";
import { NextRequest } from "next/server";
import {
  createAdminSupabaseClient,
  createRequestScopedSupabaseClient,
} from "@/lib/supabase/admin";

type RequireCuratorResult =
  | { ok: true; memberId: string; email: string }
  | { ok: false; status: number; message: string };

/**
 * Resolves the caller of an API route to an approved curator, or fails
 * closed. There is no cookie session for the server to read (localStorage-
 * only auth, CLAUDE.md §2.3), so the client must send its Supabase access
 * token as `Authorization: Bearer <token>` and this verifies it.
 *
 * Two independent checks, both against the database (never trust a client-
 * supplied "I am a curator" claim): the token must resolve to a real
 * Supabase user (anon-key client, so this itself respects auth rules), and
 * that user's members row must have status='approved' and is_curator=true
 * (service-role read, since we're not relying on RLS to enforce this check —
 * the route itself is the enforcement point for admin actions).
 */
export async function requireCurator(
  request: NextRequest
): Promise<RequireCuratorResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token." };
  }

  const requestClient = createRequestScopedSupabaseClient();
  const { data: userData, error: userError } = await requestClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return { ok: false, status: 401, message: "Invalid or expired session." };
  }

  const admin = createAdminSupabaseClient();
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id, email, status, is_curator")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (memberError || !member) {
    return { ok: false, status: 403, message: "No member record for this session." };
  }

  if (member.status !== "approved" || !member.is_curator) {
    return { ok: false, status: 403, message: "Curator access required." };
  }

  return { ok: true, memberId: member.id, email: member.email };
}
