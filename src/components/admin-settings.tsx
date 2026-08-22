"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = {
  ai_enabled: boolean;
  member_cap: number;
  ai_global_daily_limit: number;
  pilot_full_message: string;
};

/**
 * Run 7, Stage 2/3: every cap that used to require a deploy to change is
 * editable here instead — "I may need to adjust after seeing real traffic."
 */
export function AdminSettings({ authHeader }: { authHeader: () => Promise<{ Authorization: string }> }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [memberCapInput, setMemberCapInput] = useState("");
  const [aiCapInput, setAiCapInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authHeader().then((headers) =>
      fetch("/api/admin/settings", { headers }).then(async (res) => {
        if (!res.ok) return;
        const body: Settings = await res.json();
        setSettings(body);
        setMemberCapInput(String(body.member_cap));
        setAiCapInput(String(body.ai_global_daily_limit));
        setMessageInput(body.pilot_full_message);
      })
    );
  }, [authHeader]);

  async function save(patch: Partial<Settings>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.message ?? "Couldn't save that.");
      return;
    }
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setNotice("Saved.");
  }

  if (!settings) return <p className="text-sm text-slate">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">AI conference lookup</div>
          <div className="text-[11.5px] text-slate mt-0.5">
            {settings.ai_enabled ? "On — members can look up conference details" : "Off — manual entry only"}
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save({ ai_enabled: !settings.ai_enabled })}>
          {settings.ai_enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-card px-4 py-3 space-y-2">
        <Label htmlFor="member-cap" className="text-[12px] text-ink-2">
          Member cap (currently {settings.member_cap})
        </Label>
        <div className="flex gap-2">
          <Input
            id="member-cap"
            type="number"
            min={1}
            value={memberCapInput}
            onChange={(e) => setMemberCapInput(e.target.value)}
          />
          <Button
            size="sm"
            disabled={busy || !memberCapInput}
            onClick={() => save({ member_cap: parseInt(memberCapInput, 10) })}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-card px-4 py-3 space-y-2">
        <Label htmlFor="ai-cap" className="text-[12px] text-ink-2">
          AI lookups per day, across everyone (currently {settings.ai_global_daily_limit}; per-member stays fixed at 10/day)
        </Label>
        <div className="flex gap-2">
          <Input id="ai-cap" type="number" min={0} value={aiCapInput} onChange={(e) => setAiCapInput(e.target.value)} />
          <Button
            size="sm"
            disabled={busy || !aiCapInput}
            onClick={() => save({ ai_global_daily_limit: parseInt(aiCapInput, 10) })}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-card px-4 py-3 space-y-2">
        <Label htmlFor="full-message" className="text-[12px] text-ink-2">
          Message shown when the pilot is full
        </Label>
        <textarea
          id="full-message"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
        />
        <Button size="sm" disabled={busy || !messageInput.trim()} onClick={() => save({ pilot_full_message: messageInput.trim() })}>
          Save
        </Button>
      </div>

      {notice && <p className="text-[12px] text-ink-2">{notice}</p>}
      {error && <p className="text-[12px] text-error">{error}</p>}
    </div>
  );
}
