"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffServiceRequests } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { ThemeToggle } from "@/components/ThemeToggle";

type StaffBottomNavProps = {
  active: "tables" | "order" | "requests";
  requestCount?: number;
};

export function StaffBottomNav({ active, requestCount }: StaffBottomNavProps) {
  const [pendingRequests, setPendingRequests] = useState(requestCount ?? 0);

  const refreshRequests = useCallback(async () => {
    if (typeof requestCount === "number") {
      setPendingRequests(requestCount);
      return;
    }
    try {
      const requests = await getStaffServiceRequests("pending");
      setPendingRequests(requests.filter((request) => request.status === "pending").length);
    } catch {
      setPendingRequests(0);
    }
  }, [requestCount]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshRequests(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshRequests]);

  useRealtime({
    enabled: typeof requestCount !== "number",
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void refreshRequests(),
    onReconnect: () => void refreshRequests(),
  });

  const itemClass = (name: StaffBottomNavProps["active"]) =>
    `flex h-14 flex-1 flex-col items-center justify-center rounded-2xl text-xs font-bold transition ${
      active === name ? "text-orange-600" : "text-[var(--omlu-text-secondary)]"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-xl" aria-label="Staff navigation">
      <details className="absolute bottom-24 right-4">
        <summary aria-label="Choose Staff theme" className="ml-auto flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] text-xl text-[var(--omlu-text-primary)] shadow-lg focus-visible:outline-none">◐</summary>
        <ThemeToggle className="mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] p-3 shadow-xl" />
      </details>
      <div className="grid h-20 grid-cols-[1fr_88px_1fr] items-center rounded-[28px] border border-orange-100 bg-[var(--omlu-primary-surface)] px-3 shadow-lg shadow-orange-100/70 backdrop-blur">
        <Link href="/staff/tables" className={itemClass("tables")} aria-current={active === "tables" ? "page" : undefined}>
          <span className="text-lg leading-none">▦</span>
          <span>Tables</span>
        </Link>
        <Link
          href="/staff/tables"
          className="mx-auto -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-4xl font-light leading-none text-[var(--omlu-primary-action-text)] shadow-lg shadow-orange-200"
          aria-label="New order"
          aria-current={active === "order" ? "page" : undefined}
        >
          +
        </Link>
        <Link href="/staff/requests" className={`${itemClass("requests")} relative`} aria-current={active === "requests" ? "page" : undefined}>
          <span className="text-lg leading-none">◎</span>
          <span>Requests</span>
          {pendingRequests > 0 && (
            <span className="absolute right-4 top-2 min-w-5 rounded-full bg-orange-600 px-1.5 py-0.5 text-center text-[10px] font-black text-[var(--omlu-primary-action-text)]">
              {pendingRequests}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
