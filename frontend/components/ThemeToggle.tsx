"use client";

import { THEME_PREFERENCES, ThemePreference, useTheme } from "./ThemeProvider";

const labels: Record<ThemePreference, string> = { light: "Light", dark: "Dark", system: "System" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-2 text-xs font-bold text-[var(--omlu-text-secondary)]">Appearance</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-1" aria-label="Theme preference">
        {THEME_PREFERENCES.map((theme) => (
          <button
            key={theme}
            type="button"
            aria-pressed={preference === theme}
            aria-label={`Use ${labels[theme].toLowerCase()} theme`}
            onClick={() => setPreference(theme)}
            className="min-h-9 rounded-lg px-2 text-[11px] font-bold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-hover-background)] aria-pressed:bg-[var(--omlu-elevated-surface)] aria-pressed:text-[var(--omlu-text-primary)] aria-pressed:shadow-sm"
          >
            <span aria-hidden="true">{preference === theme ? "✓ " : ""}</span>{labels[theme]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
