"use client";

import type { Conference } from "@/lib/conferences";
import { formatDateRange } from "@/lib/conferences";
import { Check } from "lucide-react";

/**
 * CLAUDE.md §8: "Tapping anywhere on the row toggles attendance. No modal,
 * no save button." Shared between /onboarding (step 2) and / (home) — same
 * interaction, same density, so the year-grid pattern from the wireframe
 * only has to be built once.
 *
 * Run 7, Stage 4: "rows that toggle attendance don't look tappable" and
 * "state changes need confirmation" were both reported from real use.
 * `hover:` alone does nothing on a touch device (the primary target per
 * CLAUDE.md §2.2) — the active/pressed state below is what actually fires
 * on tap. The circle re-mounts on every toggle (via `key`) specifically to
 * replay its entrance animation each time, so the moment of the tap is
 * visibly confirmed rather than just eventually reflected in state. Colors
 * are all existing tokens (border-slate/bg-ink/etc.) — no new values, no
 * layout changes; the visual redesign is a separate pass.
 */
export function ConferenceRow({
  conference,
  going,
  onToggle,
  disabled,
  trailing,
}: {
  conference: Conference;
  going: boolean;
  onToggle: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t border-line first:border-t-0 transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100 ${
        going ? "bg-paper active:bg-line/60" : "bg-card hover:bg-paper/60 active:bg-paper"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className={`font-heading text-[15px] leading-snug ${going ? "font-semibold text-ink" : "font-medium text-ink"}`}>
          {conference.name}
        </div>
        <div className="text-[11.5px] text-slate mt-0.5">
          {formatDateRange(conference.start_date, conference.end_date)} · {conference.city}
        </div>
      </div>
      {trailing}
      <div
        key={String(going)}
        className={`animate-in zoom-in-50 duration-200 w-[26px] h-[26px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
          going ? "bg-ink border-ink text-white" : "border-slate text-transparent"
        }`}
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </div>
    </button>
  );
}
