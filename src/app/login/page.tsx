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

type Teaser = { name: string; city: string; attendee_count: number };

type FormResult =
  | { kind: "error"; message: string }
  | { kind: "magic_link_sent" }
  | null;

export default function LoginPage() {
  const router = useRouter();
  const session = useMemberSession();

  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FormResult>(null);
  const [teaser, setTeaser] = useState<Teaser[] | null>(null);

  useEffect(() => {
    if (session.status === "ready") {
      router.replace(isOnboarded(session.member) ? "/" : "/onboarding");
    }
  }, [session, router]);

  useEffect(() => {
    let cancelled = false;
    getSupabaseClient()
      .rpc("login_teaser")
      .then(({ data }) => {
        if (!cancelled && data) setTeaser(data as Teaser[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, inviteCode }),
      });
      const data = await res.json();

      if (!data.ok) {
        setResult({ kind: "error", message: data.message ?? "That didn't work. Try again." });
        return;
      }

      if (data.action === "pending") {
        router.push(data.atCapacity ? "/pending?full=1" : "/pending");
        return;
      }

      if (data.action === "magic_link_sent") {
        setResult({ kind: "magic_link_sent" });
        return;
      }
    } catch {
      setResult({ kind: "error", message: "Couldn't reach the server. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (session.status === "loading" || session.status === "ready") {
    return null;
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-semibold text-ink text-center mb-1">
          Where&rsquo;s <span className="text-brass">CREW</span>
        </h1>
        <p className="text-sm text-slate text-center mb-6">
          A private circuit for CREW members. Invite only.
        </p>

        <Card className="border-line">
          <CardHeader className="pb-0">
            <span className="label">Sign in</span>
          </CardHeader>
          <CardContent className="pt-4">
            {result?.kind === "magic_link_sent" ? (
              <Alert className="border-line bg-card">
                <AlertDescription className="text-ink-2">
                  Check <span className="font-medium">{email}</span> for a sign-in
                  link.
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inviteCode">Invite code</Label>
                  <Input
                    id="inviteCode"
                    type="text"
                    autoComplete="off"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                  />
                </div>

                {result?.kind === "error" && (
                  <Alert className="border-error bg-error-bg">
                    <AlertDescription className="text-error">
                      {result.message}
                    </AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Checking…" : "Continue"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {teaser && teaser.length > 0 && (
          <div className="mt-8">
            <p className="label mb-3 text-center">Where CREW is going</p>
            <div className="space-y-2">
              {teaser.map((t) => (
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
          </div>
        )}

        <p className="text-center text-[11px] text-slate mt-10">
          <a href="/privacy" className="underline">
            Privacy
          </a>{" "}
          &middot;{" "}
          <a href="/terms" className="underline">
            Terms
          </a>
        </p>
      </div>
    </main>
  );
}
