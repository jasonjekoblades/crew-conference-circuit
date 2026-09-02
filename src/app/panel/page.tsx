"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession } from "@/lib/auth/use-member-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminConferenceList } from "@/components/admin-conference-list";
import { AdminStats } from "@/components/admin-stats";
import { AdminSettings } from "@/components/admin-settings";

type MemberRow = { id: string; name: string | null; is_curator: boolean; created_at: string };

export default function AdminPage() {
  const router = useRouter();
  const session = useMemberSession();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    const { data } = await getSupabaseClient()
      .from("members")
      .select("id, name, is_curator, created_at")
      .order("created_at", { ascending: true });
    setMembers((data as MemberRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/enter");
    } else if (session.status === "ready" && !session.member.is_curator) {
      router.replace("/");
    }
  }, [session, router]);

  useEffect(() => {
    if (session.status === "ready" && session.member.is_curator) load();
  }, [session, load]);

  async function handleRemove(memberId: string) {
    if (session.status !== "ready") return;
    setActioningId(memberId);
    setError(null);

    // Routed through the server, not a direct client delete — so the
    // removed member's underlying anonymous auth session is actually
    // deleted too, not just their members row. See /api/admin/remove-member.
    const res = await fetch("/api/admin/remove-member", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ memberId }),
    });

    if (!res.ok) {
      setError("Couldn't remove that member.");
    } else {
      await load();
    }
    setActioningId(null);
  }

  if (session.status !== "ready" || !session.member.is_curator) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-heading text-xl font-semibold text-ink mb-6">Admin</h1>

        <p className="label mb-3">At a glance</p>
        <AdminStats authHeader={authHeader} />

        <p className="label mb-3 mt-8">Settings</p>
        <AdminSettings authHeader={authHeader} />

        <p className="label mb-3 mt-8">Members ({members?.length ?? 0})</p>

        {members === null ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate">Nobody yet.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    {m.name ?? <span className="text-slate italic">no name yet</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {m.is_curator && (
                      <Badge variant="outline" className="text-[10px] text-brass border-brass">
                        Curator
                      </Badge>
                    )}
                    <span className="text-[10px] text-slate">
                      joined {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {m.id !== session.member.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-error border-error"
                    disabled={actioningId === m.id}
                    onClick={() => handleRemove(m.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-error mt-3">{error}</p>}

        <p className="label mb-3 mt-8">Conferences</p>
        <AdminConferenceList authHeader={authHeader} />
      </div>
    </main>
  );
}
