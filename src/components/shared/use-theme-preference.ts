"use client";

import { useSyncExternalStore } from "react";
import {
  ACCOUNT_THEME_CACHE_KEY,
  parseTheme,
  THEME_KEY,
  type ThemePreference,
} from "@/lib/theme";
export type { ThemePreference } from "@/lib/theme";

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
let currentThemePreference: ThemePreference | null = null;
let accountTheme: ThemePreference | null = null;
let accountThemeWriter: ((theme: ThemePreference) => void) | null = null;
const themeListeners = new Set<() => void>();

function getThemePreference(): ThemePreference {
  if (accountTheme !== null) return accountTheme;
  if (currentThemePreference !== null) return currentThemePreference;

  try {
    currentThemePreference = parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    currentThemePreference = parseTheme(document.documentElement.dataset.theme);
  }

  return currentThemePreference;
}

function notifyThemeListeners(): void {
  for (const listener of themeListeners) listener();
}

export function setThemePreference(nextTheme: ThemePreference): void {
  if (accountThemeWriter) {
    accountTheme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(ACCOUNT_THEME_CACHE_KEY, nextTheme);
    } catch {}
    notifyThemeListeners();
    accountThemeWriter(nextTheme);
    return;
  }
  currentThemePreference = nextTheme;
  document.documentElement.dataset.theme = nextTheme;

  try {
    if (nextTheme === "system") {
      window.localStorage.removeItem(THEME_KEY);
    } else {
      window.localStorage.setItem(THEME_KEY, nextTheme);
    }
  } catch {
    // Keep the selected preference in memory when storage is unavailable.
  }

  notifyThemeListeners();
}

export function setAccountThemeSource(
  theme: ThemePreference,
  writer: (theme: ThemePreference) => void,
): void {
  accountTheme = theme;
  accountThemeWriter = writer;
  try {
    window.localStorage.setItem(ACCOUNT_THEME_CACHE_KEY, theme);
  } catch {}
  document.documentElement.dataset.theme = theme;
  notifyThemeListeners();
}

export function clearAccountThemeSource(
  expectedWriter?: (theme: ThemePreference) => void,
): void {
  if (expectedWriter && accountThemeWriter !== expectedWriter) return;
  accountTheme = null;
  accountThemeWriter = null;
  try {
    window.localStorage.removeItem(ACCOUNT_THEME_CACHE_KEY);
  } catch {}
  document.documentElement.dataset.theme = getThemePreference();
  notifyThemeListeners();
}

function subscribeThemePreference(onChange: () => void) {
  themeListeners.add(onChange);

  function handleStorage(event: StorageEvent) {
    if (event.storageArea !== window.localStorage) return;
    if (event.key !== THEME_KEY && event.key !== null) return;

    currentThemePreference = parseTheme(event.newValue);
    if (accountTheme === null) {
      document.documentElement.dataset.theme = currentThemePreference;
    }
    notifyThemeListeners();
  }

  window.addEventListener("storage", handleStorage);

  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function subscribeSystemColorScheme(onChange: () => void) {
  const media = window.matchMedia(COLOR_SCHEME_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemColorScheme() {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function getServerSystemColorScheme() {
  return false;
}

function getServerThemePreference(): ThemePreference {
  return "system";
}

export function useThemePreference() {
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  const systemIsDark = useSyncExternalStore(
    subscribeSystemColorScheme,
    getSystemColorScheme,
    getServerSystemColorScheme,
  );

  return { theme, systemIsDark, chooseTheme: setThemePreference };
}
