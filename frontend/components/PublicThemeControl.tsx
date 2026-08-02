"use client";

import { ThemeToggle } from "./ThemeToggle";

export function PublicThemeControl({ className = "" }: { className?: string }) {
  return (
    <details className={`relative ${className}`}>
      <summary aria-label="Choose color theme" className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] px-3 py-2 text-xs font-bold text-[var(--omlu-text-secondary)] shadow-sm focus-visible:outline-none">
        <span aria-hidden="true">◐</span><span className="sr-only sm:not-sr-only">Theme</span>
      </summary>
      <ThemeToggle className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] p-3 shadow-xl" />
    </details>
  );
}
