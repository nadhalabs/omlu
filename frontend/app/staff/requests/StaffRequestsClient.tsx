"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getStaffServiceRequests,
  resolveStaffServiceRequest,
  confirmStaffCounterPayment,
  createOrRefreshPublicBill,
  issueStaffBill,
  ApiError,
} from "@/lib/api";
import { CounterPaymentMethod, StaffServiceRequestResponse } from "@/lib/types";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  waiter: "🙋 Waiter",
  water: "💧 Water",
  bill: "🧾 Bill",
};

const REQUEST_TYPE_COLORS: Record<string, string> = {
  waiter: "bg-amber-950/30 border-amber-700/40 text-amber-400",
  water: "bg-sky-950/30 border-sky-700/40 text-sky-400",
  bill: "bg-emerald-950/30 border-emerald-700/40 text-emerald-400",
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function StaffRequestsClient() {
  const [requests, setRequests] = useState<StaffServiceRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [issuingId, setIssuingId] = useState<number | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<string | null>(null);
  const [paidBills, setPaidBills] = useState<
    Record<number, { method: CounterPaymentMethod | "online"; paidAt: string }>
  >({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track IDs we've already alerted for so we don't replay
  const alertedIdsRef = useRef<Set<number>>(new Set());

  const fetchRequests = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const data = await getStaffServiceRequests(showResolved ? "all" : "pending");
        setRequests(data);
        setError(null);
        setLastUpdated(new Date());

        // Sound alert: only for NEW pending requests not previously alerted
        const pendingIds = data
          .filter((r) => r.status === "pending")
          .map((r) => r.id);
        const newIds = pendingIds.filter((id) => !alertedIdsRef.current.has(id));
        if (newIds.length > 0) {
          // Play alert sound
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {}); // Suppress autoplay block errors
          }
          newIds.forEach((id) => alertedIdsRef.current.add(id));
        }
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to fetch service requests.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [showResolved]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchRequests(true), 0);
    const interval = setInterval(() => fetchRequests(false), 5_000);
    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchRequests]);

  const handleResolve = async (requestId: number) => {
    setResolvingId(requestId);
    try {
      const updated = await resolveStaffServiceRequest(requestId);
      // Optimistically update the local state
      setRequests((prev) =>
        prev.map((r) =>
          r.id === updated.id ? { ...r, ...updated } : r
        )
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Failed to resolve request.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleIssueBill = async (req: StaffServiceRequestResponse) => {
    if (!req.dining_session_token || issuingId === req.id) return;
    setIssuingId(req.id);
    setError(null);
    try {
      const bill = req.bill_number
        ? null
        : await createOrRefreshPublicBill(req.dining_session_token);
      const billNumber = req.bill_number || bill?.bill_number;
      if (!billNumber) {
        throw new Error("Bill could not be prepared.");
      }
      const issued = await issueStaffBill(billNumber);
      setRequests((prev) =>
        prev.map((item) =>
          item.id === req.id
            ? { ...item, bill_number: issued.bill_number }
            : item
        )
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Failed to issue bill.");
    } finally {
      setIssuingId(null);
    }
  };

  const handleConfirmPayment = async (
    req: StaffServiceRequestResponse,
    method: CounterPaymentMethod
  ) => {
    if (!req.dining_session_token) return;
    const actionKey = `${req.id}-${method}`;
    if (confirmingPayment) return;
    setConfirmingPayment(actionKey);
    setError(null);
    try {
      const bill = req.bill_number
        ? null
        : await createOrRefreshPublicBill(req.dining_session_token);
      const billNumber = req.bill_number || bill?.bill_number;
      if (!billNumber) {
        throw new Error("Bill could not be prepared.");
      }
      const paid = await confirmStaffCounterPayment(billNumber, method);
      setRequests((prev) =>
        prev.map((item) =>
          item.id === req.id
            ? { ...item, bill_number: paid.bill_number }
            : item
        )
      );
      setPaidBills((prev) => ({
        ...prev,
        [req.id]: {
          method: paid.payment_method || method,
          paidAt: paid.paid_at || new Date().toISOString(),
        },
      }));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Failed to confirm payment.");
    } finally {
      setConfirmingPayment(null);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 sm:px-6">
      {/* Hidden audio element for alert sound */}
      <audio ref={audioRef} src="/notification.mp3" preload="auto" aria-hidden="true" />

      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">
              Service Requests
              {pendingCount > 0 && (
                <span className="ml-3 bg-amber-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-full align-middle animate-pulse">
                  {pendingCount}
                </span>
              )}
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              {lastUpdated
                ? `Updated: ${lastUpdated.toLocaleTimeString()}`
                : "Loading…"}
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            {/* Show resolved toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={() => setShowResolved(!showResolved)}
                className="accent-amber-500 w-4 h-4 rounded"
              />
              Show resolved
            </label>
            {/* Active Tables link */}
            <Link
              href="/staff/sessions"
              className="text-xs text-zinc-400 hover:text-emerald-400 font-semibold transition px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-emerald-700/50"
            >
              Active Tables
            </Link>
            <button
              onClick={() => fetchRequests(false)}
              className="text-xs text-amber-500 hover:text-amber-400 underline font-semibold transition cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-950/20 border border-red-800/40 text-red-400 rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={() => fetchRequests(true)}
              className="underline hover:text-red-300 ml-4 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-10 h-10 border-t-2 border-b-2 border-amber-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && requests.length === 0 && !error && (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-5xl mb-4">🔕</div>
            <p className="font-semibold">No service requests found.</p>
            <p className="text-sm mt-2">Requests will appear here when customers send them.</p>
          </div>
        )}

        {/* Requests List */}
        {!loading && requests.length > 0 && (
          <div className="flex flex-col gap-3">
            {requests.map((req) => {
              const isPending = req.status === "pending";
              const typeColor = REQUEST_TYPE_COLORS[req.request_type] || "bg-zinc-900 border-zinc-700 text-zinc-300";
              const paidBill = paidBills[req.id];

              return (
                <div
                  key={req.id}
                  id={`request-${req.id}`}
                  className={`rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-200 ${
                    isPending
                      ? "bg-zinc-900 border-zinc-700 shadow-sm"
                      : "bg-zinc-900/50 border-zinc-800 opacity-60"
                  }`}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      {/* Request Type Badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-lg px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${typeColor}`}
                      >
                        {REQUEST_TYPE_LABELS[req.request_type] || req.request_type}
                      </span>
                      <div className="flex gap-3 mt-1">
                        <span className="text-white font-bold text-sm">
                          Table {req.table_number || "—"}
                        </span>
                        {req.order_number && (
                          <span className="text-zinc-500 text-xs font-semibold self-center">
                            Order {req.order_number}
                          </span>
                        )}
                      </div>
                      <span className="text-zinc-500 text-xs">
                        {timeAgo(req.created_at)}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {isPending ? (
                        <div className="flex flex-col gap-2">
                          {paidBill && (
                            <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-300">
                              <p>Paid</p>
                              <p>
                                {paidBill.method === "counter_cash"
                                  ? "Cash"
                                  : paidBill.method === "counter_upi"
                                    ? "UPI"
                                    : "Online"}
                              </p>
                              <p>{new Date(paidBill.paidAt).toLocaleTimeString()}</p>
                            </div>
                          )}
                          {req.request_type === "bill" && req.dining_session_token && !paidBill && (
                            <div className="flex flex-col gap-2">
                              <a
                                href={`/bill/${encodeURIComponent(req.dining_session_token)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs rounded-xl transition text-center"
                              >
                                Open Bill
                              </a>
                              <button
                                onClick={() => handleIssueBill(req)}
                                disabled={issuingId === req.id}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                              >
                                {issuingId === req.id ? "Issuing…" : "Issue Bill"}
                              </button>
                              <button
                                onClick={() => handleConfirmPayment(req, "counter_cash")}
                                disabled={confirmingPayment !== null}
                                className="px-4 py-2 bg-zinc-100 hover:bg-white disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl transition cursor-pointer"
                              >
                                {confirmingPayment === `${req.id}-counter_cash`
                                  ? "Confirming…"
                                  : "Confirm Cash Payment"}
                              </button>
                              <button
                                onClick={() => handleConfirmPayment(req, "counter_upi")}
                                disabled={confirmingPayment !== null}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                              >
                                {confirmingPayment === `${req.id}-counter_upi`
                                  ? "Confirming…"
                                  : "Confirm UPI Payment"}
                              </button>
                            </div>
                          )}
                          <button
                            id={`resolve-btn-${req.id}`}
                            onClick={() => handleResolve(req.id)}
                            disabled={resolvingId === req.id}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                          >
                            {resolvingId === req.id ? "Resolving…" : "Mark Resolved"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                          ✓ Resolved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resolver info (when resolved) */}
                  {req.status === "resolved" && (
                    <div className="text-xs text-zinc-500 font-semibold border-t border-zinc-800 pt-2">
                      Resolved by{" "}
                      <span className="text-zinc-400">
                        {req.resolver_name || "Staff"}
                      </span>
                      {req.resolved_at && (
                        <> · {timeAgo(req.resolved_at)}</>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
