"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession } from "@/lib/auth/use-member-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PendingMember = {
  id: string;
  email: string;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const session = useMemberSession();
  const [pending, setPending] = useState<PendingMember[] | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const { data } = await getSupabaseClient()
      .from("members")
      .select("id, email, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending((data as PendingMember[]) ?? []);
  }, []);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/login");
    } else if (session.status === "ready" && !session.member.is_curator) {
      router.replace("/");
    }
  }, [session, router]);

  useEffect(() => {
    if (session.status === "ready" && session.member.is_curator) {
      loadPending();
    }
  }, [session, loadPending]);

  async function callAdminAction(action: "approve" | "reject", memberId: string) {
    if (session.status !== "ready") return;
    setActioningId(memberId);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setActionError(data.message ?? "That action failed.");
        return;
      }
      await loadPending();
    } catch {
      setActionError("Couldn't reach the server.");
    } finally {
      setActioningId(null);
    }
  }

  if (session.status !== "ready" || !session.member.is_curator) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-heading text-xl font-semibold text-ink mb-6">Admin</h1>

        <p className="label mb-3">Pending approval</p>

        {pending === null ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-slate">Nothing waiting.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-ink">{m.email}</div>
                  <Badge variant="outline" className="mt-1 text-[10px] text-slate border-line">
                    requested {new Date(m.created_at).toLocaleDateString()}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={actioningId === m.id}
                    onClick={() => callAdminAction("approve", m.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actioningId === m.id}
                    onClick={() => callAdminAction("reject", m.id)}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {actionError && <p className="text-sm text-error mt-3">{actionError}</p>}
      </div>
    </main>
  );
}
