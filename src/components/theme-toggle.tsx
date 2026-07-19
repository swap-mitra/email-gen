"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
    >
      {/* Both icons render always; CSS shows the correct one for the live
          data-theme attribute — keeps this in sync with pre-hydration state
          without depending on React state for the icon itself. */}
      <span className="theme-toggle-icon theme-toggle-icon-light" aria-hidden="true">☀</span>
      <span className="theme-toggle-icon theme-toggle-icon-dark" aria-hidden="true">☾</span>
    </button>
  );
}
