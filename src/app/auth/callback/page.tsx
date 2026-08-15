"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("This sign-in link is missing its code. Request a new one from /login.");
      return;
    }

    const supabase = getSupabaseClient();
    supabase.auth.exchangeCodeForSession(code).then(async ({ data, error: exchangeError }) => {
      if (exchangeError || !data.session) {
        setError("This sign-in link is invalid or has expired. Request a new one from /login.");
        return;
      }

      const { data: member } = await supabase
        .from("members")
        .select("name")
        .eq("id", data.session.user.id)
        .maybeSingle();

      const onboarded = Boolean(member?.name && member.name.trim().length > 0);
      router.replace(onboarded ? "/" : "/onboarding");
    });
  }, [router, searchParams]);

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-sm">
        {error ? (
          <>
            <h1 className="font-heading text-xl font-semibold text-ink mb-2">
              Couldn&rsquo;t sign you in
            </h1>
            <p className="text-sm text-slate">{error}</p>
          </>
        ) : (
          <p className="text-sm text-slate">Signing you in…</p>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
