"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug, formatDateRange } from "@/lib/conferences";

// CLAUDE.md §8: "deliberately thin" — name, initials avatar, and every
// conference that member is attending. Nothing else. With profile fields
// gone entirely (Run 5, Stage 1b) this is the whole card, on purpose.
type MemberCard = { id: string; name: string | null };

export default function MemberCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = use(params);
  const router = useRouter();
  const session = useMemberSession();

  const [member, setMember] = useState<MemberCard | null>(null);
  const [conferences, setConferences] = useState<Conference[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (session.status === "anonymous") router.replace("/enter");
    else if (session.status === "ready" && !isOnboarded(session.member)) router.replace("/onboarding");
  }, [session, router]);

  useEffect(() => {
    if (session.status !== "ready" || !isOnboarded(session.member)) return;

    const supabase = getSupabaseClient();
    supabase
      .from("members")
      .select("id, name")
      .eq("id", memberId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setNotFound(true);
          return;
        }
        setMember(data as MemberCard);
      });

    supabase
      .from("attendances")
      .select("conferences(id, name, city, country, start_date, end_date, category, year, conference_series(slug))")
      .eq("member_id", memberId)
      .then(({ data }) => {
        type ConferenceRow = Omit<Conference, "slug"> & { year: number; conference_series: { slug: string } | null };
        const rows = (data ?? []) as unknown as { conferences: ConferenceRow | null }[];
        const list = rows
          .filter((r) => r.conferences)
          .map((r) => {
            const c = r.conferences as ConferenceRow;
            return { ...c, slug: c.conference_series ? conferenceSlug(c.conference_series.slug, c.year) : c.id };
          })
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        setConferences(list);
      });
  }, [session, memberId]);

  if (session.status !== "ready" || !isOnboarded(session.member)) return null;

  if (notFound) {
    return (
      <main className="min-h-dvh bg-paper flex items-center justify-center px-4">
        <p className="text-sm text-slate">Member not found.</p>
      </main>
    );
  }

  const initials = (member?.name ?? "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <Link href="/" className="text-xs font-medium text-slate">
          ← Home
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-base font-semibold text-white bg-ink-2">
            {initials}
          </div>
          <h1 className="font-heading text-2xl font-semibold text-ink">
            {member?.name ?? "Loading…"}
          </h1>
        </div>

        <div>
          <p className="label mb-2">Conferences</p>
          {conferences === null ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : conferences.length === 0 ? (
            <p className="text-sm text-slate">Nothing yet.</p>
          ) : (
            <div className="border border-line bg-card rounded-lg overflow-hidden">
              {conferences.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.slug}`}
                  className="block px-4 py-3 border-t border-line first:border-t-0"
                >
                  <div className="font-heading text-[14.5px] text-ink">{c.name}</div>
                  <div className="text-[11.5px] text-slate mt-0.5">
                    {formatDateRange(c.start_date, c.end_date)} · {c.city}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
