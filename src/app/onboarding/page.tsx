"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug } from "@/lib/conferences";
import { ConferenceRow } from "@/components/conference-row";
import { AddConferenceForm } from "@/components/add-conference-form";
import type { SeriesForMatching } from "@/lib/duplicate-check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Step = 1 | 2 | 3;

type PayoffEntry =
  | { conference: Conference; others: { name: string }[] }
  | { conference: Conference; others: null }; // null = "first here"

type Teaser = { name: string; city: string; attendee_count: number };

export default function OnboardingPage() {
  const router = useRouter();
  const session = useMemberSession();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [conferences, setConferences] = useState<Conference[] | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesForMatching[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [payoff, setPayoff] = useState<PayoffEntry[] | null>(null);
  const [skipTeaser, setSkipTeaser] = useState<Teaser[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/enter");
    } else if (session.status === "ready" && isOnboarded(session.member)) {
      router.replace("/");
    }
  }, [session, router]);

  useEffect(() => {
    if (step !== 2 || conferences !== null) return;
    const supabase = getSupabaseClient();
    Promise.all([
      supabase
        .from("conferences")
        .select("id, name, city, country, start_date, end_date, category, year, conference_series(slug)")
        .eq("status", "published")
        .order("start_date", { ascending: true }),
      supabase.from("conference_series").select("id, name, slug, aliases"),
    ]).then(([{ data: conf }, { data: series }]) => {
      type ConferenceRowShape = Omit<Conference, "slug"> & { year: number; conference_series: { slug: string } | null };
      setConferences(
        ((conf as unknown as ConferenceRowShape[]) ?? []).map((c) => ({
          ...c,
          slug: c.conference_series ? conferenceSlug(c.conference_series.slug, c.year) : c.id,
        }))
      );
      setSeriesList((series as SeriesForMatching[]) ?? []);
    });
  }, [step, conferences]);

  function toggleConference(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStep1Continue(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStep(2);
  }

  async function handleStep2Continue() {
    if (session.status !== "ready") return;
    setSubmitting(true);
    setError(null);

    const supabase = getSupabaseClient();
    const trimmedName = name.trim();

    const { error: nameError } = await supabase
      .from("members")
      .update({ name: trimmedName })
      .eq("id", session.member.id);

    if (nameError) {
      setSubmitting(false);
      setError("Couldn't save that. Try again.");
      return;
    }

    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      const { error: attendError } = await supabase
        .from("attendances")
        .insert(ids.map((conference_id) => ({ member_id: session.member.id, conference_id })));
      if (attendError) {
        setSubmitting(false);
        setError("Couldn't save your conferences. Try again.");
        return;
      }
    }

    if (ids.length === 0) {
      const { data: teaserData } = await supabase.rpc("login_teaser");
      setSkipTeaser((teaserData as Teaser[]) ?? []);
    } else {
      const entries: PayoffEntry[] = [];
      for (const id of ids) {
        const conference = conferences?.find((c) => c.id === id);
        if (!conference) continue;

        const { data: rows } = await supabase
          .from("attendances")
          .select("member_id")
          .eq("conference_id", id);
        const otherIds = (rows ?? [])
          .map((r) => r.member_id)
          .filter((mid) => mid !== session.member.id);

        if (otherIds.length === 0) {
          entries.push({ conference, others: null });
          continue;
        }

        const { data: others } = await supabase
          .from("members")
          .select("name")
          .in("id", otherIds);

        entries.push({
          conference,
          others: (others ?? []).filter((o) => o.name).map((o) => ({ name: o.name as string })),
        });
      }
      setPayoff(entries);
    }

    setSubmitting(false);
    setStep(3);
  }

  if (session.status !== "ready" || isOnboarded(session.member)) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {step === 1 && (
          <>
            <h1 className="font-heading text-2xl font-semibold text-ink text-center mb-1">
              What should other members call you?
            </h1>
            <p className="text-sm text-slate text-center mb-6">
              Just your name — that&rsquo;s the minimum for anyone to recognize you.
            </p>
            <Card className="border-line">
              <CardContent className="pt-6">
                <form onSubmit={handleStep1Continue} className="space-y-4">
                  <Input
                    autoFocus
                    required
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button type="submit" className="w-full" disabled={!name.trim()}>
                    Continue
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-heading text-2xl font-semibold text-ink text-center mb-1">
              What conferences are you going to?
            </h1>
            <p className="text-sm text-slate text-center mb-6">
              Tap any you&rsquo;re attending. Other CREW members will see you&rsquo;re
              going.
            </p>
            <Card className="border-line overflow-hidden py-0">
              {conferences === null ? (
                <p className="text-sm text-slate p-4">Loading…</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  {conferences.map((c) => (
                    <ConferenceRow
                      key={c.id}
                      conference={c}
                      going={selectedIds.has(c.id)}
                      onToggle={() => toggleConference(c.id)}
                      disabled={submitting}
                    />
                  ))}
                </div>
              )}
            </Card>
            <div className="mt-3 text-center">
              <button
                type="button"
                className="text-[12.5px] text-slate underline"
                onClick={() => setShowAddForm((v) => !v)}
              >
                {showAddForm ? "Hide" : "Can't find your conference? Add it"}
              </button>
            </div>

            {showAddForm && seriesList && (
              <div className="mt-4 rounded-lg border border-line bg-card p-4">
                <AddConferenceForm
                  memberId={session.member.id}
                  seriesList={seriesList}
                  catalog={conferences ?? []}
                  myAttendingIds={selectedIds}
                  onToggleCatalogAttendance={toggleConference}
                  deferAttendance
                  onCreated={(conference) => {
                    setConferences((prev) => [...(prev ?? []), conference]);
                    setSelectedIds((prev) => new Set(prev).add(conference.id));
                    setShowAddForm(false);
                  }}
                />
              </div>
            )}

            {error && (
              <Alert className="border-error bg-error-bg mt-4">
                <AlertDescription className="text-error">{error}</AlertDescription>
              </Alert>
            )}
            <div className="mt-4 space-y-2">
              <Button className="w-full" disabled={submitting} onClick={handleStep2Continue}>
                {submitting ? "Saving…" : selectedIds.size > 0 ? "Continue" : "Skip for now"}
              </Button>
              {selectedIds.size === 0 && (
                <p className="text-[11.5px] text-slate text-center">You can add conferences later.</p>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-heading text-2xl font-semibold text-ink text-center mb-6">
              {payoff && payoff.length > 0 ? "Here's who you'll see" : "Where CREW is going"}
            </h1>

            {payoff && payoff.length > 0 ? (
              <div className="space-y-4">
                {payoff.map(({ conference, others }) => (
                  <Card key={conference.id} className="border-line">
                    <CardHeader className="pb-2">
                      <div className="font-heading text-[16px] text-ink">{conference.name}</div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {others === null ? (
                        <p className="text-sm text-slate">
                          You&rsquo;re the first CREW member here. Others will see you when
                          they add it.
                        </p>
                      ) : (
                        <p className="text-sm text-ink-2">
                          You&rsquo;re going with{" "}
                          <span className="font-medium">
                            {others.length} other CREW member{others.length === 1 ? "" : "s"}
                          </span>
                          : {others.map((o) => o.name).join(", ")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate text-center mb-3">
                  You can always add conferences later. Here&rsquo;s where CREW is going now:
                </p>
                {(skipTeaser ?? []).map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-3"
                  >
                    <div>
                      <div className="font-heading text-[15px] text-ink">{t.name}</div>
                      <div className="text-[11.5px] text-slate">{t.city}</div>
                    </div>
                    <span className="text-xs font-semibold text-slate">
                      {t.attendee_count} going
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full mt-6" onClick={() => router.push("/")}>
              {payoff && payoff.length > 0 ? "Continue" : "Take me in"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
