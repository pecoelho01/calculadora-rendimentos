"use client";

import { useEffect, useRef } from "react";
import { parseTheme, THEME_KEY } from "@/lib/theme";
import { Icon } from "./icon";

function isDark() {
  const theme = parseTheme(document.documentElement.dataset.theme);
  return theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function ThemeControl() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const sync = () => {
    const button = buttonRef.current;
    if (!button) return;
    const dark = isDark();
    const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
    button.dataset.dark = String(dark);
    button.setAttribute("aria-label", label);
    button.title = label;
  };

  useEffect(() => {
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== THEME_KEY && event.key !== null) return;
      document.documentElement.dataset.theme = parseTheme(event.newValue);
      sync();
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("storage", onStorage);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", sync);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="theme-control"
      aria-label="Alternar tema"
      onClick={() => {
        const theme = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        sync();
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch {
          // The theme still works for this page if storage is unavailable.
        }
      }}
    >
      <span className="theme-sun"><Icon name="sun" /></span>
      <span className="theme-moon"><Icon name="moon" /></span>
    </button>
  );
}
