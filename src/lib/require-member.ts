import "server-only";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient, createRequestScopedSupabaseClient } from "@/lib/supabase/admin";

export type AuthedMember = { id: string; is_curator: boolean };

/**
 * Resolves the `Authorization: Bearer <token>` header (the only session
 * carrier under localStorage-only auth — see /api/enter/confirm) to a real
 * members row. Used by any server route that needs to know WHO is calling,
 * not just that they're authenticated — the AI lookup route's per-member
 * rate limit and the admin kill switch's curator check both need this.
 */
export async function requireMember(request: NextRequest): Promise<AuthedMember | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const requestClient = createRequestScopedSupabaseClient();
  const { data: userData, error: userError } = await requestClient.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const admin = createAdminSupabaseClient();
  const { data: member, error } = await admin
    .from("members")
    .select("id, is_curator")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (error || !member) return null;
  return member as AuthedMember;
}
