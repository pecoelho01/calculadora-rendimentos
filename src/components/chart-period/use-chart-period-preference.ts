"use client";

import { CHART_PERIOD_KEY, parseChartPeriod } from "@/lib/chart-period";
import { createPeriodPreferenceStore } from "@/components/period-preference/period-preference-store";

const chartPeriodStore = createPeriodPreferenceStore(
  CHART_PERIOD_KEY,
  parseChartPeriod,
);

export const setChartPeriodPreference = chartPeriodStore.setPreference;
export const setAccountChartPeriodSource = chartPeriodStore.setAccountSource;
export const clearAccountChartPeriodSource =
  chartPeriodStore.clearAccountSource;
export const useChartPeriodPreference = chartPeriodStore.usePreference;
