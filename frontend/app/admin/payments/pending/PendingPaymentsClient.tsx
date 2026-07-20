"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, confirmPendingPayment, getPendingPayments } from "@/lib/api";
import { PendingPaymentItem } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { useOmluUi } from "@/components/OmluUiProvider";

function money(value: string) { return `₹${Number(value).toFixed(2)}`; }
function dateTime(value: string) { return new Date(value).toLocaleString(); }
function waiting(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function PendingPaymentsClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const selectedBill = useSearchParams().get("bill");
  const [items, setItems] = useState<PendingPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setItems(await getPendingPayments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pending payments.");
    } finally { if (showLoading) setLoading(false); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);
  useEffect(() => {
    if (!selectedBill || loading) return;
    document.getElementById(`bill-${selectedBill}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, selectedBill, items]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [refresh]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => {
      if (["bill.sent_to_counter", "bill.payment_pending", "bill.payment_recorded", "bill.paid", "session.closed"].includes(event.type)) void refresh();
    },
    onReconnect: refresh,
  });

  async function openPaymentDialog(payment: PendingPaymentItem, method: "counter_cash" | "counter_upi") {
    await confirmDialog({ title: "Confirm payment", message: "Confirm that the restaurant received this payment. Success will be shown only after backend confirmation.", details: [`Table: ${payment.table_name}`, `Bill: ${payment.bill_number}`, `Amount: ${money(payment.grand_total)}`, `Method: ${method === "counter_cash" ? "Cash" : "UPI"}`], confirmLabel: "Confirm payment", onConfirm: async () => { try { await confirmPendingPayment(payment.bill_number, method); await refresh(); window.dispatchEvent(new Event("pending-payments-changed")); toast("Payment confirmed.", "success"); } catch (err) { await refresh(); throw new Error(err instanceof ApiError ? err.message : "Payment confirmation failed."); } } });
  }

  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-black text-white">💳 Pending Payments <span className="ml-2 rounded-full bg-red-600 px-2.5 py-1 text-xs">{items.length}</span></h1>
        <p className="mt-1 text-sm text-zinc-500">Authoritative queue · Real-time: {realtimeStatus}</p></div>
      <button onClick={() => refresh(true)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold">Refresh</button>
    </header>
    {error && <div className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
    {loading ? <div className="h-48 animate-pulse rounded-2xl bg-zinc-800" /> : items.length === 0 ?
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-16 text-center"><p className="text-4xl">✓</p><h2 className="mt-3 font-black">No payments waiting</h2></div> :
      <div className="grid gap-4 xl:grid-cols-2">{items.map((item) => <article id={`bill-${item.bill_number}`} key={item.bill_id} className={`rounded-2xl border bg-zinc-950 p-5 ${selectedBill === item.bill_number ? "border-orange-500 ring-2 ring-orange-500/20" : "border-zinc-800"}`}>
        <div className="flex justify-between gap-4"><div><h2 className="text-xl font-black">{item.table_name}</h2><p className="text-xs text-zinc-500">Bill #{item.bill_id} · {item.bill_number}</p></div><p className="text-2xl font-black text-orange-400">{money(item.grand_total)}</p></div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-zinc-500">Session ID</dt><dd>{item.session_id}</dd></div>
          <div><dt className="text-zinc-500">Current status</dt><dd className="text-sky-400">Payment pending</dd></div>
          <div><dt className="text-zinc-500">Amount paid</dt><dd>{money(item.amount_paid)}</dd></div>
          <div><dt className="text-zinc-500">Remaining</dt><dd>{money(item.remaining_amount)}</dd></div>
          <div><dt className="text-zinc-500">Requested</dt><dd>{dateTime(item.requested_at)}</dd></div>
          <div><dt className="text-zinc-500">Waiting</dt><dd>{waiting(item.requested_at)}</dd></div>
          <div><dt className="text-zinc-500">Sent by</dt><dd>{item.sent_by_staff_name || "Staff"}</dd></div>
          <div><dt className="text-zinc-500">Session opened</dt><dd>{dateTime(item.session_opened_at)}</dd></div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/bill/${encodeURIComponent(item.session_token)}`} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold">View full bill</Link>
          <button onClick={() => void openPaymentDialog(item, "counter_cash")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black">Confirm Cash received</button>
          <button onClick={() => void openPaymentDialog(item, "counter_upi")} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black">Confirm UPI received</button>
        </div>
      </article>)}</div>}
  </div>;
}
