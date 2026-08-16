"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import { formatDateRange } from "@/lib/conferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Folder is named [slug] to match CLAUDE.md §8's route naming, but the
// param value is actually the conference's uuid id — conferences has no
// slug column of its own (only conference_series does, per §5), and adding
// one wasn't worth it for a URL-aesthetics difference with no functional
// effect.
type ConferenceDetail = {
  id: string;
  name: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  website: string | null;
};

type Attendee = { member_id: string; note: string | null; name: string | null; title: string | null; company: string | null };

export default function ConferenceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: conferenceId } = use(params);
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
    const supabase = getSupabaseClient();
    const { data: conf } = await supabase
      .from("conferences")
      .select("id, name, city, country, start_date, end_date, website")
      .eq("id", conferenceId)
      .maybeSingle();

    if (!conf) {
      setNotFound(true);
      return;
    }
    setConference(conf as ConferenceDetail);

    const { data: attRows } = await supabase
      .from("attendances")
      .select("member_id, note")
      .eq("conference_id", conferenceId);

    const memberIds = (attRows ?? []).map((r) => r.member_id);
    const { data: memberRows } =
      memberIds.length > 0
        ? await supabase.from("members").select("id, name, title, company").in("id", memberIds)
        : { data: [] };

    const memberById = new Map((memberRows ?? []).map((m) => [m.id, m]));
    setAttendees(
      (attRows ?? []).map((r) => ({
        member_id: r.member_id,
        note: r.note,
        name: memberById.get(r.member_id)?.name ?? null,
        title: memberById.get(r.member_id)?.title ?? null,
        company: memberById.get(r.member_id)?.company ?? null,
      }))
    );
  }, [conferenceId]);

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
          <h1 className="font-heading text-[27px] font-semibold text-ink leading-tight mb-1.5">
            {conference.name}
          </h1>
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
            {mine && (
              <AttendeeRow name={session.member.name} title={mine.title} company={mine.company} note={mine.note} you />
            )}
            {others.map((a) => (
              <AttendeeRow key={a.member_id} name={a.name} title={a.title} company={a.company} note={a.note} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function AttendeeRow({
  name,
  title,
  company,
  note,
  you,
}: {
  name: string | null;
  title: string | null;
  company: string | null;
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
        <div className="text-[13.5px] font-semibold text-ink">
          {name} {you && <span className="text-slate font-normal">(you)</span>}
        </div>
        {(title || company) && (
          <div className="text-[11.5px] text-slate mt-0.5">
            {title}
            {title && company && " · "}
            {company}
          </div>
        )}
        {note && (
          <div className="text-[11.5px] text-ink-2 mt-1.5 border-l-2 border-line pl-2 leading-snug">{note}</div>
        )}
      </div>
    </div>
  );
}
