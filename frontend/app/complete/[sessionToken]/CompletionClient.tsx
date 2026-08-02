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
  return <main className="min-h-screen bg-[var(--omlu-page-background)] px-4 py-6 text-[var(--omlu-text-primary)]">
    <div className="mx-auto max-w-md">
      <div className="flex justify-end"><PublicThemeControl /></div>
      <section className="mt-6 rounded-3xl bg-[var(--omlu-primary-surface)] p-6 text-center shadow-sm">
        <div aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-600 text-2xl text-white">✓</div>
        <h1 className="mt-4 text-2xl font-black">Payment complete</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">Your dining session has ended. Thank you for visiting {restaurant}.</p>
        <div className="mt-6 grid gap-3">
          {marker?.receiptToken
            ? <a href={`/bill/${encodeURIComponent(sessionToken)}?receipt=${encodeURIComponent(marker.receiptToken)}`} className="flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white">View receipt</a>
            : <button type="button" disabled className="min-h-12 rounded-xl bg-[var(--omlu-disabled)] px-5 py-3 text-sm font-black text-[var(--omlu-disabled-text)]">View receipt</button>}
          <button type="button" onClick={() => window.close()} className="min-h-12 rounded-xl border border-[var(--omlu-border)] px-5 py-3 text-sm font-black">Close</button>
        </div>
      </section>
    </div>
  </main>;
}
