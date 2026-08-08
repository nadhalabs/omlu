"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NAV_ICONS, type NavIconId } from "./AdminNavIcon";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";
import { RealtimeEvent, useRealtime } from "@/lib/realtime";

export type OperationalCounts = {
  pendingPayments: number;
  activeTakeaways: number;
  unresolvedRequests: number;
};

type Queue = "pendingPayments" | "activeTakeaways" | "unresolvedRequests";

const OperationalCountsContext = createContext<OperationalCounts | null>(null);

const queueDetails: Record<Queue, { singular: string; plural: string; badgeClass: string }> = {
  pendingPayments: {
    singular: "pending payment",
    plural: "pending payments",
    badgeClass: "bg-red-700 text-white ring-red-300 dark:bg-red-500 dark:text-black dark:ring-red-800",
  },
  activeTakeaways: {
    singular: "active takeaway order",
    plural: "active takeaway orders",
    badgeClass: "bg-blue-700 text-white ring-blue-300 dark:bg-blue-400 dark:text-black dark:ring-blue-900",
  },
  unresolvedRequests: {
    singular: "unresolved service request",
    plural: "unresolved service requests",
    badgeClass: "bg-orange-600 text-black ring-orange-300 dark:bg-orange-400 dark:text-black dark:ring-orange-900",
  },
};

function badgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}

function countLabel(queue: Queue, count: number) {
  const details = queueDetails[queue];
  return `${count} ${count === 1 ? details.singular : details.plural}`;
}

export function AdminOperationalCountsProvider({
  initialCounts,
  children,
}: {
  initialCounts: OperationalCounts;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [paymentNotice, setPaymentNotice] = useState<RealtimeEvent | null>(null);

  const inFlightRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      pendingFetchRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      do {
        pendingFetchRef.current = false;
        try {
          const response = await fetch("/api/admin/sidebar-operational-counts", { cache: "no-store" });
          if (!response.ok) continue;
          const body = (await response.json()) as OperationalCounts;
          setCounts(body);
        } catch {
        }
      } while (pendingFetchRef.current);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => void refresh(), 300);
  }, [refresh]);

  useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => {
      if (event.type === "bill.payment_pending") setPaymentNotice(event);
      debouncedRefresh();
    },
    onReconnect: refresh,
  });

  useEffect(() => {
    const sync = () => void refresh();
    const visible = () => document.visibilityState === "visible" && sync();
    window.addEventListener("focus", sync);
    window.addEventListener("admin-operational-counts-changed", debouncedRefresh);
    document.addEventListener("visibilitychange", visible);
    const unregister = registerAuthenticatedCleanup(() => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("admin-operational-counts-changed", debouncedRefresh);
      document.removeEventListener("visibilitychange", visible);
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    });
    return () => {
      unregister();
      window.removeEventListener("focus", sync);
      window.removeEventListener("admin-operational-counts-changed", debouncedRefresh);
      document.removeEventListener("visibilitychange", visible);
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [debouncedRefresh, refresh]);

  const state = paymentNotice?.state || {};
  const billNumber = String(state.bill_number || "");
  return (
    <OperationalCountsContext.Provider value={counts}>
      {children}
      {paymentNotice && (
        <div role="status" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[55] mx-auto w-auto max-w-sm rounded-2xl border border-orange-700 bg-[var(--omlu-primary-surface)] p-4 shadow-2xl sm:right-6 sm:left-auto sm:mx-0 sm:w-80">
          <button aria-label="Dismiss notification" onClick={() => setPaymentNotice(null)} className="float-right text-[var(--omlu-text-secondary)]">×</button>
          <p className="font-black text-[var(--omlu-text-primary)]">Payment pending</p>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{String(state.table_name || "Table")} · ₹{Number(state.grand_total || 0).toFixed(2)}</p>
          <p className="text-xs text-[var(--omlu-text-secondary)]">Sent by {String(state.sent_by_name || "Staff")}</p>
          <Link onClick={() => setPaymentNotice(null)} href={`/admin/payments/pending${billNumber ? `?bill=${encodeURIComponent(billNumber)}` : ""}`} className="mt-3 inline-block text-xs font-bold text-orange-400">Tap to review →</Link>
        </div>
      )}
    </OperationalCountsContext.Provider>
  );
}

export function AdminOperationalSidebarLink({ href, label, queue, icon }: { href: string; label: string; queue: Queue; /** Serializable icon identifier resolved to a component on the client. */ icon?: NavIconId }) {
  const pathname = usePathname();
  const counts = useContext(OperationalCountsContext);
  if (!counts) throw new Error("AdminOperationalSidebarLink must be inside AdminOperationalCountsProvider");
  const count = counts[queue];
  const active = pathname === href || pathname?.startsWith(`${href}/`);
  const Icon = icon ? NAV_ICONS[icon] : null;

  return (
    <Link aria-current={active ? "page" : undefined} href={href} className={`flex min-h-11 shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold transition lg:w-full ${active ? "bg-orange-600 text-[var(--omlu-primary-action-text)]" : "text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-primary-surface)] hover:text-[var(--omlu-text-secondary)]"}`}>
      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        {Icon && <Icon aria-hidden={true} className="h-[18px] w-[18px] shrink-0" />}
        {label}
      </span>
      {count > 0 && (
        <span aria-label={countLabel(queue, count)} className={`inline-flex h-6 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-xs font-black leading-none ring-1 ${queueDetails[queue].badgeClass}`}>
          <span aria-hidden="true">{badgeText(count)}</span>
        </span>
      )}
    </Link>
  );
}
