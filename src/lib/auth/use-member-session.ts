"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

export type Member = {
  id: string;
  email: string;
  name: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  status: "pending" | "approved" | "rejected";
  visibility: "all_members" | "co_attendees";
  is_curator: boolean;
};

type MemberSessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; session: Session; member: Member };

/**
 * Client-side counterpart to the RLS enforcement in supabase/migrations.
 * CLAUDE.md §6 is explicit that RLS is the real boundary ("Enforce this in
 * Postgres RLS, not only in the app layer") — this hook exists purely for
 * UX routing (send people to the right screen), not as a security control.
 *
 * Only 'approved' members ever obtain a session in this app's design: a
 * magic link is sent only after /api/admin/approve or a repeat /api/signup
 * call for an already-approved email, so a 'pending' or 'rejected' member
 * has an auth.users row but has never received a link to click. Because of
 * that, a real session here always corresponds to an approved member —
 * "onboarded or not" (member.name is null until /onboarding is completed)
 * is the only routing distinction left to make once status is ready.
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
      .select("id, email, name, title, company, linkedin_url, status, visibility, is_curator")
      .eq("id", session.user.id)
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
