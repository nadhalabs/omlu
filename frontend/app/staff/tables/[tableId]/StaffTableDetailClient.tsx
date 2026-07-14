"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { closeEmptySession, confirmStaffCounterPayment, getStaffMe, issueStaffBill, requestStaffPaymentAssistance, resolveStaffServiceRequest } from "@/lib/api";
import { generateStaffTableBill, getStaffTableDetail, startStaffTableSession, StaffTableDetail } from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";
import { CurrentStaffResponse } from "@/lib/types";

export default function StaffTableDetailClient({ tableId }: { tableId: number }) {
  const [detail, setDetail] = useState<StaffTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffInfo, setStaffInfo] = useState<CurrentStaffResponse | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getStaffTableDetail(tableId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load table.");
    } finally {
      setLoading(false);
    }
  }, [tableId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    getStaffMe()
      .then((staff) => {
        if (!cancelled) setStaffInfo(staff);
      })
      .catch(() => {
        if (!cancelled) setStaffInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void load(),
    onReconnect: () => void load(),
  });

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };
  const bill = detail?.session?.bill;
  const canRecordPayments = staffInfo?.role === "owner" || staffInfo?.role === "admin";
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/staff/tables" className="text-sm font-bold text-amber-400">Back to tables</Link>
            <h1 className="mt-2 text-3xl font-black text-white">Table {detail?.table.table_number || tableId}</h1>
            <p className="mt-1 text-sm text-zinc-500">{detail?.table.state || "Loading"} · {detail?.table.session_status || "No active session"}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!detail?.session && <button disabled={busy === "session"} onClick={() => run("session", () => startStaffTableSession(tableId))} className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Start Session</button>}
            {detail?.session && <Link href={`/staff/orders/new?tableId=${tableId}`} className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white">Add Order</Link>}
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
        {loading || !detail ? (
          <div className="text-sm text-zinc-500">Loading table...</div>
        ) : !detail.session ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <div className="text-xl font-black text-white">No active session</div>
            <p className="mt-2 text-sm text-zinc-500">Start a session before placing a staff-assisted order.</p>
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Subtotal</div><div className="text-2xl font-black">₹{detail.session.running_subtotal}</div></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Orders</div><div className="text-2xl font-black">{detail.session.orders.length}</div></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Requests</div><div className="text-2xl font-black">{detail.requests.length}</div></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Payment</div><div className="text-lg font-black">{bill?.status || detail.session.status}</div></div>
            </section>
            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="font-black text-white">Current Orders</h2>
                {detail.session.orders.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No orders yet.</p> : (
                  <div className="mt-4 grid gap-3">
                    {detail.session.orders.map((order) => (
                      <div key={order.id} className="rounded-lg bg-zinc-950 p-4">
                        <div className="flex justify-between gap-3"><div className="font-black">{order.order_number}</div><div className="text-sm text-zinc-400">{order.status}</div></div>
                        <div className="mt-2 text-sm text-zinc-500">₹{order.subtotal} · {order.source}</div>
                        <div className="mt-3 grid gap-1 text-sm">{order.items.map((item, index) => <div key={index}>{item.quantity} x {item.item_name} <span className="text-zinc-500">₹{item.total_price}</span></div>)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="font-black text-white">Customer Requests</h2>
                  {detail.requests.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No pending requests.</p> : (
                    <div className="mt-4 grid gap-2">
                      {detail.requests.map((request) => (
                        <button key={request.id} disabled={busy === `request-${request.id}`} onClick={() => run(`request-${request.id}`, () => resolveStaffServiceRequest(request.id))} className="rounded-lg bg-zinc-950 p-3 text-left text-sm font-bold">
                          Mark {request.request_type} handled
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="font-black text-white">Billing</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={Boolean(busy)} onClick={() => run("bill", () => generateStaffTableBill(tableId))} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold">Generate Bill</button>
                    {bill && bill.status !== "paid" && <button disabled={Boolean(busy)} onClick={() => run("issue", () => issueStaffBill(bill.bill_number))} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-bold">Request Payment</button>}
                    {canRecordPayments && bill && bill.status !== "paid" && ["counter_cash", "counter_upi", "counter_card"].map((method) => (
                      <button key={method} disabled={Boolean(busy)} onClick={() => run(method, () => confirmStaffCounterPayment(bill.bill_number, method as "counter_cash" | "counter_upi" | "counter_card"))} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold">{method.replace("counter_", "")}</button>
                    ))}
                    {!canRecordPayments && bill && bill.status !== "paid" && <button disabled={Boolean(busy)} onClick={() => run("payment-assistance", () => requestStaffPaymentAssistance(bill.bill_number))} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold">Notify admin for payment</button>}
                    {detail.session.orders.length === 0 && <button disabled={Boolean(busy)} onClick={() => window.confirm("Close this empty session?") && run("close", () => closeEmptySession(detail.session!.session_token))} className="rounded-lg bg-red-950/80 px-3 py-2 text-sm font-bold text-red-100">Close Session</button>}
                  </div>
                  {bill && <div className="mt-4 text-sm text-zinc-400">Bill {bill.bill_number} · ₹{bill.total_amount} · {bill.status}</div>}
                </div>
              </div>
            </section>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="font-black text-white">Activity Timeline</h2>
              <div className="mt-4 grid gap-2 text-sm text-zinc-400">
                {detail.activity.map((item, index) => <div key={index}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"} · {item.label}</div>)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
