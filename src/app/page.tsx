"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import { Button } from "@/components/ui/button";

type Conference = {
  id: string;
  name: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
};

export default function HomeStubPage() {
  const router = useRouter();
  const session = useMemberSession();
  const [conferences, setConferences] = useState<Conference[] | null>(null);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/login");
    } else if (session.status === "ready" && !isOnboarded(session.member)) {
      router.replace("/onboarding");
    }
  }, [session, router]);

  useEffect(() => {
    if (session.status !== "ready") return;
    getSupabaseClient()
      .from("conferences")
      .select("id, name, city, country, start_date, end_date")
      .order("start_date", { ascending: true })
      .then(({ data }) => setConferences((data as Conference[]) ?? []));
  }, [session]);

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/login");
  }

  if (session.status !== "ready" || !isOnboarded(session.member)) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <header className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-xl font-semibold text-ink">
            Where&rsquo;s <span className="text-brass">CREW</span>
          </h1>
          <div className="flex items-center gap-3">
            {session.member.is_curator && (
              <Link href="/admin" className="text-xs font-medium text-ink-2 underline">
                Admin
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </header>

        <p className="text-sm text-slate mb-6">
          Signed in as <span className="font-medium text-ink-2">{session.member.email}</span>.
          The year grid (tap-to-toggle attendance, rosters, filters) is Milestone 2 — this is
          just proof that auth and the seeded catalog work end to end.
        </p>

        <p className="label mb-3">Seeded conferences</p>
        {conferences === null ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : conferences.length === 0 ? (
          <p className="text-sm text-slate">
            No conferences yet — run <code>npm run seed</code>.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-card overflow-hidden">
            {conferences.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="font-heading text-[15px] text-ink">{c.name}</div>
                <div className="text-[11.5px] text-slate mt-0.5">
                  {c.start_date} – {c.end_date} · {c.city}, {c.country}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
