"use client";

import type { ChangeEvent } from "react";
import {
  performancePeriods,
  type PerformancePeriod,
} from "@/lib/portfolio/portfolio";

type PeriodPreferenceSelectorProps = {
  label: string;
  value: PerformancePeriod;
  onChange: (value: string) => void;
};

export function PeriodPreferenceSelector({
  label,
  value,
  onChange,
}: PeriodPreferenceSelectorProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.currentTarget.value);
  }

  return (
    <label className="chart-period-preference">
      <span className="visually-hidden">{label}</span>
      <select
        value={value}
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
