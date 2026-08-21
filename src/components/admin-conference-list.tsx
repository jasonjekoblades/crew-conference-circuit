"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateRange } from "@/lib/conferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type AdminConference = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  website: string | null;
  verified: boolean;
};

type EditState = { name: string; start_date: string; end_date: string; city: string; website: string };

/**
 * Run 6, Stage 5 — "functional, not pretty," curator-only. Edit is a plain
 * field UPDATE (never delete-then-recreate), so attendance is never at
 * risk from a date/name correction. Delete and Merge both show the real
 * attendee count before the curator commits, since a bad merge or an
 * accidental delete on a populated conference is the failure mode CLAUDE.md
 * calls out as worse than not having the feature at all.
 */
export function AdminConferenceList({ authHeader }: { authHeader: () => Promise<{ Authorization: string }> }) {
  const [conferences, setConferences] = useState<AdminConference[] | null>(null);
  const [attendanceCounts, setAttendanceCounts] = useState<Map<string, number>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [{ data: conf }, { data: att }] = await Promise.all([
      supabase
        .from("conferences")
        .select("id, name, start_date, end_date, city, website, verified")
        .order("start_date", { ascending: true }),
      supabase.from("attendances").select("conference_id"),
    ]);
    setConferences((conf as AdminConference[]) ?? []);
    const counts = new Map<string, number>();
    for (const row of att ?? []) {
      counts.set(row.conference_id, (counts.get(row.conference_id) ?? 0) + 1);
    }
    setAttendanceCounts(counts);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const conferenceById = useMemo(() => new Map((conferences ?? []).map((c) => [c.id, c])), [conferences]);

  function startEdit(c: AdminConference) {
    setEditingId(c.id);
    setEdit({ name: c.name, start_date: c.start_date, end_date: c.end_date, city: c.city, website: c.website ?? "" });
    setConfirmingDeleteId(null);
    setMergeSourceId(null);
  }

  async function saveEdit(conferenceId: string) {
    if (!edit) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/conferences/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ conferenceId, ...edit }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save that conference.");
      return;
    }
    setEditingId(null);
    setEdit(null);
    setNotice("Saved — anyone already attending is unaffected.");
    await load();
  }

  async function toggleVerified(c: AdminConference) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/conferences/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ conferenceId: c.id, verified: !c.verified }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't update that.");
      return;
    }
    await load();
  }

  async function confirmDelete(conferenceId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/conferences/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ conferenceId }),
    });
    setBusy(false);
    setConfirmingDeleteId(null);
    if (!res.ok) {
      setError("Couldn't delete that conference.");
      return;
    }
    setNotice("Deleted.");
    await load();
  }

  async function confirmMerge() {
    if (!mergeSourceId || !mergeTargetId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/conferences/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ sourceId: mergeSourceId, targetId: mergeTargetId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message ?? "Couldn't merge those.");
      return;
    }
    setMergeSourceId(null);
    setMergeTargetId("");
    setNotice(
      `Merged. ${body.moved} attendee(s) moved` +
        (body.alreadyThere > 0 ? `, ${body.alreadyThere} were already on both (no duplicate created).` : ".")
    );
    await load();
  }

  if (conferences === null) {
    return <p className="text-sm text-slate">Loading…</p>;
  }

  const unverifiedCount = conferences.filter((c) => !c.verified).length;
  const visible = unverifiedOnly ? conferences.filter((c) => !c.verified) : conferences;

  return (
    <div>
      {notice && <p className="text-[12px] text-ink-2 mb-3">{notice}</p>}
      {error && <p className="text-[12px] text-error mb-3">{error}</p>}

      <label className="flex items-center gap-2 text-[12.5px] text-ink-2 mb-3">
        <input type="checkbox" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly(e.target.checked)} />
        Show unverified only ({unverifiedCount})
      </label>

      {visible.length === 0 && (
        <p className="text-sm text-slate">
          {unverifiedOnly ? "Nothing waiting on review." : "No conferences."}
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((c) => {
          const count = attendanceCounts.get(c.id) ?? 0;
          const isEditing = editingId === c.id;
          const isConfirmingDelete = confirmingDeleteId === c.id;
          const isMergingFrom = mergeSourceId === c.id;

          return (
            <li key={c.id} className="rounded-lg border border-line bg-card px-4 py-3">
              {isEditing && edit ? (
                <div className="space-y-2">
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Name" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={edit.start_date}
                      onChange={(e) => setEdit({ ...edit, start_date: e.target.value })}
                    />
                    <Input type="date" value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} />
                  </div>
                  <Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} placeholder="City" />
                  <Input
                    type="url"
                    value={edit.website}
                    onChange={(e) => setEdit({ ...edit, website: e.target.value })}
                    placeholder="Website"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => saveEdit(c.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink flex items-center gap-2">
                      {c.name}
                      {!c.verified && (
                        <Badge variant="outline" className="text-[9px] text-slate border-line">
                          Unverified
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11.5px] text-slate mt-0.5">
                      {formatDateRange(c.start_date, c.end_date)} · {c.city} · {count} attending
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5 flex-wrap justify-end">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => toggleVerified(c)}>
                      {c.verified ? "Unverify" : "Mark verified"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setMergeSourceId(c.id);
                        setMergeTargetId("");
                        setConfirmingDeleteId(null);
                      }}
                    >
                      Merge into…
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-error border-error"
                      disabled={busy}
                      onClick={() => setConfirmingDeleteId(c.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {isConfirmingDelete && (
                <div className="mt-3 rounded-md border border-error bg-error-bg p-3 space-y-2">
                  <p className="text-[12.5px] text-error">
                    {count > 0
                      ? `${count} member${count === 1 ? " is" : "s are"} attending this. Deleting removes their attendance too — this can't be undone.`
                      : "No one is attending this. This can't be undone."}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-error border-error" disabled={busy} onClick={() => confirmDelete(c.id)}>
                      Yes, delete it
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmingDeleteId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {isMergingFrom && (
                <div className="mt-3 rounded-md border border-line bg-paper p-3 space-y-2">
                  <p className="text-[12px] text-ink-2">
                    Move all {count} attendee{count === 1 ? "" : "s"} from &ldquo;{c.name}&rdquo; onto:
                  </p>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
                  >
                    <option value="">Choose the conference to keep…</option>
                    {conferences
                      .filter((other) => other.id !== c.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name} — {formatDateRange(other.start_date, other.end_date)} · {other.city}
                        </option>
                      ))}
                  </select>
                  {mergeTargetId && (
                    <p className="text-[11.5px] text-slate">
                      &ldquo;{c.name}&rdquo; will be deleted; its attendees move to &ldquo;
                      {conferenceById.get(mergeTargetId)?.name}&rdquo;. This can&rsquo;t be undone.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy || !mergeTargetId} onClick={confirmMerge}>
                      Merge
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setMergeSourceId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
