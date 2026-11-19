"use client";

import { Icon } from "./icon";
import { useThemePreference } from "./use-theme-preference";

export function ThemeControl() {
  const { theme, systemIsDark, chooseTheme } = useThemePreference();
  const dark = theme === "dark" || (theme === "system" && systemIsDark);
  const label = dark ? "Ativar tema claro" : "Ativar tema escuro";

  return (
    <button
      type="button"
      className="theme-control"
      data-dark={String(dark)}
      aria-label={label}
      title={label}
      onClick={() => chooseTheme(dark ? "light" : "dark")}
    >
      <span className="theme-sun">
        <Icon name="sun" />
      </span>
      <span className="theme-moon">
        <Icon name="moon" />
      </span>
    </button>
  );
}
