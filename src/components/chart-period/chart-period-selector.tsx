"use client";

import { parseChartPeriod } from "@/lib/chart-period";
import { PeriodPreferenceSelector } from "@/components/period-preference/period-preference-selector";
import {
  setChartPeriodPreference,
  useChartPeriodPreference,
} from "./use-chart-period-preference";

export function ChartPeriodSelector() {
  const chartPeriod = useChartPeriodPreference();

  return (
    <PeriodPreferenceSelector
      label="Período predefinido do gráfico"
      value={chartPeriod}
      onChange={(value) => setChartPeriodPreference(parseChartPeriod(value))}
    />
  );
}
