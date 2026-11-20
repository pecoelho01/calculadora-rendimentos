import {
  performancePeriods,
  type PerformancePeriod,
} from "@/lib/portfolio/portfolio";

export const CHART_PERIOD_KEY = "rendimentos-chart-period-v1";

export function parseChartPeriod(
  value: string | null | undefined,
): PerformancePeriod {
  return performancePeriods.find((period) => period === value) ?? "Máximo";
}
