"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffServiceRequests } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";

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
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void refreshRequests(),
    onReconnect: () => void refreshRequests(),
  });

  const itemClass = (name: StaffBottomNavProps["active"]) =>
    `flex h-14 flex-1 flex-col items-center justify-center rounded-2xl text-xs font-bold transition ${
      active === name ? "text-red-700" : "text-zinc-500"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-4 sm:max-w-xl" aria-label="Staff navigation">
      <div className="grid h-20 grid-cols-[1fr_88px_1fr] items-center rounded-[28px] border border-red-100 bg-white/95 px-3 shadow-lg shadow-red-100/70 backdrop-blur">
        <Link href="/staff/tables" className={itemClass("tables")}>
          <span className="text-lg leading-none">▦</span>
          <span>Tables</span>
        </Link>
        <Link
          href="/staff/tables"
          className="mx-auto -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-red-700 text-4xl font-light leading-none text-white shadow-lg shadow-red-200"
          aria-label="New order"
        >
          +
        </Link>
        <Link href="/staff/requests" className={`${itemClass("requests")} relative`}>
          <span className="text-lg leading-none">◎</span>
          <span>Requests</span>
          {pendingRequests > 0 && (
            <span className="absolute right-4 top-2 min-w-5 rounded-full bg-red-700 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
              {pendingRequests}
            </span>
          )}
        </Link>
      </div>
    </nav>
  );
}
