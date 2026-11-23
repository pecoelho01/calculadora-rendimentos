"use client";

import { createPeriodPreferenceStore } from "@/components/period-preference/period-preference-store";
import {
  parsePositionsPeriod,
  POSITIONS_PERIOD_KEY,
} from "@/lib/positions-period";

const positionsPeriodStore = createPeriodPreferenceStore(
  POSITIONS_PERIOD_KEY,
  parsePositionsPeriod,
);

export const setPositionsPeriodPreference = positionsPeriodStore.setPreference;
export const setAccountPositionsPeriodSource =
  positionsPeriodStore.setAccountSource;
export const clearAccountPositionsPeriodSource =
  positionsPeriodStore.clearAccountSource;
export const usePositionsPeriodPreference = positionsPeriodStore.usePreference;
