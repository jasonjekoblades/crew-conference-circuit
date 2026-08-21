export type Conference = {
  id: string;
  name: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  category: string;
  slug: string;
};

/** `money2020-usa` + 2026 -> `money2020-usa-2026`, the readable URL for /c/[slug]. */
export function conferenceSlug(seriesSlug: string, year: number): string {
  return `${seriesSlug}-${year}`;
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (startDate === endDate) return startStr;
  const sameMonth = start.getMonth() === end.getMonth();
  const endStr = end.toLocaleDateString(
    "en-US",
    sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
  );
  return `${startStr}–${endStr}`;
}
