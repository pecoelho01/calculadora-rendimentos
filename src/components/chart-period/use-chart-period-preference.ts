"use client";

import { useSyncExternalStore } from "react";
import { CHART_PERIOD_KEY, parseChartPeriod } from "@/lib/chart-period";
import type { PerformancePeriod } from "@/lib/portfolio/portfolio";

// Used only when localStorage cannot be read or written (for example, blocked
// site data), so the choice still applies until the page is reloaded.
let fallbackChartPeriod: PerformancePeriod = "Máximo";
let storageUnavailable = false;
let accountChartPeriod: PerformancePeriod | null = null;
let accountChartPeriodWriter: ((period: PerformancePeriod) => void) | null =
  null;
const chartPeriodListeners = new Set<() => void>();

// Read storage on every snapshot so a change made in another tab is picked up
// even if no chart was subscribed when the storage event fired. The snapshot is
// a string, so React sees a stable value while it does not change.
function getChartPeriodPreference(): PerformancePeriod {
  if (accountChartPeriod !== null) return accountChartPeriod;
  if (storageUnavailable) return fallbackChartPeriod;

  try {
    return parseChartPeriod(window.localStorage.getItem(CHART_PERIOD_KEY));
  } catch {
    return fallbackChartPeriod;
  }
}

function notifyChartPeriodListeners(): void {
  for (const listener of chartPeriodListeners) listener();
}

export function setChartPeriodPreference(nextPeriod: PerformancePeriod): void {
  if (accountChartPeriodWriter) {
    accountChartPeriod = parseChartPeriod(nextPeriod);
    notifyChartPeriodListeners();
    accountChartPeriodWriter(accountChartPeriod);
    return;
  }
  fallbackChartPeriod = parseChartPeriod(nextPeriod);

  try {
    window.localStorage.setItem(CHART_PERIOD_KEY, fallbackChartPeriod);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }

  notifyChartPeriodListeners();
}

export function setAccountChartPeriodSource(
  period: PerformancePeriod,
  writer: (period: PerformancePeriod) => void,
): void {
  accountChartPeriod = period;
  accountChartPeriodWriter = writer;
  notifyChartPeriodListeners();
}

export function clearAccountChartPeriodSource(
  expectedWriter?: (period: PerformancePeriod) => void,
): void {
  if (expectedWriter && accountChartPeriodWriter !== expectedWriter) return;
  accountChartPeriod = null;
  accountChartPeriodWriter = null;
  notifyChartPeriodListeners();
}

function subscribeChartPeriodPreference(onChange: () => void) {
  chartPeriodListeners.add(onChange);

  function handleStorage(event: StorageEvent) {
    if (event.storageArea !== window.localStorage) return;
    if (event.key !== CHART_PERIOD_KEY && event.key !== null) return;

    onChange();
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    chartPeriodListeners.delete(onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerChartPeriodPreference(): PerformancePeriod {
  return "Máximo";
}

export function useChartPeriodPreference() {
  return useSyncExternalStore(
    subscribeChartPeriodPreference,
    getChartPeriodPreference,
    getServerChartPeriodPreference,
  );
}
