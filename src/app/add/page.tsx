"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug } from "@/lib/conferences";
import { ConferenceRow } from "@/components/conference-row";
import { AddConferenceForm } from "@/components/add-conference-form";
import type { SeriesForMatching } from "@/lib/duplicate-check";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function AddConferencePage() {
  const router = useRouter();
  const session = useMemberSession();

  const [catalog, setCatalog] = useState<Conference[] | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesForMatching[] | null>(null);
  const [myAttendingIds, setMyAttendingIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");

  useEffect(() => {
    if (session.status === "anonymous") router.replace("/enter");
    else if (session.status === "ready" && !isOnboarded(session.member)) router.replace("/onboarding");
  }, [session, router]);

  const load = useCallback(async () => {
    if (session.status !== "ready") return;
    const supabase = getSupabaseClient();
    const [{ data: conf }, { data: series }, { data: mine }] = await Promise.all([
      supabase
        .from("conferences")
        .select("id, name, city, country, start_date, end_date, category, year, conference_series(slug)")
        .eq("status", "published")
        .order("start_date", { ascending: true }),
      supabase.from("conference_series").select("id, name, slug, aliases"),
      supabase.from("attendances").select("conference_id").eq("member_id", session.member.id),
    ]);

    type ConferenceRowShape = Omit<Conference, "slug"> & { year: number; conference_series: { slug: string } | null };
    setCatalog(
      ((conf as unknown as ConferenceRowShape[]) ?? []).map((c) => ({
        ...c,
        slug: c.conference_series ? conferenceSlug(c.conference_series.slug, c.year) : c.id,
      }))
    );
    setSeriesList((series as SeriesForMatching[]) ?? []);
    setMyAttendingIds(new Set((mine ?? []).map((r) => r.conference_id as string)));
  }, [session]);

  useEffect(() => {
    if (session.status === "ready" && isOnboarded(session.member)) load();
  }, [session, load]);

  const catalogMatches = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
  }, [catalog, search]);

  if (session.status !== "ready" || !isOnboarded(session.member)) return null;

  async function toggleCatalogAttendance(conferenceId: string) {
    if (session.status !== "ready" || pending.has(conferenceId)) return;
    const myId = session.member.id;
    const attending = myAttendingIds.has(conferenceId);

    setPending((p) => new Set(p).add(conferenceId));
    const supabase = getSupabaseClient();
    if (attending) {
      setMyAttendingIds((prev) => {
        const next = new Set(prev);
        next.delete(conferenceId);
        return next;
      });
      await supabase.from("attendances").delete().eq("conference_id", conferenceId).eq("member_id", myId);
    } else {
      setMyAttendingIds((prev) => new Set(prev).add(conferenceId));
      await supabase.from("attendances").insert({ conference_id: conferenceId, member_id: myId });
    }
    setPending((p) => {
      const next = new Set(p);
      next.delete(conferenceId);
      return next;
    });
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs font-medium text-slate">
            ← Home
          </Link>
        </div>

        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink mb-1">Add a conference</h1>
          <p className="text-sm text-slate">Search what CREW already has, or add one that&rsquo;s missing.</p>
        </div>

        <section>
          <p className="label mb-2">Search the catalog</p>
          <Input placeholder="Conference name or city" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Card className="border-line overflow-hidden py-0 mt-3">
            {catalog === null ? (
              <p className="text-sm text-slate p-4">Loading…</p>
            ) : catalogMatches.length === 0 ? (
              <p className="text-sm text-slate p-4">Nothing matches — add it below.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {catalogMatches.map((c) => (
                  <ConferenceRow
                    key={c.id}
                    conference={c}
                    going={myAttendingIds.has(c.id)}
                    onToggle={() => toggleCatalogAttendance(c.id)}
                    disabled={pending.has(c.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="pt-2 border-t border-line">
          <p className="label mb-1 pt-4">Can&rsquo;t find it? Add it</p>
          <p className="text-sm text-slate mb-4">Name, dates, and city — you type it, we&rsquo;ll show it right away.</p>

          {seriesList && catalog && (
            <AddConferenceForm
              memberId={session.member.id}
              seriesList={seriesList}
              catalog={catalog}
              myAttendingIds={myAttendingIds}
              onToggleCatalogAttendance={toggleCatalogAttendance}
              onDuplicateMatched={(conference) => router.push(`/c/${conference.slug}`)}
              onCreated={(conference) => router.push(`/c/${conference.slug}`)}
            />
          )}
        </section>
      </div>
    </main>
  );
}
