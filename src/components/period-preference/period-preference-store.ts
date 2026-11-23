"use client";

import { useSyncExternalStore } from "react";
import type { PerformancePeriod } from "@/lib/portfolio/portfolio";

type PeriodPreferenceStore = {
  clearAccountSource: (expectedWriter?: PeriodPreferenceWriter) => void;
  setAccountSource: (
    period: PerformancePeriod,
    writer: PeriodPreferenceWriter,
  ) => void;
  setPreference: (period: PerformancePeriod) => void;
  usePreference: () => PerformancePeriod;
};

type PeriodPreferenceWriter = (period: PerformancePeriod) => void;

export function createPeriodPreferenceStore(
  storageKey: string,
  parsePeriod: (value: string | null | undefined) => PerformancePeriod,
): PeriodPreferenceStore {
  // Used only when localStorage cannot be read or written (for example,
  // blocked site data), so the choice still applies until the page is reloaded.
  let fallbackPeriod: PerformancePeriod = "Máximo";
  let storageUnavailable = false;
  let accountPeriod: PerformancePeriod | null = null;
  let accountWriter: PeriodPreferenceWriter | null = null;
  const listeners = new Set<() => void>();

  // Read storage on every snapshot so a change made in another tab is picked
  // up even if nothing was subscribed when the storage event fired. The
  // snapshot is a string, so React sees a stable value while it does not change.
  function getPreference(): PerformancePeriod {
    if (accountPeriod !== null) return accountPeriod;
    if (storageUnavailable) return fallbackPeriod;

    try {
      return parsePeriod(window.localStorage.getItem(storageKey));
    } catch {
      return fallbackPeriod;
    }
  }

  function notifyListeners() {
    for (const listener of listeners) listener();
  }

  function setPreference(nextPeriod: PerformancePeriod) {
    if (accountWriter) {
      accountPeriod = parsePeriod(nextPeriod);
      notifyListeners();
      accountWriter(accountPeriod);
      return;
    }

    fallbackPeriod = parsePeriod(nextPeriod);
    try {
      window.localStorage.setItem(storageKey, fallbackPeriod);
      storageUnavailable = false;
    } catch {
      storageUnavailable = true;
    }
    notifyListeners();
  }

  function setAccountSource(
    period: PerformancePeriod,
    writer: PeriodPreferenceWriter,
  ) {
    accountPeriod = period;
    accountWriter = writer;
    notifyListeners();
  }

  function clearAccountSource(expectedWriter?: PeriodPreferenceWriter) {
    if (expectedWriter && accountWriter !== expectedWriter) return;
    accountPeriod = null;
    accountWriter = null;
    notifyListeners();
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange);

    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== storageKey && event.key !== null) return;
      onChange();
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", handleStorage);
    };
  }

  function getServerPreference(): PerformancePeriod {
    return "Máximo";
  }

  function usePreference() {
    return useSyncExternalStore(subscribe, getPreference, getServerPreference);
  }

  return {
    clearAccountSource,
    setAccountSource,
    setPreference,
    usePreference,
  };
}
