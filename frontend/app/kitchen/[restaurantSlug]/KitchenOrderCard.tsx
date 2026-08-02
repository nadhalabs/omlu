"use client";

import { KitchenOrderResponse } from "@/lib/types";

/**
 * Frontend presentation urgency thresholds in elapsed minutes.
 * Note: These are presentation defaults for distance readability and easy to adjust later.
 */
export const URGENCY_THRESHOLDS = {
  NORMAL: 0,
  APPROACHING_DELAY: 10,
  DELAYED: 20,
  SEVERELY_DELAYED: 30,
} as const;

export interface KitchenOrderCardProps {
  order: KitchenOrderResponse;
  isUpdating: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onStartPrep?: () => void;
  onMarkReady?: () => void;
  onMarkServed?: () => void;
}

export function calculateElapsedMinutes(createdStr: string): number {
  const created = new Date(createdStr).getTime();
  const now = new Date().getTime();
  const diffMs = Math.max(0, now - created);
  return Math.floor(diffMs / 60000);
}

export function formatElapsedTime(diffMins: number): string {
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min`;
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs}h ${mins}m`;
}

export function KitchenOrderCard({
  order,
  isUpdating,
  onAccept,
  onReject,
  onStartPrep,
  onMarkReady,
  onMarkServed,
}: KitchenOrderCardProps) {
  const tableDisplay = order.table_number.trim();
  const sourceHeading =
    order.source === "takeaway" || tableDisplay.toLowerCase() === "takeaway"
      ? "TAKEAWAY"
      : tableDisplay.toLowerCase().startsWith("table ")
      ? tableDisplay.toUpperCase()
      : `TABLE ${tableDisplay}`;

  const elapsedMins = calculateElapsedMinutes(order.created_at);
  const elapsedText = formatElapsedTime(elapsedMins);

  // Progressive Urgency Styling
  let urgencyBadgeStyle = "bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-secondary)] border-[var(--omlu-border)]";
  let urgencyLabel = "";

  if (elapsedMins >= URGENCY_THRESHOLDS.SEVERELY_DELAYED) {
    urgencyBadgeStyle = "bg-red-900/80 border-red-600 text-red-100 font-black";
    urgencyLabel = "Severely delayed";
  } else if (elapsedMins >= URGENCY_THRESHOLDS.DELAYED) {
    urgencyBadgeStyle = "bg-red-950/60 border-red-800/70 text-red-300 font-bold";
    urgencyLabel = "Delayed";
  } else if (elapsedMins >= URGENCY_THRESHOLDS.APPROACHING_DELAY) {
    urgencyBadgeStyle = "bg-amber-950/50 border-amber-800/60 text-amber-300 font-bold";
    urgencyLabel = "Approaching delay";
  }

  // Subtle pulse ONLY for new urgent orders, respecting reduced-motion
  const isNewOrder = order.status === "pending";
  const pulseClass = isNewOrder ? "motion-safe:animate-pulse" : "";

  return (
    <article
      aria-label={`${sourceHeading}, order ${order.order_number}${urgencyLabel ? `, ${urgencyLabel}` : ""}`}
      className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-4 md:p-5 flex flex-col gap-4 shadow-sm hover:border-[var(--omlu-border)] transition"
    >
      {/* Top Header: Table Number / Takeaway Heading & Distance-Readable Elapsed Badge */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--omlu-border)] pb-3">
        <div>
          <h3 className="min-w-0 break-words text-2xl font-black leading-none tracking-tight text-[var(--omlu-text-primary)]">
            {sourceHeading}
          </h3>
          <p className="mt-1 text-xs font-bold text-[var(--omlu-text-secondary)] tracking-wide">
            Order #{order.order_number}
          </p>
        </div>

        <span
          aria-label={`Elapsed time: ${elapsedText}`}
          className={`shrink-0 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wider ${urgencyBadgeStyle} ${pulseClass}`}
        >
          ⏱️ {elapsedText}
        </span>
      </div>

      {/* Item List: High Distance Contrast */}
      <div className="flex flex-col gap-3.5">
        {order.items.map((item, idx) => (
          <div key={idx} className="min-w-0">
            <p className="break-words text-base md:text-lg font-black leading-snug text-[var(--omlu-text-primary)]">
              <span className="text-orange-400 font-black text-lg md:text-xl mr-1">{item.quantity} ×</span>
              {item.item_name}
            </p>

            {/* Custom Options / Variants */}
            {item.selected_options.map((option, optionIndex) => (
              <p
                key={`${option.option_name}-${optionIndex}`}
                className="mt-1 break-words pl-6 text-xs md:text-sm font-bold leading-snug text-cyan-300"
              >
                + {option.kitchen_display_name || option.option_name}
                {option.quantity > 1 ? ` × ${option.quantity}` : ""}
              </p>
            ))}

            {/* Kitchen Item Note: Highlighted */}
            {item.item_note && (
              <div className="mt-2 break-words rounded-xl border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs md:text-sm font-bold text-amber-300 flex items-start gap-1.5">
                <span className="shrink-0">📝</span>
                <span>Note: {item.item_note}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Customer Order Note: Impossible to Overlook */}
      {order.customer_note && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block mb-0.5">
            Customer Note
          </span>
          <p className="break-words text-xs md:text-sm font-bold text-amber-200">{order.customer_note}</p>
        </div>
      )}

      {/* Action Controls Hierarchy (Correction #5) */}
      <div className="flex items-center gap-2 mt-1 pt-2 border-t border-[var(--omlu-border)]">
        {/* Secondary Reject Action for pending / accepted */}
        {onReject && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onReject}
            aria-label={`Reject order #${order.order_number}`}
            title="Reject order"
            className="min-h-12 px-4 bg-[var(--omlu-muted-surface)] hover:bg-red-950/40 border border-red-900/40 text-red-400 font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            ✕
          </button>
        )}

        {/* Primary Dominant Action */}
        {onAccept && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onAccept}
            className="min-h-12 flex-1 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-sm md:text-base tracking-wide transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            {isUpdating ? "Accepting…" : "Accept order"}
          </button>
        )}

        {onStartPrep && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onStartPrep}
            className="min-h-12 flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-black rounded-xl text-sm md:text-base tracking-wide transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            {isUpdating ? "Updating…" : "Start preparing"}
          </button>
        )}

        {onMarkReady && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onMarkReady}
            className="min-h-12 flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-sm md:text-base tracking-wide transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {isUpdating ? "Updating…" : "Mark ready"}
          </button>
        )}

        {onMarkServed && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={onMarkServed}
            className="min-h-12 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm md:text-base tracking-wide transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isUpdating ? "Updating…" : "Mark served"}
          </button>
        )}
      </div>
    </article>
  );
}
