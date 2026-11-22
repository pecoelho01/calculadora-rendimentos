"use client";

import { Icon } from "@/components/icon";
import {
  useThemePreference,
  type ThemePreference,
} from "./use-theme-preference";
import type { KeyboardEvent } from "react";

const themeOptions: {
  value: ThemePreference;
  label: string;
  icon: "sun" | "moon" | "system";
}[] = [
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Escuro", icon: "moon" },
  { value: "system", label: "Sistema", icon: "system" },
];

export function ThemePicker() {
  const { theme, chooseTheme } = useThemePreference();

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % themeOptions.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + themeOptions.length) % themeOptions.length;
    } else {
      return;
    }

    event.preventDefault();
    const nextOption = themeOptions[nextIndex];
    chooseTheme(nextOption.value);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>(".theme-option")
      [nextIndex]?.focus();
  }

  return (
    <div
      className="theme-selector"
      role="radiogroup"
      aria-label="Tema"
    >
      {themeOptions.map((option, index) => (
        <button
          className="theme-option"
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          tabIndex={theme === option.value ? 0 : -1}
          onClick={() => chooseTheme(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          <Icon name={option.icon} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
