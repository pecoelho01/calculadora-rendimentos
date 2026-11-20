"use client";

import type { ChangeEvent } from "react";
import { parseChartPeriod } from "@/lib/chart-period";
import { performancePeriods } from "@/lib/portfolio/portfolio";
import {
  setChartPeriodPreference,
  useChartPeriodPreference,
} from "./use-chart-period-preference";

export function ChartPeriodSelector() {
  const chartPeriod = useChartPeriodPreference();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setChartPeriodPreference(parseChartPeriod(event.currentTarget.value));
  }

  return (
    <label className="chart-period-preference">
      <span className="visually-hidden">Período predefinido do gráfico</span>
      <select
        value={chartPeriod}
        onChange={handleChange}
      >
        {performancePeriods.map((period) => (
          <option
            key={period}
            value={period}
          >
            {period}
          </option>
        ))}
      </select>
    </label>
  );
}
