"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getStaffMe, getStaffSessions, closeEmptySession, createOrRefreshStaffSessionBill, issueStaffBill, ApiError } from "@/lib/api";
import { CurrentStaffResponse, StaffSessionListItem } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";
import { useOmluUi } from "@/components/OmluUiProvider";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDuration(openedAtStr: string): string {
  const diffSec = Math.floor(
    (Date.now() - new Date(openedAtStr).getTime()) / 1000
  );
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  payment_requested: "Bill Requested",
  payment_pending: "Payment Pending",
};

const STATUS_PILL: Record<string, string> = {
  open: "bg-emerald-950/40 border-emerald-700/50 text-emerald-400",
  payment_requested: "bg-orange-950/40 border-orange-700/50 text-orange-400",
  payment_pending: "bg-sky-950/40 border-sky-700/50 text-sky-400",
};

const ORDER_STATUS_DOT: Record<string, string> = {
  pending: "bg-[var(--omlu-muted-surface)]",
  accepted: "bg-blue-500",
  preparing: "bg-orange-500",
  ready: "bg-lime-500",
  served: "bg-emerald-500",
  rejected: "bg-red-500",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  rejected: "Rejected",
};

// ── component ─────────────────────────────────────────────────────────────────

export default function StaffSessionsClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [sessions, setSessions] = useState<StaffSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [staffInfo, setStaffInfo] = useState<CurrentStaffResponse | null>(null);

  // Close state
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [closingToken, setClosingToken] = useState<string | null>(null);
  const [issuingTokens, setIssuingTokens] = useState<Set<string>>(() => new Set());
  const [closeError, setCloseError] = useState<Record<string, string>>({});

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIssueTokens = useRef(new Set<string>());

  const fetchSessions = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getStaffSessions();
      setSessions(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Failed to load sessions.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchSessions(true), 0);
    const interval = setInterval(() => fetchSessions(false), 5_000);
    const unregister = registerAuthenticatedCleanup(() => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    });
    return () => {
      unregister();
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchSessions]);

  useEffect(() => {
    void getStaffMe().then(setStaffInfo).catch(() => setStaffInfo(null));
  }, []);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void fetchSessions(false),
    onReconnect: () => void fetchSessions(false),
  });
  const dashboardHref =
    staffInfo?.role === "owner" || staffInfo?.role === "admin"
      ? "/admin/dashboard"
      : "/staff";
  const canCloseSession = staffInfo?.role === "owner" || staffInfo?.role === "admin";

  // Open confirm dialog
  const handleAskClose = (token: string) => {
    setConfirmToken(token);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmToken(null), 15_000);
  };

  // Confirmed close
  const handleConfirmClose = async (token: string) => {
    setConfirmToken(null);
    setClosingToken(token);
    setCloseError((prev) => {
      const next = { ...prev };
      delete next[token];
      return next;
    });
    try {
      await closeEmptySession(token);
      setSessions((prev) => prev.filter((s) => s.session_token !== token));
    } catch (err) {
      let msg = "Failed to close session.";
      if (err instanceof ApiError) msg = err.message;
      setCloseError((prev) => ({ ...prev, [token]: msg }));
    } finally {
      setClosingToken(null);
    }
  };

  const handleIssueBill = async (session: StaffSessionListItem) => {
    if (pendingIssueTokens.current.has(session.session_token) || session.bill_number) return;
    await confirmDialog({
      title: `Issue bill for Table ${session.table_number}?`,
      message: "This will generate the bill for all currently billable orders in this table session.",
      confirmLabel: "Issue Bill",
      onConfirm: async () => {
        if (pendingIssueTokens.current.has(session.session_token)) return;
        pendingIssueTokens.current.add(session.session_token);
        setIssuingTokens((previous) => new Set(previous).add(session.session_token));
        setCloseError((previous) => {
          const next = { ...previous };
          delete next[session.session_token];
          return next;
        });
        try {
          const prepared = await createOrRefreshStaffSessionBill(session.session_token);
          const issued = await issueStaffBill(prepared.bill_number);
          setSessions((previous) => previous.map((item) => item.session_token === session.session_token ? {
            ...item,
            status: "payment_requested",
            bill_number: issued.bill_number,
            bill_status: issued.status,
            bill_total: issued.total_amount,
          } : item));
          window.dispatchEvent(new Event("admin-operational-counts-changed"));
          toast("Bill issued.", "success");
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Failed to issue bill.";
          setCloseError((previous) => ({ ...previous, [session.session_token]: message }));
        } finally {
          pendingIssueTokens.current.delete(session.session_token);
          setIssuingTokens((previous) => {
            const next = new Set(previous);
            next.delete(session.session_token);
            return next;
          });
        }
      },
    });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-secondary)] py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-[var(--omlu-text-primary)] flex items-center gap-3">
              <span>🍽️ Active Tables</span>
              {sessions.length > 0 && (
                <span className="bg-emerald-600 text-[var(--omlu-primary-action-text)] text-xs font-extrabold px-2.5 py-1 rounded-full">
                  {sessions.length}
                </span>
              )}
            </h1>
            <p className="text-[var(--omlu-text-secondary)] text-sm mt-1">
              {lastUpdated
                ? `Updated: ${lastUpdated.toLocaleTimeString()} · Real-time: ${realtimeStatus}`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Nav links */}
            <Link
              href={dashboardHref}
              className="text-xs text-[var(--omlu-text-secondary)] hover:text-orange-400 font-semibold transition px-3 py-1.5 rounded-lg border border-[var(--omlu-border)] hover:border-orange-700/50"
            >
              Back to dashboard
            </Link>
            <Link
              href="/staff/tables"
              className="text-xs text-[var(--omlu-text-secondary)] hover:text-orange-400 font-semibold transition px-3 py-1.5 rounded-lg border border-[var(--omlu-border)] hover:border-orange-700/50"
            >
              Staff Tables
            </Link>
            <Link
              href="/staff/tables"
              className="text-xs text-[var(--omlu-text-secondary)] hover:text-orange-400 font-semibold transition px-3 py-1.5 rounded-lg border border-[var(--omlu-border)] hover:border-orange-700/50"
            >
              New Order
            </Link>
            <Link
              href="/staff/requests"
              className="text-xs text-[var(--omlu-text-secondary)] hover:text-orange-400 font-semibold transition px-3 py-1.5 rounded-lg border border-[var(--omlu-border)] hover:border-orange-700/50"
            >
              Service Requests
            </Link>
            <button
              id="refresh-sessions-btn"
              onClick={() => fetchSessions(false)}
              className="text-xs text-orange-500 hover:text-orange-400 underline font-semibold transition cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Global error */}
        {error && (
          <div className="bg-red-950/20 border border-red-800/40 text-red-400 rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={() => fetchSessions(true)}
              className="underline hover:text-red-300 ml-4 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && sessions.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-52 rounded-2xl bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <span className="text-5xl">🪑</span>
            <h2 className="text-xl font-black text-[var(--omlu-text-secondary)]">
              No active tables
            </h2>
            <p className="text-[var(--omlu-text-secondary)] text-sm max-w-xs">
              All tables are idle. New sessions appear here automatically every
              5 seconds.
            </p>
          </div>
        )}

        {/* Session grid */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => {
              const isClosing = closingToken === s.session_token;
              const isIssuing = issuingTokens.has(s.session_token);
              const isConfirming = confirmToken === s.session_token;
              const cardError = closeError[s.session_token];
              const orderDot =
                s.latest_order_status && ORDER_STATUS_DOT[s.latest_order_status]
                  ? ORDER_STATUS_DOT[s.latest_order_status]
                  : "bg-[var(--omlu-muted-surface)]";
              const orderLabel =
                s.latest_order_status
                  ? ORDER_STATUS_LABEL[s.latest_order_status] ?? s.latest_order_status
                  : null;

              return (
                <div
                  key={s.session_token}
                  className="relative flex flex-col gap-4 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 shadow-lg transition-all duration-200 hover:border-[var(--omlu-border)]"
                >
                  {/* Table number + status pill */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-[var(--omlu-text-primary)] leading-none">
                        {s.table_number}
                      </span>
                      <span className="text-[var(--omlu-text-secondary)] text-sm font-semibold">
                        Table
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                        STATUS_PILL[s.status] ?? "bg-[var(--omlu-muted-surface)] border-[var(--omlu-border)] text-[var(--omlu-text-secondary)]"
                      }`}
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[var(--omlu-muted-surface)] rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
                        Open for
                      </span>
                      <span
                        id={`open-duration-${s.session_token}`}
                        className="text-base font-black text-[var(--omlu-text-primary)]"
                      >
                        {formatDuration(s.opened_at)}
                      </span>
                    </div>
                    <div className="bg-[var(--omlu-muted-surface)] rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
                        Last Activity
                      </span>
                      <span className="text-base font-black text-[var(--omlu-text-secondary)]">
                        {timeAgo(s.last_activity_at)}
                      </span>
                    </div>
                    <div className="bg-[var(--omlu-muted-surface)] rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
                        Orders
                      </span>
                      <span className="text-base font-black text-[var(--omlu-text-primary)]">
                        {s.order_count}
                      </span>
                    </div>
                    <div className="bg-[var(--omlu-muted-surface)] rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-[var(--omlu-text-secondary)] uppercase tracking-wider">
                        Subtotal
                      </span>
                      <span className="text-base font-black text-orange-400">
                        ₹{Number(s.combined_subtotal).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Latest order status */}
                  {orderLabel && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${orderDot}`}
                      />
                      <span className="text-xs font-semibold text-[var(--omlu-text-secondary)]">
                        Latest order:{" "}
                        <span className="text-[var(--omlu-text-secondary)]">{orderLabel}</span>
                      </span>
                    </div>
                  )}

                  {/* Per-card error */}
                  {cardError && (
                    <p className="text-xs text-red-400 font-semibold bg-red-950/20 border border-red-800/30 rounded-xl px-3 py-2">
                      ⚠️ {cardError}
                    </p>
                  )}

                  {/* Payment-pending sessions must go through counter review. */}
                  {canCloseSession && s.status === "payment_pending" && s.bill_number && (
                    <div className="mt-auto flex flex-col gap-2">
                      <Link
                        href={`/admin/payments/pending?bill=${encodeURIComponent(s.bill_number)}`}
                        className="rounded-xl bg-orange-600 px-4 py-2 text-center text-xs font-black text-[var(--omlu-primary-action-text)] hover:bg-orange-500"
                      >
                        Review Pending Payment
                      </Link>
                      <p className="text-center text-[10px] text-[var(--omlu-text-secondary)]">
                        Cannot close a session with a payment_pending bill.
                      </p>
                    </div>
                  )}
                  {canCloseSession && s.bill_number && s.status !== "payment_pending" && (
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex items-center justify-between rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] px-3 py-2 text-xs">
                        <span className="font-bold text-[var(--omlu-text-secondary)]">{s.bill_status === "issued" ? "Bill issued" : `Bill ${s.bill_status || "created"}`}</span>
                        {s.bill_total && <span className="font-black text-orange-400">₹{s.bill_total}</span>}
                      </div>
                      <Link href={`/bill/${encodeURIComponent(s.session_token)}`} className="rounded-xl bg-[var(--omlu-muted-surface)] px-4 py-2 text-center text-xs font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">View Bill</Link>
                    </div>
                  )}
                  {canCloseSession && s.billable_order_count > 0 && !s.bill_number && (
                    <button
                      type="button"
                      disabled={isIssuing}
                      onClick={() => void handleIssueBill(s)}
                      className="mt-auto rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-[var(--omlu-primary-action-text)] hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isIssuing ? "Issuing bill…" : "Issue Bill"}
                    </button>
                  )}
                  {/* Close action */}
                  {canCloseSession && s.order_count === 0 && !s.bill_number && s.status !== "payment_pending" && (!isConfirming ? (
                    <button
                      id={`close-btn-${s.session_token}`}
                      disabled={isClosing}
                      onClick={() => handleAskClose(s.session_token)}
                      className="mt-auto text-xs font-bold text-[var(--omlu-text-secondary)] hover:text-red-400 hover:bg-red-950/20 hover:border-red-800/40 border border-[var(--omlu-border)] rounded-xl py-2 px-4 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isClosing ? "Closing…" : "Close Empty Session"}
                    </button>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <p className="text-xs text-[var(--omlu-text-secondary)] font-semibold text-center">
                        Close this session because the table is empty?
                      </p>
                      <div className="flex gap-2">
                        <button
                          id={`confirm-close-btn-${s.session_token}`}
                          onClick={() => handleConfirmClose(s.session_token)}
                          className="flex-1 bg-red-700 hover:bg-red-600 text-[var(--omlu-strong-action-text)] text-xs font-extrabold py-2 rounded-xl transition cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          id={`cancel-close-btn-${s.session_token}`}
                          onClick={() => setConfirmToken(null)}
                          className="flex-1 border border-[var(--omlu-border)] text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-secondary)] text-xs font-bold py-2 rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-[var(--omlu-text-primary)] text-xs">
          Polling every 5 seconds · Only pending orders are cancelled on close ·
          Active kitchen orders block closing
        </p>
      </div>
    </div>
  );
}
