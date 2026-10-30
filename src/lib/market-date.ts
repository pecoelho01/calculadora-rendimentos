/** Convert a market timestamp into its exchange's trading day, never the host timezone. */
export function tradingDate(date: Date, timeZone: string): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (name: string) => parts.find((p) => p.type === name)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return null;
  }
}
