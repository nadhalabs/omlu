"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getStaffServiceRequests, getStaffSessions } from "@/lib/api";
import { StaffServiceRequestResponse, StaffSessionListItem } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";

export default function StaffHomeClient() {
  const [sessions, setSessions] = useState<StaffSessionListItem[]>([]);
  const [requests, setRequests] = useState<StaffServiceRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionData, requestData] = await Promise.all([
        getStaffSessions(),
        getStaffServiceRequests("pending"),
      ]);
      setSessions(sessionData);
      setRequests(requestData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load staff home.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => load(), 0);
    const interval = setInterval(load, 15_000);
    const unregister = registerAuthenticatedCleanup(() => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    });
    return () => {
      unregister();
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [load]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void load(),
    onReconnect: () => void load(),
  });

  const billRequests = requests.filter((request) => request.request_type === "bill");
  const paymentPending = sessions.filter((session) => session.status === "payment_pending" || session.status === "payment_requested");
  const readyToServe = sessions.filter((session) => session.latest_order_status === "ready");

  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-secondary)] px-4 py-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Staff Home</h1>
            <p className="text-sm text-[var(--omlu-text-secondary)] mt-1">Active tables, requests, bills, and ready orders.</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--omlu-text-secondary)]">Real-time: {realtimeStatus}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/staff/tables" className="px-3 py-2 rounded-lg bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] text-sm font-bold">Tables</Link>
            <Link href="/staff/tables" className="px-3 py-2 rounded-lg bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] text-sm font-bold">New Order</Link>
            <Link href="/staff/availability" className="px-3 py-2 rounded-lg bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] text-sm font-bold">Availability</Link>
            <Link href="/staff/sessions" className="px-3 py-2 rounded-lg bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] text-sm font-bold">Active Tables</Link>
            <Link href="/staff/requests" className="px-3 py-2 rounded-lg bg-orange-600 text-sm font-bold text-[var(--omlu-primary-action-text)]">Requests</Link>
          </div>
        </div>

        <AndroidDownloadCard variant="compact" dismissible />

        {error && <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-red-300 text-sm">{error}</div>}
        {loading ? (
          <div className="text-[var(--omlu-text-secondary)] text-sm">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ["Active tables", sessions.length],
                ["New requests", requests.length],
                ["Bill requests", billRequests.length],
                ["Payment pending", paymentPending.length],
                ["Ready to serve", readyToServe.length],
                ["New orders", sessions.filter((session) => session.latest_order_status === "pending").length],
              ].map(([label, value]) => (
                <div key={label} className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-xl p-4">
                  <div className="text-2xl font-black text-[var(--omlu-text-primary)]">{value}</div>
                  <div className="text-xs text-[var(--omlu-text-secondary)] font-bold uppercase mt-1">{label}</div>
                </div>
              ))}
            </div>

            <section className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
              <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-xl p-5">
                <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-4">Active Tables</h2>
                {sessions.length === 0 ? (
                  <p className="text-sm text-[var(--omlu-text-secondary)]">No active tables.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {sessions.map((session) => (
                      <div key={session.session_token} className="bg-[var(--omlu-page-background)] border border-[var(--omlu-border)] rounded-lg p-4">
                        <div className="flex justify-between gap-3">
                          <div className="font-black text-[var(--omlu-text-primary)]">Table {session.table_number}</div>
                          <div className="text-xs text-[var(--omlu-text-secondary)]">{session.status}</div>
                        </div>
                        <div className="text-xs text-[var(--omlu-text-secondary)] mt-2">
                          {session.order_count} orders · ₹{session.combined_subtotal}
                          {session.latest_order_status && <span className="block mt-1">Latest order: {session.latest_order_status}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-xl p-5">
                <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-4">Customer Requests</h2>
                {requests.length === 0 ? (
                  <p className="text-sm text-[var(--omlu-text-secondary)]">No pending requests.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {requests.slice(0, 8).map((request) => (
                      <Link href="/staff/requests" key={request.id} className="bg-[var(--omlu-page-background)] border border-[var(--omlu-border)] rounded-lg px-3 py-2">
                        <div className="text-sm font-bold text-[var(--omlu-text-primary)]">{request.request_type} request</div>
                        <div className="text-xs text-[var(--omlu-text-secondary)]">Table {request.table_number} · {new Date(request.created_at).toLocaleTimeString()}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
