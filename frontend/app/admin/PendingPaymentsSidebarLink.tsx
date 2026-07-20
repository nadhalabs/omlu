"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRealtime, RealtimeEvent } from "@/lib/realtime";

export default function PendingPaymentsSidebarLink({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const [notice, setNotice] = useState<RealtimeEvent | null>(null);
  const active = pathname?.startsWith("/admin/payments/pending");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/staff/bills/pending-payments", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setCount(Array.isArray(body.items) ? body.items.length : 0);
  }, []);

  useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => {
      if (event.type === "bill.payment_pending") setNotice(event);
      if (["bill.sent_to_counter", "bill.payment_pending", "bill.payment_recorded", "bill.paid", "session.closed"].includes(event.type)) {
        void refresh();
      }
    },
    onReconnect: refresh,
  });

  useEffect(() => {
    const sync = () => void refresh();
    const visible = () => document.visibilityState === "visible" && sync();
    window.addEventListener("focus", sync);
    window.addEventListener("pending-payments-changed", sync);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("pending-payments-changed", sync);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  const state = notice?.state || {};
  const billNumber = String(state.bill_number || "");
  return <>
    <Link href="/admin/payments/pending" className={`px-4 py-3 rounded-xl text-sm font-bold transition flex items-center justify-between ${active ? "bg-amber-600 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`}>
      <span>💳 Pending Payments</span>
      {count > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] text-white">{count}</span>}
    </Link>
    {notice && <div className="fixed right-6 top-6 z-50 w-80 rounded-2xl border border-amber-700 bg-zinc-950 p-4 shadow-2xl">
      <button aria-label="Dismiss notification" onClick={() => setNotice(null)} className="float-right text-zinc-500">×</button>
      <p className="font-black text-white">Payment pending</p>
      <p className="mt-1 text-sm text-zinc-300">{String(state.table_name || "Table")} · ₹{Number(state.grand_total || 0).toFixed(2)}</p>
      <p className="text-xs text-zinc-500">Sent by {String(state.sent_by_name || "Staff")}</p>
      <Link onClick={() => setNotice(null)} href={`/admin/payments/pending${billNumber ? `?bill=${encodeURIComponent(billNumber)}` : ""}`} className="mt-3 inline-block text-xs font-bold text-amber-400">Tap to review →</Link>
    </div>}
  </>;
}
