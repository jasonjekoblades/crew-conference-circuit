import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * DB-backed sliding-window rate limit. Records a hit and returns whether the
 * caller is currently over the limit. Uses the service role client — this
 * table has no RLS policy for anon/authenticated at all (see the
 * rate_limit_events migration), so there's no other way to touch it.
 *
 * Fails open on a database error: if the rate-limit check itself can't run,
 * we don't want that to block legitimate signups. The invite code check
 * downstream is still the real gate.
 */
export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowMinutes: number
): Promise<{ limited: boolean }> {
  const admin = createAdminSupabaseClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count, error: countError } = await admin
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("bucket_key", bucketKey)
    .gte("created_at", windowStart);

  if (countError) {
    return { limited: false };
  }

  if ((count ?? 0) >= maxAttempts) {
    return { limited: true };
  }

  await admin.from("rate_limit_events").insert({ bucket_key: bucketKey });
  return { limited: false };
}

export function requestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
