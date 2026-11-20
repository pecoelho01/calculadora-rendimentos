export const THEME_KEY = "rendimentos-theme-v1";
export const ACCOUNT_THEME_CACHE_KEY = "rendimentos-account-theme-v1";
export type ThemePreference = "light" | "dark" | "system";

export function parseTheme(value: string | null | undefined) {
  return value === "light" || value === "dark" ? value : "system";
}

// Synchronous initialization before the body is painted. Only validated values
// reach the DOM; CSS follows the system automatically when no override is set.
export const themeScript = `try {
  var accountTheme = localStorage.getItem(${JSON.stringify(ACCOUNT_THEME_CACHE_KEY)});
  var theme = accountTheme === 'light' || accountTheme === 'dark' || accountTheme === 'system'
    ? accountTheme
    : localStorage.getItem(${JSON.stringify(THEME_KEY)});
  document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'system';
} catch {}`;
