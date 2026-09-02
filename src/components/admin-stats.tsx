"use client";

import { useEffect, useState } from "react";

type Stats = {
  aiLookups: { usedLast24h: number; cap: number; rejectedLast24h: number };
  members: { count: number; cap: number; rejectedLast24h: number };
  recentMembers: { id: string; name: string | null; created_at: string }[];
};

/**
 * With no email or notifications (cut deliberately), this is the entire
 * "did anything get turned away" mechanism: a curator opens /panel and
 * sees it immediately. Numbers are "last 24h" to match the rolling window
 * the actual rate limiters use — not calendar-day, which would drift from
 * what's really gating access.
 */
export function AdminStats({ authHeader }: { authHeader: () => Promise<{ Authorization: string }> }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    authHeader().then((headers) =>
      fetch("/api/admin/stats", { headers }).then(async (res) => {
        if (res.ok) setStats(await res.json());
      })
    );
  }, [authHeader]);

  if (!stats) return <p className="text-sm text-slate">Loading…</p>;

  const memberPct = stats.members.cap > 0 ? stats.members.count / stats.members.cap : 0;
  const memberFlag = stats.members.count >= stats.members.cap ? "full" : memberPct >= 0.9 ? "close" : null;
  const aiFlag = stats.aiLookups.rejectedLast24h > 0;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-4 py-3 ${memberFlag ? "border-error bg-error-bg" : "border-line bg-card"}`}>
        <div className={`text-sm font-medium ${memberFlag ? "text-error" : "text-ink"}`}>
          Members: {stats.members.count} / {stats.members.cap}
          {memberFlag === "full" && " — FULL"}
          {memberFlag === "close" && " — nearly full"}
        </div>
        {stats.members.rejectedLast24h > 0 && (
          <div className="text-[12px] text-error mt-1">
            {stats.members.rejectedLast24h} {stats.members.rejectedLast24h === 1 ? "person was" : "people were"} turned away
            (pilot full) in the last 24h.
          </div>
        )}
      </div>

      <div className={`rounded-lg border px-4 py-3 ${aiFlag ? "border-error bg-error-bg" : "border-line bg-card"}`}>
        <div className={`text-sm font-medium ${aiFlag ? "text-error" : "text-ink"}`}>
          AI lookups (last 24h): {stats.aiLookups.usedLast24h} / {stats.aiLookups.cap}
        </div>
        {aiFlag && (
          <div className="text-[12px] text-error mt-1">
            The global cap was hit — {stats.aiLookups.rejectedLast24h} lookup attempt
            {stats.aiLookups.rejectedLast24h === 1 ? "" : "s"} fell back to manual entry in the last 24h.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-card px-4 py-3">
        <div className="text-sm font-medium text-ink mb-2">Recently joined (last 5 days)</div>
        {stats.recentMembers.length === 0 ? (
          <p className="text-[12px] text-slate">Nobody new yet.</p>
        ) : (
          <ul className="space-y-1">
            {stats.recentMembers.map((m) => (
              <li key={m.id} className="text-[12px] text-ink-2 flex justify-between">
                <span>{m.name}</span>
                <span className="text-slate">{new Date(m.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
