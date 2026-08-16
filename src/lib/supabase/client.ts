import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client. Deliberately plain @supabase/supabase-js, not
 * @supabase/ssr — the ssr package's helpers store the session in cookies,
 * which CLAUDE.md §2.3 rules out ("token-in-localStorage auth, not cookie
 * sessions" — this app must survive being iframed later). This client
 * persists to localStorage (the default storage for supabase-js in a
 * browser context) and never touches cookies.
 *
 * Auth is anonymous (CLAUDE.md §6) — supabase.auth.signInAnonymously()
 * returns a session directly, no redirect/callback flow involved, so there's
 * no flowType/detectSessionInUrl concern the way a magic link would have.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let browserClient: ReturnType<typeof createBrowserSupabaseClient> | null = null;

/** Singleton accessor — avoids re-creating the client (and its auth
 * listeners) on every render. */
export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient();
  }
  return browserClient;
}
