"use client";

import { useEffect, useState } from "react";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { buildPaidCompletionMarker, markCompletedSession, readCompletedSession, CompletedSessionMarker } from "@/lib/customerCompletion";
import { clearCustomerCartState } from "@/lib/customerCompletion";
import { clearPublicSessionToken, clearParticipantToken } from "@/lib/publicSessionStorage";
import { shouldShowGoogleReviewPrompt } from "@/lib/googleReviewPrompt.mjs";
import { getPublicBill } from "@/lib/api";
import type { BillResponse, PublicReceiptBillResponse } from "@/lib/types";

type CompletionClientProps = {
  sessionToken: string;
  receiptToken?: string;
  readMarker?: (sessionToken: string) => CompletedSessionMarker | null;
  loadBill?: (sessionToken: string, receiptToken: string) => Promise<BillResponse | PublicReceiptBillResponse>;
  navigateToReview?: (url: string) => void;
  showThemeControl?: boolean;
};

const loadAuthoritativeBill = (sessionToken: string, receiptToken: string) =>
  getPublicBill(sessionToken, "", receiptToken);
const navigateToGoogleReview = (url: string) => window.location.assign(url);

export default function CompletionClient({
  sessionToken,
  receiptToken = "",
  readMarker = readCompletedSession,
  loadBill = loadAuthoritativeBill,
  navigateToReview = navigateToGoogleReview,
  showThemeControl = true,
}: CompletionClientProps) {
  const [marker, setMarker] = useState<CompletedSessionMarker | null>(null);
  const [tabClosedFallback, setTabClosedFallback] = useState(false);
  const [resolvedReviewUrl, setResolvedReviewUrl] = useState("");
  const [reviewPromptDismissed, setReviewPromptDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeCompletion() {
      const completed = readMarker(sessionToken);
      if (!cancelled) setMarker(completed);

      if (shouldShowGoogleReviewPrompt(completed?.billStatus, completed?.googleReviewUrl)) {
        if (!cancelled) setResolvedReviewUrl(completed!.googleReviewUrl!.trim());
        return;
      }

      const authoritativeReceiptToken = receiptToken || completed?.receiptToken || "";
      if (!authoritativeReceiptToken) return;

      try {
        const bill = await loadBill(sessionToken, authoritativeReceiptToken);
        if (cancelled || !shouldShowGoogleReviewPrompt(bill.status, bill.google_review_url)) return;

        const paidMarker = buildPaidCompletionMarker(bill, sessionToken);
        if (paidMarker) {
          markCompletedSession(paidMarker);
          setMarker(paidMarker);
        }
        setResolvedReviewUrl(bill.google_review_url!.trim());
      } catch {
        // The completion screen remains usable if authoritative receipt lookup fails.
      }
    }

    initializeCompletion();
    return () => { cancelled = true; };
  }, [loadBill, readMarker, receiptToken, sessionToken]);

  const showGoogleReviewModal = Boolean(resolvedReviewUrl) && !reviewPromptDismissed;

  const restaurant = marker?.restaurantName || "the restaurant";
  const tableDisplay = marker?.tableNumber ? `Table ${marker.tableNumber}` : null;

  const handleDone = () => {
    if (marker?.restaurantSlug && marker?.tableCode) {
      clearPublicSessionToken(marker.restaurantSlug, marker.tableCode);
      clearParticipantToken(marker.restaurantSlug, marker.tableCode);
      clearCustomerCartState(marker.restaurantSlug, marker.tableCode, sessionToken);
    }
    try {
      window.close();
    } catch {
      // ignore
    }
    setTimeout(() => {
      setTabClosedFallback(true);
    }, 300);
  };

  return (
    <main className="min-h-screen bg-[var(--omlu-page-background)] px-4 py-6 text-[var(--omlu-text-primary)]">
      {showGoogleReviewModal && (
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewPromptDismissed(true); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="google-review-title" className="relative w-full max-w-sm rounded-3xl bg-[var(--omlu-primary-surface)] p-6 text-center shadow-2xl">
            <button type="button" aria-label="Close review invitation" onClick={() => setReviewPromptDismissed(true)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full text-xl text-[var(--omlu-text-secondary)]">×</button>
            <h2 id="google-review-title" className="pr-6 text-xl font-black">Enjoyed your visit?</h2>
            <p className="mt-3 text-sm text-[var(--omlu-text-secondary)]">Support us with a Google review.</p>
            <button type="button" onClick={() => navigateToReview(resolvedReviewUrl)} className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white">★&nbsp; Rate us on Google</button>
            <button type="button" onClick={() => setReviewPromptDismissed(true)} className="mt-3 min-h-11 w-full rounded-xl text-sm font-bold text-[var(--omlu-text-secondary)]">Not now</button>
          </section>
        </div>
      )}
      <div className="mx-auto max-w-lg">
        {showThemeControl && <div className="flex justify-end"><PublicThemeControl /></div>}
        <section
          className="mt-6 rounded-3xl bg-[var(--omlu-primary-surface)] p-6 text-center sm:p-8"
          aria-labelledby="completion-heading"
        >
          {/* Success icon */}
          <div
            aria-hidden="true"
            className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-600 text-white"
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

          <h1 id="completion-heading" className="mt-5 text-3xl font-bold tracking-tight">
            Payment successful
          </h1>

          <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
            Your dining session has ended. Thank you for visiting {restaurant}.
          </p>

          {/* Key payment facts from the session-scoped marker */}
          {(marker?.totalAmount || tableDisplay) && (
            <dl className={`mx-auto mt-6 grid max-w-sm gap-4 border-y border-[var(--omlu-border)] py-4 text-left text-sm ${(marker?.totalAmount && tableDisplay) ? "grid-cols-2" : "grid-cols-1 text-center"}`}>
              {marker?.totalAmount && (
                <div>
                  <dt className="font-medium text-[var(--omlu-text-secondary)]">Amount paid</dt>
                  <dd className="mt-1 text-2xl font-bold">{marker.totalAmount}</dd>
                </div>
              )}
              {tableDisplay && (
                <div>
                  <dt className="font-medium text-[var(--omlu-text-secondary)]">Table</dt>
                  <dd className="mt-1 text-base font-semibold">{tableDisplay}</dd>
                </div>
              )}
            </dl>
          )}

          <p className="mt-5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            This table is ready for the next guest.
          </p>

          {tabClosedFallback && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <p>You can safely close this tab.</p>
            </div>
          )}

          <div className="mt-7 grid gap-3">
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
              onClick={handleDone}
              className="min-h-12 rounded-xl border border-[var(--omlu-border)] px-5 py-3 text-sm font-black"
            >Close</button>
          </div>
        </section>
      </div>
    </main>
  );
}
