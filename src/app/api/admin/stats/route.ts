import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// With no email or notifications (cut deliberately), this is the entire
// mechanism for a curator to see whether anything is being turned away:
// a gated read of what happened in roughly the last 24 hours, surfaced
// in /panel.
export async function GET(request: NextRequest) {
  const member = await requireMember(request);
  if (!member || !member.is_curator) {
    return NextResponse.json({ message: "Curators only." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentSince = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: aiUsedToday },
    { count: aiRejectedToday },
    { count: memberCapRejectedToday },
    { count: memberCount },
    { data: settingsRows },
    { data: recentMembers },
  ] = await Promise.all([
    // Only rows the rate limiter itself counted as "allowed" — the true
    // usage-against-the-cap number, not every lookup request (cache hits
    // never reach this bucket at all, by design — see the ai-lookup route).
    admin.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket_key", "ai-lookup:global").gte("created_at", since),
    admin.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket_key", "ai-lookup:global:rejected").gte("created_at", since),
    admin.from("rate_limit_events").select("id", { count: "exact", head: true }).eq("bucket_key", "member-cap:rejected").gte("created_at", since),
    admin.from("members").select("id", { count: "exact", head: true }),
    admin.from("app_settings").select("key, value").in("key", ["member_cap", "ai_global_daily_limit"]),
    admin.from("members").select("id, name, created_at").not("name", "is", null).gte("created_at", recentSince).order("created_at", { ascending: false }).limit(25),
  ]);

  const byKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const memberCap = parseInt(byKey.get("member_cap") ?? "16", 10);
  const aiGlobalCap = parseInt(byKey.get("ai_global_daily_limit") ?? "40", 10);

  return NextResponse.json({
    aiLookups: { usedLast24h: aiUsedToday ?? 0, cap: aiGlobalCap, rejectedLast24h: aiRejectedToday ?? 0 },
    members: { count: memberCount ?? 0, cap: memberCap, rejectedLast24h: memberCapRejectedToday ?? 0 },
    recentMembers: recentMembers ?? [],
  });
}
