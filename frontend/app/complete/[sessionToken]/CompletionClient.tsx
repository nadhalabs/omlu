"use client";

import { useEffect, useState } from "react";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { readCompletedSession, CompletedSessionMarker } from "@/lib/customerCompletion";

export default function CompletionClient({ sessionToken }: { sessionToken: string }) {
  const [marker, setMarker] = useState<CompletedSessionMarker | null>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => setMarker(readCompletedSession(sessionToken)), 0);
    return () => window.clearTimeout(timeout);
  }, [sessionToken]);

  const restaurant = marker?.restaurantName || "the restaurant";
  const tableDisplay = marker?.tableNumber ? `Table ${marker.tableNumber}` : null;

  return (
    <main className="min-h-screen bg-[var(--omlu-page-background)] px-4 py-6 text-[var(--omlu-text-primary)]">
      <div className="mx-auto max-w-md">
        <div className="flex justify-end"><PublicThemeControl /></div>
        <section
          className="mt-6 rounded-3xl bg-[var(--omlu-primary-surface)] p-6 text-center shadow-sm"
          aria-labelledby="completion-heading"
        >
          {/* Success icon */}
          <div
            aria-hidden="true"
            className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-600 text-white shadow"
          >
            <svg viewBox="0 0 32 32" className="size-9" fill="none">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
              <path
                d="M9 16.5 13.5 21 23 11"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 id="completion-heading" className="mt-4 text-2xl font-black">
            Payment successful
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
            Your dining session has ended. Thank you for visiting {restaurant}.
          </p>

          {/* Key payment facts from the session-scoped marker */}
          {(marker?.totalAmount || tableDisplay) && (
            <dl className="mx-auto mt-5 grid max-w-xs grid-cols-2 gap-3 rounded-2xl bg-[var(--omlu-muted-surface)] p-4 text-left text-sm">
              {marker?.totalAmount && (
                <div>
                  <dt className="font-bold text-[var(--omlu-text-secondary)]">Amount paid</dt>
                  <dd className="mt-0.5 text-base font-black">{marker.totalAmount}</dd>
                </div>
              )}
              {tableDisplay && (
                <div>
                  <dt className="font-bold text-[var(--omlu-text-secondary)]">Table</dt>
                  <dd className="mt-0.5 font-black">{tableDisplay}</dd>
                </div>
              )}
            </dl>
          )}

          <p className="mt-4 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            This table is ready for the next guest.
          </p>

          <div className="mt-6 grid gap-3">
            {marker?.receiptToken ? (
              <a
                href={`/bill/${encodeURIComponent(sessionToken)}?receipt=${encodeURIComponent(marker.receiptToken)}`}
                className="flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white"
              >
                View receipt
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="min-h-12 rounded-xl bg-[var(--omlu-disabled)] px-5 py-3 text-sm font-black text-[var(--omlu-disabled-text)]"
              >
                View receipt
              </button>
            )}
            <button
              type="button"
              onClick={() => window.close()}
              className="min-h-12 rounded-xl border border-[var(--omlu-border)] px-5 py-3 text-sm font-black"
            >Close</button>
          </div>
        </section>
      </div>
    </main>
  );
}
