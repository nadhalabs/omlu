"use client";

import { useTheme } from "./ThemeProvider";

export function PublicThemeControl({ className = "" }: { className?: string }) {
  const { resolvedTheme, setPreference } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setPreference(isDark ? "light" : "dark")}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] text-[var(--omlu-text-secondary)] shadow-sm hover:bg-[var(--omlu-hover-background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] ${className}`}
    >
      {isDark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
