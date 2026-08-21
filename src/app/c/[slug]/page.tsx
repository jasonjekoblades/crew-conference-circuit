"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import { formatDateRange } from "@/lib/conferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Route param is `<series-slug>-<year>` (e.g. money2020-usa-2026), built by
// conferenceSlug() in @/lib/conferences. Resolved here to the conference's
// real uuid via a join on conference_series, then every subsequent query
// uses that resolved id — none of the seed series slugs end in digits, so
// splitting on a trailing 4-digit year is unambiguous.
type ConferenceDetail = {
  id: string;
  name: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  website: string | null;
  verified: boolean;
};

type Attendee = { member_id: string; note: string | null; name: string | null };

function parseConferenceSlug(slug: string): { seriesSlug: string; year: number } | null {
  const match = /^(.+)-(\d{4})$/.exec(slug);
  if (!match) return null;
  return { seriesSlug: match[1], year: parseInt(match[2], 10) };
}

export default function ConferenceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: routeSlug } = use(params);
  const router = useRouter();
  const session = useMemberSession();

  const [conference, setConference] = useState<ConferenceDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (session.status === "anonymous") router.replace("/enter");
    else if (session.status === "ready" && !isOnboarded(session.member)) router.replace("/onboarding");
  }, [session, router]);

  const load = useCallback(async () => {
    const parsed = parseConferenceSlug(routeSlug);
    if (!parsed) {
      setNotFound(true);
      return;
    }

    const supabase = getSupabaseClient();
    const { data: conf } = await supabase
      .from("conferences")
      .select("id, name, city, country, start_date, end_date, website, verified, year, conference_series!inner(slug)")
      .eq("year", parsed.year)
      .eq("conference_series.slug", parsed.seriesSlug)
      .maybeSingle();

    if (!conf) {
      setNotFound(true);
      return;
    }
    const conferenceId = conf.id;
    setConference(conf as ConferenceDetail);

    const { data: attRows } = await supabase
      .from("attendances")
      .select("member_id, note")
      .eq("conference_id", conferenceId);

    const memberIds = (attRows ?? []).map((r) => r.member_id);
    const { data: memberRows } =
      memberIds.length > 0
        ? await supabase.from("members").select("id, name").in("id", memberIds)
        : { data: [] };

    const memberById = new Map((memberRows ?? []).map((m) => [m.id, m]));
    setAttendees(
      (attRows ?? []).map((r) => ({
        member_id: r.member_id,
        note: r.note,
        name: memberById.get(r.member_id)?.name ?? null,
      }))
    );
  }, [routeSlug]);

  useEffect(() => {
    if (session.status === "ready" && isOnboarded(session.member)) load();
  }, [session, load]);

  if (session.status !== "ready" || !isOnboarded(session.member)) return null;
  if (notFound) {
    return (
      <main className="min-h-dvh bg-paper flex items-center justify-center px-4">
        <p className="text-sm text-slate">Conference not found.</p>
      </main>
    );
  }
  if (!conference || attendees === null) {
    return (
      <main className="min-h-dvh bg-paper px-4 py-8">
        <p className="text-sm text-slate">Loading…</p>
      </main>
    );
  }

  const myId = session.member.id;
  const mine = attendees.find((a) => a.member_id === myId);
  const going = Boolean(mine);
  const others = attendees.filter((a) => a.member_id !== myId);
  const conferenceId = conference.id;

  async function toggleGoing() {
    setBusy(true);
    const supabase = getSupabaseClient();
    if (going) {
      await supabase.from("attendances").delete().eq("conference_id", conferenceId).eq("member_id", myId);
    } else {
      await supabase.from("attendances").insert({ conference_id: conferenceId, member_id: myId });
    }
    await load();
    setBusy(false);
  }

  async function saveNote() {
    setBusy(true);
    await getSupabaseClient()
      .from("attendances")
      .update({ note: note.trim() || null })
      .eq("conference_id", conferenceId)
      .eq("member_id", myId);
    await load();
    setEditingNote(false);
    setBusy(false);
  }

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-lg mx-auto">
        <div className="px-4 pt-4">
          <Link href="/" className="text-xs font-medium text-slate">
            ← Your year
          </Link>
        </div>

        <div className="px-4 pt-3 pb-5 border-b border-line">
          <div className="flex items-start gap-2 mb-1.5">
            <h1 className="font-heading text-[27px] font-semibold text-ink leading-tight">
              {conference.name}
            </h1>
            {!conference.verified && (
              <span className="mt-2 shrink-0 text-[10px] uppercase tracking-[0.08em] font-medium text-slate border border-line rounded-full px-2 py-0.5">
                Unverified
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-slate">
            {formatDateRange(conference.start_date, conference.end_date)} · {conference.city}
            {conference.website && (
              <>
                {" · "}
                <a href={conference.website} target="_blank" rel="noreferrer" className="underline">
                  Website
                </a>
              </>
            )}
          </p>

          <div className="flex gap-2 mt-3.5">
            <Button className="flex-1" disabled={busy} onClick={toggleGoing}>
              {going ? "✓ You're going" : "Mark as going"}
            </Button>
          </div>

          {going && (
            <div className="mt-3">
              {editingNote ? (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="In Sun–Wed, free Tuesday evening"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button size="sm" disabled={busy} onClick={saveNote}>
                    Save
                  </Button>
                </div>
              ) : (
                <button
                  className="text-[12px] text-ink-2 text-left underline"
                  onClick={() => {
                    setNote(mine?.note ?? "");
                    setEditingNote(true);
                  }}
                >
                  {mine?.note || "+ Add a note (dates, free evenings)"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pt-4">
          <p className="label mb-1">
            Going <span className="text-brass">{attendees.length}</span>
          </p>
        </div>

        {attendees.length === 0 ? (
          <p className="text-sm text-slate px-4 pb-8">Nobody yet — be the first.</p>
        ) : (
          <div className="pb-8">
            {mine && <AttendeeRow memberId={myId} name={session.member.name} note={mine.note} you />}
            {others.map((a) => (
              <AttendeeRow key={a.member_id} memberId={a.member_id} name={a.name} note={a.note} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function AttendeeRow({
  memberId,
  name,
  note,
  you,
}: {
  memberId: string;
  name: string | null;
  note: string | null;
  you?: boolean;
}) {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex gap-2.5 items-start px-4 py-3 border-t border-line first:border-t-0">
      <div
        className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white ${
          you ? "bg-brass" : "bg-ink-2"
        }`}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <Link href={you ? "/me" : `/m/${memberId}`} className="text-[13.5px] font-semibold text-ink hover:underline">
          {name} {you && <span className="text-slate font-normal">(you)</span>}
        </Link>
        {note && (
          <div className="text-[11.5px] text-ink-2 mt-1.5 border-l-2 border-line pl-2 leading-snug">{note}</div>
        )}
      </div>
    </div>
  );
}
