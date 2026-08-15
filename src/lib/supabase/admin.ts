import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely — this is the ONLY
 * client allowed to touch app_settings (invite code hash, user cap) or
 * create members rows outside a user's own session. `import "server-only"`
 * makes any accidental client-component import a build error rather than a
 * leaked key.
 *
 * Used by: /api/signup, /api/admin/*, and scripts/seed.ts. Never imported
 * from a page or client component.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * A request-scoped anon-key client used ONLY to resolve `Authorization:
 * Bearer <token>` headers into a member via supabase.auth.getUser(token).
 * This is how API routes authenticate a caller under a localStorage-only
 * session model — there's no cookie for the server to read, so the client
 * must forward its access token explicitly and the server verifies it here.
 */
export function createRequestScopedSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
