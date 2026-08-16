"use client";

import type { Conference } from "@/lib/conferences";
import { formatDateRange } from "@/lib/conferences";
import { Check } from "lucide-react";

/**
 * CLAUDE.md §8: "Tapping anywhere on the row toggles attendance. No modal,
 * no save button." Shared between /onboarding (step 2) and / (home) — same
 * interaction, same density, so the year-grid pattern from the wireframe
 * only has to be built once.
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
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t border-line first:border-t-0 transition-colors disabled:opacity-60 ${
        going ? "bg-paper" : "bg-card hover:bg-paper/60"
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
        className={`w-[26px] h-[26px] rounded-full border shrink-0 flex items-center justify-center transition-colors ${
          going ? "bg-ink border-ink text-white" : "border-line text-transparent"
        }`}
      >
        <Check className="size-3.5" strokeWidth={2.5} />
      </div>
    </button>
  );
}
