/** Formats a monetary value; null means the value is unknown, not zero. */
export function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";

  return value.toLocaleString("pt-PT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";

  const sign = value >= 0 ? "+" : "";
  const formatted = value.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

  return `${sign}${formatted}%`;
}
