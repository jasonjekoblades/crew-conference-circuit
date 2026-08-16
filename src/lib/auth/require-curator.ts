import "server-only";
import { NextRequest } from "next/server";
import {
  createAdminSupabaseClient,
  createRequestScopedSupabaseClient,
} from "@/lib/supabase/admin";

type RequireCuratorResult =
  | { ok: true; memberId: string }
  | { ok: false; status: number; message: string };

/**
 * Resolves the caller of an API route to a curator, or fails closed. There
 * is no cookie session for the server to read (localStorage-only auth,
 * CLAUDE.md §2.3), so the client must send its Supabase access token as
 * `Authorization: Bearer <token>` and this verifies it.
 *
 * Two independent checks, both against the database (never trust a client-
 * supplied "I am a curator" claim): the token must resolve to a real
 * Supabase auth user (anon-key client, so this itself respects auth rules),
 * and the members row linked to that auth_user_id must have is_curator=true
 * (service-role read — the route itself is the enforcement point for admin
 * actions, not RLS). is_curator is set directly in the database by the
 * maintainer (CLAUDE.md §6); there is no in-app path that could set it.
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
    .select("id, is_curator")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (memberError || !member) {
    return { ok: false, status: 403, message: "No member record for this session." };
  }

  if (!member.is_curator) {
    return { ok: false, status: 403, message: "Curator access required." };
  }

  return { ok: true, memberId: member.id };
}

type RequireMemberResult =
  | { ok: true; memberId: string }
  | { ok: false; status: number; message: string };

/**
 * Same shape as requireCurator, without the is_curator check — for routes
 * (the future AI lookup route, per-member rate limiting) that need "any
 * linked member," not specifically a curator.
 */
export async function requireMember(request: NextRequest): Promise<RequireMemberResult> {
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
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (memberError || !member) {
    return { ok: false, status: 403, message: "No member record for this session." };
  }

  return { ok: true, memberId: member.id };
}
