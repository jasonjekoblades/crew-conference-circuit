"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Visibility = "all_members" | "co_attendees";

export default function OnboardingPage() {
  const router = useRouter();
  const session = useMemberSession();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("co_attendees");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.replace("/login");
    } else if (session.status === "ready" && isOnboarded(session.member)) {
      router.replace("/");
    }
  }, [session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (session.status !== "ready") return;

    setSubmitting(true);
    setError(null);

    const { error: updateError } = await getSupabaseClient()
      .from("members")
      .update({
        name: name.trim(),
        title: title.trim(),
        company: company.trim(),
        linkedin_url: linkedinUrl.trim() || null,
        visibility,
      })
      .eq("id", session.member.id);

    setSubmitting(false);

    if (updateError) {
      setError("Couldn't save that. Try again.");
      return;
    }

    router.push("/");
  }

  if (session.status !== "ready" || isOnboarded(session.member)) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-semibold text-ink text-center mb-1">
          A few details
        </h1>
        <p className="text-sm text-slate text-center mb-6">
          This is what other CREW members will see.
        </p>

        <Card className="border-line">
          <CardHeader className="pb-0">
            <span className="label">Profile</span>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" required value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="linkedin">LinkedIn (optional)</Label>
                <Input
                  id="linkedin"
                  type="url"
                  placeholder="https://linkedin.com/in/…"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label>Who can see your conferences</Label>
                <RadioGroup
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as Visibility)}
                  className="gap-3"
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <RadioGroupItem value="co_attendees" id="vis-co" className="mt-0.5" />
                    <span className="text-[13px] text-ink-2 leading-snug">
                      <span className="font-medium text-ink">Only people going with me</span> —
                      visible to other members attending the same conference. (Default)
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <RadioGroupItem value="all_members" id="vis-all" className="mt-0.5" />
                    <span className="text-[13px] text-ink-2 leading-snug">
                      <span className="font-medium text-ink">Any CREW member</span> — visible to
                      everyone in the pilot, whether or not they&rsquo;re attending.
                    </span>
                  </label>
                </RadioGroup>
              </div>

              {error && (
                <Alert className="border-error bg-error-bg">
                  <AlertDescription className="text-error">{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
