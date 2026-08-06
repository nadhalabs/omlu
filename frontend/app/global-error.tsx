"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorRef = error.digest || "ERR-ROOT";

  useEffect(() => {
    console.error(`[GlobalError] ${errorRef}`);
  }, [errorRef]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 antialiased">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-950/60">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h1 className="mt-6 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Application Error
          </h1>

          <p className="mt-3 text-sm text-slate-400">
            A critical application error occurred. Please try reloading the page.
          </p>

          <p className="mt-2 text-xs font-mono text-slate-500">
            Reference Code: {errorRef}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => reset()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-md transition hover:bg-orange-700 active:scale-95"
            >
              Reload Application
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-5 text-sm font-bold text-slate-200 transition hover:bg-slate-800 active:scale-95"
            >
              Go to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
