"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";

function PendingContent() {
  const router = useRouter();
  const session = useMemberSession();
  const searchParams = useSearchParams();
  const full = searchParams.get("full") === "1";

  // A stale bookmark from before approval, or someone who just clicked the
  // magic link and landed here by habit — send them onward. Members only
  // ever have a session once approved (see use-member-session.ts), so a
  // "ready" session here always means: don't leave them stuck on /pending.
  useEffect(() => {
    if (session.status === "ready") {
      router.replace(isOnboarded(session.member) ? "/" : "/onboarding");
    }
  }, [session, router]);

  if (session.status === "loading" || session.status === "ready") {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-semibold text-ink mb-3">
          Your request is with the organizer.
        </h1>
        <p className="text-sm text-slate leading-relaxed">
          {full
            ? "The pilot is currently full. You're on the list — you'll get a sign-in link by email if a spot opens up."
            : "You'll get a sign-in link by email once it's approved."}
        </p>
      </div>
    </main>
  );
}

export default function PendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingContent />
    </Suspense>
  );
}
