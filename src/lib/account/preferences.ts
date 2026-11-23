import { parseChartPeriod } from "@/lib/chart-period";
import { parsePositionsPeriod } from "@/lib/positions-period";
import { parseTheme, type ThemePreference } from "@/lib/theme";
import type { PerformancePeriod } from "@/lib/portfolio/portfolio";

export { ACCOUNT_THEME_CACHE_KEY } from "@/lib/theme";

export const ACCOUNT_PREFERENCES_KEY = "rendimentosPreferences";
export type AccountPreferences = {
  version: 1;
  theme: ThemePreference;
  chartPeriod: PerformancePeriod;
  positionsPeriod: PerformancePeriod;
};

export function parseAccountPreferences(
  userMetadata: unknown,
): AccountPreferences {
  const metadata = record(userMetadata);
  const preferences = record(metadata?.[ACCOUNT_PREFERENCES_KEY]);
  if (preferences?.version !== 1) {
    return {
      version: 1,
      theme: "system",
      chartPeriod: "Máximo",
      positionsPeriod: "Máximo",
    };
  }
  return {
    version: 1,
    theme: parseTheme(preferences.theme as string | undefined),
    chartPeriod: parseChartPeriod(
      preferences.chartPeriod as string | undefined,
    ),
    positionsPeriod: parsePositionsPeriod(
      preferences.positionsPeriod as string | undefined,
    ),
  };
}

export function hasUnsupportedAccountPreferencesVersion(
  userMetadata: unknown,
): boolean {
  const metadata = record(userMetadata);
  const preferences = record(metadata?.[ACCOUNT_PREFERENCES_KEY]);
  return (
    typeof preferences?.version === "number" &&
    Number.isInteger(preferences.version) &&
    preferences.version > 1
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
