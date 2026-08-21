"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug, formatDateRange } from "@/lib/conferences";
import { ConferenceRow } from "@/components/conference-row";
import { findDuplicateCandidates, type SeriesForMatching, type MatchCandidate } from "@/lib/duplicate-check";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// CLAUDE.md §13's corrected category list — not derived from data anywhere
// else, so kept local here rather than in a shared lib nothing else needs.
const CATEGORIES = [
  "AI & Data",
  "Enterprise Tech",
  "Cloud & Infrastructure",
  "Fintech & Payments",
  "Private Equity & Finance",
  "Healthcare & Pharma",
  "Travel & Hospitality",
];

type AiLookupResult = {
  found: boolean;
  name?: string;
  start_date?: string;
  end_date?: string;
  city?: string;
  country?: string;
  website?: string;
  confidence?: "high" | "low";
  reason?: string;
};

export default function AddConferencePage() {
  const router = useRouter();
  const session = useMemberSession();

  const [catalog, setCatalog] = useState<Conference[] | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesForMatching[] | null>(null);
  const [myAttendingIds, setMyAttendingIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [dismissedDuplicates, setDismissedDuplicates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiLookupResult | null>(null);
  const [aiTypedDatesAtCallTime, setAiTypedDatesAtCallTime] = useState<{ start: string; end: string } | null>(null);

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
    return catalog.filter(
      (c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const duplicateCandidates: MatchCandidate[] = useMemo(() => {
    if (!seriesList) return [];
    return findDuplicateCandidates(name, seriesList);
  }, [name, seriesList]);

  // A candidate's own conference rows (by year), so the member can compare
  // dates against what they typed — CLAUDE.md §9: "match on dates, not just
  // name," never resolve on name alone.
  const candidateOccurrences = useMemo(() => {
    const map = new Map<string, Conference[]>();
    if (!catalog) return map;
    for (const candidate of duplicateCandidates) {
      map.set(
        candidate.series.id,
        catalog.filter((c) => c.slug.startsWith(candidate.series.slug + "-"))
      );
    }
    return map;
  }, [duplicateCandidates, catalog]);

  useEffect(() => {
    setDismissedDuplicates(false);
  }, [name]);

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

  async function runAiLookup() {
    if (session.status !== "ready" || !name.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiTypedDatesAtCallTime({ start: startDate, end: endDate });

    const { data: sessionData } = await getSupabaseClient().auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAiLoading(false);
      setAiError("Session expired — refresh and try again.");
      return;
    }

    try {
      const res = await fetch("/api/conferences/ai-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAiError(body.message ?? "Lookup unavailable — enter details manually below.");
      } else {
        setAiResult(body.result as AiLookupResult);
      }
    } catch {
      setAiError("Lookup unavailable — enter details manually below.");
    }
    setAiLoading(false);
  }

  function applyAiSuggestion() {
    if (!aiResult?.found) return;
    if (aiResult.city) setCity(aiResult.city);
    if (aiResult.website) setWebsite(aiResult.website);
    if (!startDate && aiResult.start_date) setStartDate(aiResult.start_date);
    if (!endDate && aiResult.end_date) setEndDate(aiResult.end_date);
    setAiResult(null);
  }

  const aiDatesDisagree =
    aiResult?.found &&
    aiTypedDatesAtCallTime?.start &&
    aiResult.start_date &&
    aiTypedDatesAtCallTime.start !== aiResult.start_date;

  const blockedByDuplicates = duplicateCandidates.length > 0 && !dismissedDuplicates;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (session.status !== "ready") return;
    if (!name.trim() || !startDate || !endDate || !city.trim()) {
      setError("Name, dates, and city are required.");
      return;
    }
    if (blockedByDuplicates) {
      setError("Check the possible matches above first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const supabase = getSupabaseClient();
    const myId = session.member.id;

    let slugBase = slugify(name.trim());
    if (!slugBase) slugBase = "conference";
    let uniqueSlug = slugBase;
    let attempt = 1;
    while (seriesList?.some((s) => s.slug === uniqueSlug)) {
      attempt += 1;
      uniqueSlug = `${slugBase}-${attempt}`;
    }

    const { data: newSeries, error: seriesError } = await supabase
      .from("conference_series")
      .insert({ name: name.trim(), slug: uniqueSlug, category, website: website.trim() || null, aliases: [] })
      .select("id")
      .single();

    if (seriesError || !newSeries) {
      setSubmitting(false);
      setError("Couldn't create that conference. Try again.");
      return;
    }

    const year = new Date(startDate + "T00:00:00").getFullYear();

    const { data: newConference, error: confError } = await supabase
      .from("conferences")
      .insert({
        series_id: newSeries.id,
        year,
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        city: city.trim(),
        country: "",
        website: website.trim() || null,
        category,
        status: "published",
        source: "member",
        verified: false,
        created_by: myId,
      })
      .select("id")
      .single();

    if (confError || !newConference) {
      setSubmitting(false);
      setError("Couldn't create that conference. Try again.");
      return;
    }

    const { error: attendError } = await supabase
      .from("attendances")
      .insert({ conference_id: newConference.id, member_id: myId });

    setSubmitting(false);
    if (attendError) {
      setError("Created the conference, but couldn't mark you as going. Open it from Browse all.");
      return;
    }

    router.push(`/c/${uniqueSlug}-${year}`);
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
          <Input
            placeholder="Conference name or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <p className="text-sm text-slate mb-4">
            Name, dates, and city — you type it, we&rsquo;ll show it right away.
          </p>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="conf-name">Conference name</Label>
              <Input
                id="conf-name"
                required
                placeholder="e.g. Money20/20 USA"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {duplicateCandidates.length > 0 && (
              <Alert className="border-line bg-paper">
                <AlertDescription>
                  <p className="text-[13px] font-medium text-ink mb-2">
                    Did you mean one of these already-added conferences?
                  </p>
                  <div className="space-y-2">
                    {duplicateCandidates.map((candidate) => (
                      <div key={candidate.series.id} className="rounded-md border border-line bg-card p-2.5">
                        <div className="text-[12.5px] font-semibold text-ink">{candidate.series.name}</div>
                        {(candidateOccurrences.get(candidate.series.id) ?? []).map((occ) => (
                          <button
                            key={occ.id}
                            type="button"
                            className="mt-1 flex w-full items-center justify-between text-left text-[11.5px] text-slate hover:text-ink"
                            disabled={pending.has(occ.id)}
                            onClick={() => toggleCatalogAttendance(occ.id)}
                          >
                            <span>
                              {formatDateRange(occ.start_date, occ.end_date)} · {occ.city}
                            </span>
                            <span className="font-medium text-brass">
                              {myAttendingIds.has(occ.id) ? "✓ Going" : "Mark as going →"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {!dismissedDuplicates && (
                    <button
                      type="button"
                      className="mt-3 text-[11.5px] underline text-slate"
                      onClick={() => setDismissedDuplicates(true)}
                    >
                      None of these — this is a different conference
                    </button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Starts</Label>
                <Input id="start-date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">Ends</Label>
                <Input id="end-date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" required placeholder="e.g. Las Vegas" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">Website (optional)</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://…"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] text-slate">
                  Not sure of the exact dates or website? Let AI check the organizer&rsquo;s site.
                </p>
                <Button type="button" variant="outline" size="sm" disabled={!name.trim() || aiLoading} onClick={runAiLookup}>
                  {aiLoading ? "Checking…" : "Look it up"}
                </Button>
              </div>

              {aiError && <p className="text-[11.5px] text-slate mt-2">{aiError}</p>}

              {aiResult && !aiResult.found && (
                <p className="text-[11.5px] text-slate mt-2">
                  Couldn&rsquo;t confidently find that one — enter the details above manually.
                </p>
              )}

              {aiResult?.found && (
                <div className="mt-3 rounded-md border border-line bg-paper p-2.5 space-y-1.5">
                  <p className="text-[12px] text-ink-2">
                    Found via web search{aiResult.confidence === "low" ? " (low confidence)" : ""}:
                  </p>
                  <p className="text-[12.5px] text-ink">
                    {aiResult.start_date && aiResult.end_date
                      ? formatDateRange(aiResult.start_date, aiResult.end_date)
                      : "dates unknown"}
                    {aiResult.city && ` · ${aiResult.city}`}
                  </p>
                  {aiDatesDisagree && (
                    <p className="text-[11.5px] text-error">
                      That doesn&rsquo;t match the dates you typed ({aiTypedDatesAtCallTime?.start}–
                      {aiTypedDatesAtCallTime?.end}). Double-check before using this.
                    </p>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={applyAiSuggestion}>
                    Use these details
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <Alert className="border-error bg-error-bg">
                <AlertDescription className="text-error">{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting || blockedByDuplicates}>
              {submitting ? "Adding…" : "Add & mark me going"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
