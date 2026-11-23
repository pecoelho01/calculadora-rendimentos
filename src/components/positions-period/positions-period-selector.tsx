"use client";

import { parsePositionsPeriod } from "@/lib/positions-period";
import { PeriodPreferenceSelector } from "@/components/period-preference/period-preference-selector";
import {
  setPositionsPeriodPreference,
  usePositionsPeriodPreference,
} from "./use-positions-period-preference";

export function PositionsPeriodSelector() {
  const positionsPeriod = usePositionsPeriodPreference();

  return (
    <PeriodPreferenceSelector
      label="Período predefinido das posições"
      value={positionsPeriod}
      onChange={(value) =>
        setPositionsPeriodPreference(parsePositionsPeriod(value))
      }
    />
  );
}
