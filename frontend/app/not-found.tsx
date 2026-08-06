"use client";

import Link from "next/link";
import { PublicThemeControl } from "@/components/PublicThemeControl";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-page-background)] px-4 py-12 text-[var(--omlu-text-primary)]">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <PublicThemeControl />
      </div>

      <main className="w-full max-w-md rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-950/60">
          <span className="text-3xl font-black text-orange-600 dark:text-orange-400">404</span>
        </div>

        <h1 className="mt-6 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">
          Page Not Found
        </h1>

        <p className="mt-3 text-sm text-[var(--omlu-text-secondary)]">
          The page or resource you are looking for does not exist or may have been moved.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-md transition hover:bg-orange-700 active:scale-95"
          >
            Return to Home
          </Link>
          <Link
            href="/staff"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-5 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-border)] active:scale-95"
          >
            Staff Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
