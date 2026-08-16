export type Conference = {
  id: string;
  name: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  category: string;
};

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
