"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug, formatDateRange } from "@/lib/conferences";
import { findDuplicateCandidates, type SeriesForMatching, type MatchCandidate } from "@/lib/duplicate-check";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * The manual-entry + duplicate-check + AI-lookup portion of "add a
 * conference" (CLAUDE.md §9), shared between /add and onboarding step 2
 * (Run 6, Stage 4 — "same flow as /add... don't build a lesser second
 * version"). Deliberately does NOT own the "search the existing catalog"
 * list — that part already differs slightly by context (/add has its own
 * search box; onboarding reuses its existing tap-to-toggle grid) and isn't
 * where the duplicate-detection/AI-lookup complexity actually lives.
 *
 * `deferAttendance`: /add's member is already onboarded, so a brand-new
 * conference is attended immediately on creation, same as everywhere else
 * in the app. Onboarding batches ALL attendance writes into one insert when
 * step 2's Continue is pressed — inserting immediately here too would hit
 * `attendances`' unique(member_id, conference_id) constraint a second time
 * when that batch runs. Set `deferAttendance` there; `onCreated` is then
 * responsible for tracking the new conference as "selected" itself.
 */
export function AddConferenceForm({
  memberId,
  seriesList,
  catalog,
  myAttendingIds,
  onToggleCatalogAttendance,
  onCreated,
  deferAttendance = false,
}: {
  memberId: string;
  seriesList: SeriesForMatching[];
  catalog: Conference[];
  myAttendingIds: Set<string>;
  onToggleCatalogAttendance: (conferenceId: string) => void;
  onCreated: (conference: Conference) => void;
  deferAttendance?: boolean;
}) {
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

  const duplicateCandidates: MatchCandidate[] = useMemo(
    () => findDuplicateCandidates(name, seriesList),
    [name, seriesList]
  );

  const candidateOccurrences = useMemo(() => {
    const map = new Map<string, Conference[]>();
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

  async function runAiLookup() {
    if (!name.trim()) return;
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

    let slugBase = slugify(name.trim());
    if (!slugBase) slugBase = "conference";
    let uniqueSlug = slugBase;
    let attempt = 1;
    while (seriesList.some((s) => s.slug === uniqueSlug)) {
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
        created_by: memberId,
      })
      .select("id, name, city, country, start_date, end_date, category")
      .single();

    if (confError || !newConference) {
      setSubmitting(false);
      setError("Couldn't create that conference. Try again.");
      return;
    }

    if (!deferAttendance) {
      const { error: attendError } = await supabase
        .from("attendances")
        .insert({ conference_id: newConference.id, member_id: memberId });
      if (attendError) {
        setSubmitting(false);
        setError("Created the conference, but couldn't mark you as going. Try the catalog list above.");
        return;
      }
    }

    setSubmitting(false);
    setName("");
    setStartDate("");
    setEndDate("");
    setCity("");
    setWebsite("");
    onCreated({ ...newConference, slug: conferenceSlug(uniqueSlug, year) });
  }

  return (
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
                      onClick={() => onToggleCatalogAttendance(occ.id)}
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
        <Input id="website" type="url" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
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
              {aiResult.start_date && aiResult.end_date ? formatDateRange(aiResult.start_date, aiResult.end_date) : "dates unknown"}
              {aiResult.city && ` · ${aiResult.city}`}
            </p>
            {aiDatesDisagree && (
              <p className="text-[11.5px] text-error">
                That doesn&rsquo;t match the dates you typed ({aiTypedDatesAtCallTime?.start}–{aiTypedDatesAtCallTime?.end}). Double-check before using this.
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
  );
}
