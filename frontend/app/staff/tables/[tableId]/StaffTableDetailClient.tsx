"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffMe, resolveStaffServiceRequest } from "@/lib/api";
import {
  getStaffTableDetail,
  getStaffTableParticipants,
  requestStaffTableBill,
  revokeStaffTableParticipant,
  rotateStaffTableJoinCode,
  reportStaffTableEmpty,
  StaffTableDetail,
  StaffTableParticipants,
} from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";
import { CurrentStaffResponse } from "@/lib/types";
import { useOmluUi } from "@/components/OmluUiProvider";

export default function StaffTableDetailClient({ tableId }: { tableId: number }) {
  const { confirm: confirmDialog } = useOmluUi();
  const [detail, setDetail] = useState<StaffTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffInfo, setStaffInfo] = useState<CurrentStaffResponse | null>(null);
  const [participants, setParticipants] = useState<StaffTableParticipants | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextDetail = await getStaffTableDetail(tableId);
      setDetail(nextDetail);
      setParticipants(
        nextDetail.session
          ? await getStaffTableParticipants(nextDetail.session.session_token)
          : null
      );
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
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
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
  const activeParticipants = participants?.participants.filter((participant) => !participant.revoked_at) || [];
  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] px-3 py-5 text-[var(--omlu-text-secondary)] sm:px-4 sm:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="sticky top-0 z-20 -mx-3 border-b border-[var(--omlu-border)] bg-[var(--omlu-page-background)] px-3 py-4 backdrop-blur sm:static sm:mx-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/staff/tables" className="text-sm font-bold text-orange-400">Back to tables</Link>
              <h1 className="mt-2 text-3xl font-black text-[var(--omlu-text-primary)]">Table {detail?.table.table_number || tableId}</h1>
              <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{detail?.table.state || "Loading"} · {detail?.table.session_status || "No active session"}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--omlu-text-secondary)]">Real-time: {realtimeStatus}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={Boolean(busy)} onClick={() => void load()} className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-3 text-sm font-black text-[var(--omlu-text-secondary)] disabled:opacity-50">Refresh</button>
              <Link href={`/staff/orders/new?tableId=${tableId}`} className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-black text-[var(--omlu-primary-action-text)]">Add Order</Link>
            </div>
          </div>
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
        {loading || !detail ? (
          <div className="text-sm text-[var(--omlu-text-secondary)]">Loading table...</div>
        ) : !detail.session ? (
          <div className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center">
            <div className="text-xl font-black text-[var(--omlu-text-primary)]">No active order</div>
            <p className="mt-2 text-sm text-[var(--omlu-text-secondary)]">Add items to start an order for this table.</p>
            <Link href={`/staff/orders/new?tableId=${tableId}`} className="mt-5 inline-flex rounded-lg bg-orange-600 px-5 py-3 text-sm font-black text-[var(--omlu-primary-action-text)]">Add Order</Link>
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"><div className="text-xs text-[var(--omlu-text-secondary)]">Subtotal</div><div className="text-2xl font-black">₹{detail.session.running_subtotal}</div></div>
              <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"><div className="text-xs text-[var(--omlu-text-secondary)]">Orders</div><div className="text-2xl font-black">{detail.session.orders.length}</div></div>
              <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"><div className="text-xs text-[var(--omlu-text-secondary)]">Requests</div><div className="text-2xl font-black">{detail.requests.length}</div></div>
              <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4"><div className="text-xs text-[var(--omlu-text-secondary)]">Payment</div><div className="text-lg font-black">{bill?.status || detail.session.status}</div></div>
            </section>
            {staffInfo?.role === "staff" && (
              <section className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
                {detail.empty_table_report ? (
                  <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4 text-amber-200">
                    <p className="font-black">Empty table reported</p>
                    <p className="mt-1 text-xs">Reported {new Date(detail.empty_table_report.reported_at).toLocaleString()}</p>
                  </div>
                ) : (
                  <button disabled={Boolean(busy)} onClick={async () => {
                    if (await confirmDialog({
                      title: "Report this table as empty?",
                      message: "The owner or admin will review the table and decide whether to close the session.",
                      confirmLabel: "Report Empty Table",
                    })) void run("report-empty", () => reportStaffTableEmpty(tableId, detail.session!.session_token));
                  }} className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm font-black text-amber-200 disabled:opacity-50">
                    Report Table Empty
                  </button>
                )}
              </section>
            )}
            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
                <h2 className="font-black text-[var(--omlu-text-primary)]">Active Orders Timeline</h2>
                {detail.session.orders.length === 0 ? <p className="mt-4 text-sm text-[var(--omlu-text-secondary)]">No orders yet.</p> : (
                  <div className="mt-4 grid gap-3">
                    {detail.session.orders.map((order) => (
                      <div key={order.id} className="rounded-lg bg-[var(--omlu-page-background)] p-4">
                        <div className="flex justify-between gap-3"><div className="font-black">{order.order_number}</div><div className="text-sm text-[var(--omlu-text-secondary)]">{order.status}</div></div>
                        <div className="mt-2 text-sm text-[var(--omlu-text-secondary)]">₹{order.subtotal} · {order.source} · {new Date(order.created_at).toLocaleTimeString()}</div>
                        <div className="mt-3 grid gap-1 text-sm">{order.items.map((item, index) => <div key={index}>{item.quantity} x {item.item_name} <span className="text-[var(--omlu-text-secondary)]">₹{item.total_price}</span></div>)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
                  <h2 className="font-black text-[var(--omlu-text-primary)]">Customer Requests</h2>
                  {detail.requests.length === 0 ? <p className="mt-4 text-sm text-[var(--omlu-text-secondary)]">No pending requests.</p> : (
                    <div className="mt-4 grid gap-2">
                      {detail.requests.map((request) => (
                        <button key={request.id} disabled={busy === `request-${request.id}`} onClick={() => run(`request-${request.id}`, () => resolveStaffServiceRequest(request.id))} className="rounded-lg bg-[var(--omlu-page-background)] p-3 text-left text-sm font-bold">
                          Mark {request.request_type} handled
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
                  <h2 className="font-black text-[var(--omlu-text-primary)]">Billing</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canRequestBill && (
                      <button disabled={Boolean(busy)} onClick={() => run("bill-request", () => requestStaffTableBill(tableId))} className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-black text-[var(--omlu-primary-action-text)] disabled:opacity-50">Request Bill</button>
                    )}
                    {pendingBillRequest && (
                      <div className="rounded-lg border border-orange-700/50 bg-orange-950/30 px-4 py-3 text-sm font-bold text-orange-300">
                        Bill requested
                        <span className="block text-xs font-medium text-orange-200/80">Waiting for owner/admin review</span>
                      </div>
                    )}
                    {bill && bill.status !== "paid" && billUrl && (
                      <Link href={billUrl} className="rounded-lg bg-[var(--omlu-muted-surface)] px-4 py-3 text-sm font-black text-[var(--omlu-text-primary)]">
                        {bill.status === "issued" || bill.status === "payment_pending" ? "Bill Issued" : "View Bill"}
                      </Link>
                    )}
                  </div>
                  {!hasValidOrder && !bill && <div className="mt-4 text-sm text-[var(--omlu-text-secondary)]">Add at least one order before requesting a bill.</div>}
                  {bill && <div className="mt-4 text-sm text-[var(--omlu-text-secondary)]">Bill {bill.bill_number} · ₹{bill.total_amount} · {bill.status}</div>}
                  {staffInfo?.role === "staff" && <div className="mt-3 text-xs text-[var(--omlu-text-secondary)]">Staff can generate and send the bill. Only Owner/Admin can record payment.</div>}
                </div>
              </div>
            </section>
            <section className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-[var(--omlu-text-primary)]">Customer devices: {activeParticipants.length}</h2>
                  <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
                    Current join code: <span className="font-black tracking-[0.18em] text-[var(--omlu-text-primary)]">{participants?.join_code || "—"}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    if (await confirmDialog({
                      title: "Rotate join code?",
                      message: "The previous code will stop working immediately. Already joined devices stay connected.",
                      confirmLabel: "Rotate code",
                    })) {
                      void run("rotate-code", () => rotateStaffTableJoinCode(detail.session!.session_token));
                    }
                  }}
                  className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] px-3 py-2 text-sm font-bold text-[var(--omlu-text-secondary)] hover:border-orange-500 hover:text-[var(--omlu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Rotate code
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {participants?.participants.map((participant) => (
                  <div key={participant.public_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--omlu-page-background)] px-3 py-2">
                    <div className={participant.revoked_at ? "text-[var(--omlu-text-secondary)]" : "text-[var(--omlu-text-secondary)]"}>
                      <span className="font-bold">{participant.label}</span>
                      <span className="ml-2 text-xs">
                        {participant.revoked_at ? "Revoked" : `Joined ${new Date(participant.joined_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                      </span>
                    </div>
                    {!participant.revoked_at && (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={async () => {
                          if (await confirmDialog({
                            title: `Revoke ${participant.label}?`,
                            message: "That device will immediately lose ordering and table-session access. Existing accepted orders remain unchanged.",
                            confirmLabel: "Revoke device",
                            tone: "destructive",
                          })) {
                            void run(
                              `revoke-${participant.public_id}`,
                              () => revokeStaffTableParticipant(detail.session!.session_token, participant.public_id)
                            );
                          }
                        }}
                        className="rounded-md border border-red-900/70 px-2.5 py-1.5 text-xs font-bold text-red-300 hover:border-red-600 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                {participants && participants.participants.length === 0 && (
                  <p className="text-sm text-[var(--omlu-text-secondary)]">No customer devices have joined.</p>
                )}
              </div>
            </section>
            <section className="rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
              <h2 className="font-black text-[var(--omlu-text-primary)]">Activity Timeline</h2>
              <div className="mt-4 grid gap-2 text-sm text-[var(--omlu-text-secondary)]">
                {detail.activity.map((item, index) => <div key={index}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"} · {item.label}</div>)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
