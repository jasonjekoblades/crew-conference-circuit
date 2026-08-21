"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { conferenceSlug } from "@/lib/conferences";
import { ConferenceRow } from "@/components/conference-row";

type AttendanceRow = { member_id: string; conference_id: string };
type MemberLite = { id: string; name: string | null };

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function AvatarStack({ memberIds, membersById, meId }: { memberIds: string[]; membersById: Map<string, MemberLite>; meId: string }) {
  const shown = memberIds.slice(0, 4);
  return (
    <div className="flex -space-x-[7px] shrink-0">
      {shown.map((id) => (
        <div
          key={id}
          className={`w-[23px] h-[23px] rounded-full border-[1.5px] border-card flex items-center justify-center text-[9px] font-semibold text-white ${
            id === meId ? "bg-brass" : "bg-ink-2"
          }`}
        >
          {initials(membersById.get(id)?.name ?? null)}
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const session = useMemberSession();

  const [conferences, setConferences] = useState<Conference[] | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRow[] | null>(null);
  const [members, setMembers] = useState<MemberLite[] | null>(null);
  const [category, setCategory] = useState<string>("All");
  const [browseAllOpen, setBrowseAllOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/enter");
    } else if (session.status === "ready" && !isOnboarded(session.member)) {
      router.replace("/onboarding");
    }
  }, [session, router]);

  async function reload() {
    const supabase = getSupabaseClient();
    const [{ data: conf }, { data: att }, { data: mem }] = await Promise.all([
      supabase
        .from("conferences")
        .select("id, name, city, country, start_date, end_date, category, year, conference_series(slug)")
        .eq("status", "published")
        .order("start_date", { ascending: true }),
      supabase.from("attendances").select("member_id, conference_id"),
      supabase.from("members").select("id, name"),
    ]);
    type ConferenceRow = Omit<Conference, "slug"> & { year: number; conference_series: { slug: string } | null };
    setConferences(
      ((conf as unknown as ConferenceRow[]) ?? []).map((c) => ({
        ...c,
        slug: c.conference_series ? conferenceSlug(c.conference_series.slug, c.year) : c.id,
      }))
    );
    setAttendances((att as AttendanceRow[]) ?? []);
    setMembers((mem as MemberLite[]) ?? []);
  }

  useEffect(() => {
    if (session.status === "ready" && isOnboarded(session.member)) reload();
  }, [session]);

  const membersById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  const attendanceByConference = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of attendances ?? []) {
      const list = map.get(a.conference_id) ?? [];
      list.push(a.member_id);
      map.set(a.conference_id, list);
    }
    return map;
  }, [attendances]);

  const categories = useMemo(() => {
    const set = new Set((conferences ?? []).map((c) => c.category));
    return ["All", ...Array.from(set).sort(), "Mine"];
  }, [conferences]);

  async function toggleAttendance(conferenceId: string) {
    if (session.status !== "ready" || pending.has(conferenceId)) return;
    const myId = session.member.id;
    const attendeeIds = attendanceByConference.get(conferenceId) ?? [];
    const iAmGoing = attendeeIds.includes(myId);

    setPending((p) => new Set(p).add(conferenceId));
    const supabase = getSupabaseClient();

    if (iAmGoing) {
      setAttendances((prev) => (prev ?? []).filter((a) => !(a.conference_id === conferenceId && a.member_id === myId)));
      const { error } = await supabase
        .from("attendances")
        .delete()
        .eq("conference_id", conferenceId)
        .eq("member_id", myId);
      if (error) await reload();
    } else {
      setAttendances((prev) => [...(prev ?? []), { member_id: myId, conference_id: conferenceId }]);
      const { error } = await supabase.from("attendances").insert({ conference_id: conferenceId, member_id: myId });
      if (error) await reload();
    }
    setPending((p) => {
      const next = new Set(p);
      next.delete(conferenceId);
      return next;
    });
  }

  if (session.status !== "ready" || !isOnboarded(session.member)) {
    return null;
  }

  const myId = session.member.id;

  const filtered = (conferences ?? []).filter((c) => {
    if (category === "All") return true;
    if (category === "Mine") return (attendanceByConference.get(c.id) ?? []).includes(myId);
    return c.category === category;
  });

  const mine = filtered.filter((c) => (attendanceByConference.get(c.id) ?? []).includes(myId));
  const whereOthersGo = filtered.filter(
    (c) => !mine.includes(c) && (attendanceByConference.get(c.id) ?? []).length > 0
  );
  const browseAll = filtered.filter((c) => (attendanceByConference.get(c.id) ?? []).length === 0);

  return (
    <main className="min-h-dvh bg-paper">
      <header className="flex items-center gap-3 px-4 py-4 border-b border-line bg-card">
        <span className="font-heading text-lg font-semibold text-ink">
          Where&rsquo;s <span className="text-brass">CREW</span>
        </span>
        <Link
          href="/add"
          className="ml-auto w-[29px] h-[29px] rounded-full border border-line text-ink flex items-center justify-center text-lg leading-none"
          aria-label="Add a conference"
        >
          +
        </Link>
        <Link
          href="/me"
          className="w-[29px] h-[29px] rounded-full bg-ink text-white text-[11px] font-semibold flex items-center justify-center"
        >
          {initials(session.member.name)}
        </Link>
      </header>

      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-line bg-card">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              category === c ? "bg-ink border-ink text-white" : "border-line text-slate bg-card"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto">
        <section>
          <p className="label px-4 pt-5 pb-2">Yours</p>
          {mine.length === 0 ? (
            <p className="text-sm text-slate px-4 pb-4">
              Nothing yet — tap a conference below to add it.
            </p>
          ) : (
            <div className="border border-line bg-card mx-4 rounded-lg overflow-hidden mb-2">
              {mine.map((c) => {
                const others = (attendanceByConference.get(c.id) ?? []).filter((id) => id !== myId);
                return (
                  <div key={c.id} className={pending.has(c.id) ? "opacity-60" : undefined}>
                    <ConferenceRow
                      conference={c}
                      going={true}
                      onToggle={() => toggleAttendance(c.id)}
                      disabled={pending.has(c.id)}
                    />
                    <div className="px-4 pb-3 -mt-1 flex items-center justify-between">
                      <p className="text-[12px] text-ink-2">
                        {others.length === 0
                          ? "First one here."
                          : others
                              .map((id) => membersById.get(id)?.name)
                              .filter(Boolean)
                              .join(", ")}
                      </p>
                      <Link href={`/c/${c.slug}`} className="text-slate text-xs ml-3 shrink-0">
                        →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <p className="label px-4 pt-4 pb-2">Where CREW is going</p>
          {whereOthersGo.length === 0 ? (
            <p className="text-sm text-slate px-4 pb-4">Nothing else yet.</p>
          ) : (
            <div className="border border-line bg-card mx-4 rounded-lg overflow-hidden mb-2">
              {whereOthersGo.map((c) => (
                <ConferenceRow
                  key={c.id}
                  conference={c}
                  going={false}
                  onToggle={() => toggleAttendance(c.id)}
                  disabled={pending.has(c.id)}
                  trailing={
                    <div className="flex items-center gap-2 shrink-0">
                      <AvatarStack
                        memberIds={attendanceByConference.get(c.id) ?? []}
                        membersById={membersById}
                        meId={myId}
                      />
                      <span className="text-xs font-semibold text-slate">
                        {(attendanceByConference.get(c.id) ?? []).length}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>

        <section className="pb-10">
          <button
            className="label px-4 pt-4 pb-2 flex items-center gap-2"
            onClick={() => setBrowseAllOpen((v) => !v)}
          >
            Browse all ({browseAll.length}) {browseAllOpen ? "▾" : "▸"}
          </button>
          {browseAllOpen && (
            <div className="border border-line bg-card mx-4 rounded-lg overflow-hidden">
              {browseAll.map((c) => (
                <ConferenceRow
                  key={c.id}
                  conference={c}
                  going={false}
                  onToggle={() => toggleAttendance(c.id)}
                  disabled={pending.has(c.id)}
                />
              ))}
              {browseAll.length === 0 && <p className="text-sm text-slate p-4">Nothing left to browse.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
