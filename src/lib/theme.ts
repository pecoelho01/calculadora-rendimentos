export const THEME_KEY = "rendimentos-theme-v1";

export function parseTheme(value: string | null | undefined) {
  return value === "light" || value === "dark" ? value : "system";
}

// Synchronous initialization before the body is painted. Only validated values
// reach the DOM; CSS follows the system automatically when no override is set.
export const themeScript = `try {
  var theme = localStorage.getItem(${JSON.stringify(THEME_KEY)});
  document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'system';
} catch {}`;
