"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffMe, resolveStaffServiceRequest } from "@/lib/api";
import { getStaffTableDetail, requestStaffTableBill, StaffTableDetail } from "@/lib/staffTables";
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
  const hasValidOrder = Boolean(detail?.session?.orders.some((order) => order.status !== "rejected"));
  const pendingBillRequest = detail?.requests.find((request) => request.request_type === "bill" && request.status === "pending");
  const sessionClosedForBilling = detail?.session?.status === "closed" || detail?.session?.status === "paid" || bill?.status === "paid";
  const canRequestBill = Boolean(detail?.session && hasValidOrder && !bill && !pendingBillRequest && !sessionClosedForBilling);
  const billUrl = detail?.session?.session_token ? `/bill/${encodeURIComponent(detail.session.session_token)}` : null;
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-5 text-zinc-100 sm:px-4 sm:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="sticky top-0 z-20 -mx-3 border-b border-zinc-900 bg-zinc-950/95 px-3 py-4 backdrop-blur sm:static sm:mx-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/staff/tables" className="text-sm font-bold text-orange-400">Back to tables</Link>
              <h1 className="mt-2 text-3xl font-black text-white">Table {detail?.table.table_number || tableId}</h1>
              <p className="mt-1 text-sm text-zinc-500">{detail?.table.state || "Loading"} · {detail?.table.session_status || "No active session"}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={Boolean(busy)} onClick={() => void load()} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-black text-zinc-100 disabled:opacity-50">Refresh</button>
              <Link href={`/staff/orders/new?tableId=${tableId}`} className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-black text-white">Add Order</Link>
            </div>
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
        {loading || !detail ? (
          <div className="text-sm text-zinc-500">Loading table...</div>
        ) : !detail.session ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <div className="text-xl font-black text-white">No active order</div>
            <p className="mt-2 text-sm text-zinc-500">Add items to start an order for this table.</p>
            <Link href={`/staff/orders/new?tableId=${tableId}`} className="mt-5 inline-flex rounded-lg bg-orange-600 px-5 py-3 text-sm font-black text-white">Add Order</Link>
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Subtotal</div><div className="text-2xl font-black">₹{detail.session.running_subtotal}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Orders</div><div className="text-2xl font-black">{detail.session.orders.length}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Requests</div><div className="text-2xl font-black">{detail.requests.length}</div></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Payment</div><div className="text-lg font-black">{bill?.status || detail.session.status}</div></div>
            </section>
            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="font-black text-white">Active Orders Timeline</h2>
                {detail.session.orders.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No orders yet.</p> : (
                  <div className="mt-4 grid gap-3">
                    {detail.session.orders.map((order) => (
                      <div key={order.id} className="rounded-lg bg-zinc-950 p-4">
                        <div className="flex justify-between gap-3"><div className="font-black">{order.order_number}</div><div className="text-sm text-zinc-400">{order.status}</div></div>
                        <div className="mt-2 text-sm text-zinc-500">₹{order.subtotal} · {order.source} · {new Date(order.created_at).toLocaleTimeString()}</div>
                        <div className="mt-3 grid gap-1 text-sm">{order.items.map((item, index) => <div key={index}>{item.quantity} x {item.item_name} <span className="text-zinc-500">₹{item.total_price}</span></div>)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
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
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="font-black text-white">Billing</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canRequestBill && (
                      <button disabled={Boolean(busy)} onClick={() => run("bill-request", () => requestStaffTableBill(tableId))} className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Request Bill</button>
                    )}
                    {pendingBillRequest && (
                      <div className="rounded-lg border border-orange-700/50 bg-orange-950/30 px-4 py-3 text-sm font-bold text-orange-300">
                        Bill requested
                        <span className="block text-xs font-medium text-orange-200/80">Waiting for owner/admin review</span>
                      </div>
                    )}
                    {bill && bill.status !== "paid" && billUrl && (
                      <Link href={billUrl} className="rounded-lg bg-zinc-800 px-4 py-3 text-sm font-black text-white">
                        {bill.status === "issued" || bill.status === "payment_pending" ? "Bill Issued" : "View Bill"}
                      </Link>
                    )}
                  </div>
                  {!hasValidOrder && !bill && <div className="mt-4 text-sm text-zinc-500">Add at least one order before requesting a bill.</div>}
                  {bill && <div className="mt-4 text-sm text-zinc-400">Bill {bill.bill_number} · ₹{bill.total_amount} · {bill.status}</div>}
                  {staffInfo?.role === "staff" && <div className="mt-3 text-xs text-zinc-500">Staff can generate and send the bill. Only Owner/Admin can record payment.</div>}
                </div>
              </div>
            </section>
            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
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
