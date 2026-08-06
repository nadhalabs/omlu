"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PublicThemeControl } from "@/components/PublicThemeControl";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorRef = error.digest || "ERR-APP";

  useEffect(() => {
    // Log non-sensitive error identifier only
    if (process.env.NODE_ENV === "development") {
      console.error(`[AppError] Digest: ${errorRef}`, error.message);
    } else {
      console.error(`[AppError] Digest: ${errorRef}`);
    }
  }, [error, errorRef]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-page-background)] px-4 py-12 text-[var(--omlu-text-primary)]">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <PublicThemeControl />
      </div>

      <main className="w-full max-w-md rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/60">
          <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm text-[var(--omlu-text-secondary)]">
          We encountered a temporary application problem. Please try again.
        </p>

        <p className="mt-2 text-xs font-mono text-[var(--omlu-text-secondary)] opacity-75">
          Reference Code: {errorRef}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-md transition hover:bg-orange-700 active:scale-95"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-5 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-border)] active:scale-95"
          >
            Return to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
