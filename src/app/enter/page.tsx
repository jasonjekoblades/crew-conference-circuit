"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMemberSession, isOnboarded } from "@/lib/auth/use-member-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Teaser = { name: string; city: string; attendee_count: number };
type CheckResult = { atCapacity: boolean; pilotFullMessage?: string };

export default function EnterPage() {
  const router = useRouter();
  const session = useMemberSession();

  const [code, setCode] = useState("");
  const [teaser, setTeaser] = useState<Teaser[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [pickingName, setPickingName] = useState(false);
  const [typedName, setTypedName] = useState("");

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

  async function handleCheckCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCheckResult(null);

    try {
      const res = await fetch("/api/enter/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "That didn't work. Try again.");
        return;
      }
      setCheckResult({ atCapacity: data.atCapacity, pilotFullMessage: data.pilotFullMessage });
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Supabase caps anonymous sign-ins per IP per hour — measured at 30 on
  // this project (Run 7, Stage 3). Plausible to hit on shared office/
  // conference wifi once this is posted publicly, so it gets its own
  // message rather than falling into the generic "couldn't start a
  // session, try again" (which would just fail the same way on immediate
  // retry, from the same IP, and read as the app being broken).
  async function ensureSession(): Promise<{ session: Session } | { session: null; rateLimited: boolean }> {
    const supabase = getSupabaseClient();
    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { data, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError || !data.session) {
        return { session: null, rateLimited: signInError?.status === 429 };
      }
      sessionData = data;
    }
    return { session: sessionData.session! };
  }

  async function confirmEntry() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await ensureSession();
      if (!result.session) {
        setError(
          "rateLimited" in result && result.rateLimited
            ? "Too many people are joining from this network right now. Wait a few minutes and try again, or try switching from Wi-Fi to mobile data."
            : "Couldn't start a session. Try again."
        );
        return;
      }

      const res = await fetch("/api/enter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${result.session.access_token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "That didn't work. Try again.");
        return;
      }

      router.push("/onboarding");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRelink(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await ensureSession();
      if (!result.session) {
        setError(
          "rateLimited" in result && result.rateLimited
            ? "Too many people are joining from this network right now. Wait a few minutes and try again, or try switching from Wi-Fi to mobile data."
            : "Couldn't start a session. Try again."
        );
        return;
      }

      const res = await fetch("/api/enter/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${result.session.access_token}` },
        body: JSON.stringify({ code, name: typedName }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "That didn't work. Try again.");
        return;
      }

      router.push("/");
    } catch {
      setError("Couldn't reach the server. Try again.");
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
          Where&rsquo;s your <span className="text-brass">CREW</span>
        </h1>
        <p className="text-sm text-slate text-center mb-6">
          A private circuit for CREW members. Invite only.
        </p>

        <Card className="border-line">
          <CardHeader className="pb-0">
            <span className="label">Enter</span>
          </CardHeader>
          <CardContent className="pt-4">
            {!checkResult ? (
              <form onSubmit={handleCheckCode} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Invite code</Label>
                  <Input
                    id="code"
                    type="text"
                    autoComplete="off"
                    autoFocus
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <p className="text-[11px] text-slate">
                    By entering, you agree to the{" "}
                    <a href="/privacy" className="underline">
                      privacy policy
                    </a>{" "}
                    and{" "}
                    <a href="/terms" className="underline">
                      terms
                    </a>
                    .
                  </p>
                </div>

                {error && (
                  <Alert className="border-error bg-error-bg">
                    <AlertDescription className="text-error">{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Checking…" : "Continue"}
                </Button>
              </form>
            ) : pickingName ? (
              <form onSubmit={handleRelink} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="typed-name">What name did you use before?</Label>
                  <Input
                    id="typed-name"
                    autoFocus
                    required
                    placeholder="Your full name"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                  />
                </div>
                {error && (
                  <Alert className="border-error bg-error-bg">
                    <AlertDescription className="text-error">{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting || !typedName.trim()}>
                  {submitting ? "Checking…" : "Continue"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPickingName(false);
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Back
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                {checkResult.atCapacity ? (
                  <Alert className="border-line bg-card">
                    <AlertDescription className="text-ink-2">
                      {checkResult.pilotFullMessage ?? "This pilot is currently full."} If you&rsquo;ve
                      been here before, enter your name below.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Button type="button" className="w-full" disabled={submitting} onClick={confirmEntry}>
                    I&rsquo;m new here
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => setPickingName(true)}
                >
                  I&rsquo;ve been here before
                </Button>
                {error && (
                  <Alert className="border-error bg-error-bg">
                    <AlertDescription className="text-error">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
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
      </div>
    </main>
  );
}
