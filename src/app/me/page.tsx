"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import type { Conference } from "@/lib/conferences";
import { formatDateRange, conferenceSlug } from "@/lib/conferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type MyAttendance = { conference: Conference; note: string | null };

export default function MePage() {
  const router = useRouter();
  const session = useMemberSession();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [myConferences, setMyConferences] = useState<MyAttendance[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (session.status === "anonymous") router.replace("/enter");
  }, [session, router]);

  useEffect(() => {
    if (session.status !== "ready") return;
    setName(session.member.name ?? "");
    setTitle(session.member.title ?? "");
    setCompany(session.member.company ?? "");
    setLinkedinUrl(session.member.linkedin_url ?? "");

    getSupabaseClient()
      .from("attendances")
      .select("note, conferences(id, name, city, country, start_date, end_date, category, year, conference_series(slug))")
      .eq("member_id", session.member.id)
      .then(({ data }) => {
        type ConferenceRow = Omit<Conference, "slug"> & {
          year: number;
          conference_series: { slug: string } | null;
        };
        const rows = (data ?? []) as unknown as { note: string | null; conferences: ConferenceRow | null }[];
        setMyConferences(
          rows
            .filter((r) => r.conferences)
            .map((r) => {
              const c = r.conferences as ConferenceRow;
              return {
                conference: { ...c, slug: c.conference_series ? conferenceSlug(c.conference_series.slug, c.year) : c.id },
                note: r.note,
              };
            })
        );
      });
  }, [session]);

  if (session.status !== "ready") return null;
  if (!isOnboarded(session.member)) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (session.status !== "ready") return;
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await getSupabaseClient()
      .from("members")
      .update({
        name: name.trim(),
        title: title.trim() || null,
        company: company.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
      })
      .eq("id", session.member.id);

    setSubmitting(false);
    if (updateError) {
      setError("Couldn't save that. Try again.");
      return;
    }
    setSaved(true);
  }

  async function handleDelete() {
    if (session.status !== "ready") return;
    setSubmitting(true);
    const { error: deleteError } = await getSupabaseClient()
      .from("members")
      .delete()
      .eq("id", session.member.id);

    if (deleteError) {
      setSubmitting(false);
      setError("Couldn't delete your data. Try again, or ask the organizer to remove you.");
      return;
    }
    await getSupabaseClient().auth.signOut();
    router.push("/enter");
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs font-medium text-slate">
            ← Home
          </Link>
        </div>

        <Card className="border-line">
          <CardHeader className="pb-0">
            <span className="label">Profile</span>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="linkedin">LinkedIn</Label>
                <Input
                  id="linkedin"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>

              {error && (
                <Alert className="border-error bg-error-bg">
                  <AlertDescription className="text-error">{error}</AlertDescription>
                </Alert>
              )}
              {saved && <p className="text-[12px] text-slate">Saved.</p>}

              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <p className="label mb-2">Your conferences</p>
          {myConferences === null ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : myConferences.length === 0 ? (
            <p className="text-sm text-slate">You haven&rsquo;t added any yet.</p>
          ) : (
            <div className="border border-line bg-card rounded-lg overflow-hidden">
              {myConferences.map(({ conference, note }) => (
                <Link
                  key={conference.id}
                  href={`/c/${conference.slug}`}
                  className="block px-4 py-3 border-t border-line first:border-t-0"
                >
                  <div className="font-heading text-[14.5px] text-ink">{conference.name}</div>
                  <div className="text-[11.5px] text-slate mt-0.5">
                    {formatDateRange(conference.start_date, conference.end_date)} · {conference.city}
                  </div>
                  {note && <div className="text-[11.5px] text-ink-2 mt-1">{note}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-line">
          {!confirmingDelete ? (
            <Button variant="outline" className="text-error border-error" onClick={() => setConfirmingDelete(true)}>
              Delete me and my data
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">
                This removes your profile and every conference/attendance you&rsquo;ve added.
                It can&rsquo;t be undone. Are you sure?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={submitting} onClick={handleDelete} className="text-error border-error">
                  {submitting ? "Deleting…" : "Yes, delete everything"}
                </Button>
                <Button variant="outline" disabled={submitting} onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
