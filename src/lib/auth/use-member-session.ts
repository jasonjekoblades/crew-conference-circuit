"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

export type Member = {
  id: string;
  name: string | null;
  is_curator: boolean;
};

type MemberSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; session: Session; member: Member };

/**
 * Client-side counterpart to the RLS enforcement in supabase/migrations.
 * CLAUDE.md §6 is explicit that RLS is the real boundary — this hook exists
 * purely for UX routing (send people to the right screen), not as a
 * security control.
 *
 * "anonymous" covers two distinct underlying states that both need the same
 * treatment (send them to /enter): no Supabase session at all, OR a
 * Supabase anonymous session that exists but has no members row linked to
 * it yet (auth_user_id never matched — e.g. they closed the tab mid-/enter,
 * or opened a stale tab from before a relink). Either way there's nothing
 * useful to show them until /enter links a members row to this auth.uid().
 */
export function useMemberSession(): MemberSessionState {
  const [state, setState] = useState<MemberSessionState>({ status: "loading" });

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setState({ status: "anonymous" });
      return;
    }

    const { data: member, error } = await supabase
      .from("members")
      .select("id, name, is_curator")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (error || !member) {
      setState({ status: "anonymous" });
      return;
    }

    setState({ status: "ready", session, member: member as Member });
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabaseClient();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => listener.subscription.unsubscribe();
  }, [load]);

  return state;
}

export function isOnboarded(member: Member): boolean {
  return Boolean(member.name && member.name.trim().length > 0);
}
