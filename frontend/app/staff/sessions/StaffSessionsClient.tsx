"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getStaffSessions, closeEmptySession, ApiError } from "@/lib/api";
import { StaffSessionListItem } from "@/lib/types";

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
  payment_requested: "bg-amber-950/40 border-amber-700/50 text-amber-400",
  payment_pending: "bg-sky-950/40 border-sky-700/50 text-sky-400",
};

const ORDER_STATUS_DOT: Record<string, string> = {
  pending: "bg-zinc-500",
  accepted: "bg-blue-500",
  preparing: "bg-amber-500",
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
  const [sessions, setSessions] = useState<StaffSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Close state
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [closingToken, setClosingToken] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<Record<string, string>>({});

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchSessions]);

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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 py-8 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <span>🍽️ Active Tables</span>
              {sessions.length > 0 && (
                <span className="bg-emerald-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-full">
                  {sessions.length}
                </span>
              )}
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              {lastUpdated
                ? `Updated: ${lastUpdated.toLocaleTimeString()}`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Nav links */}
            <Link
              href="/staff/requests"
              className="text-xs text-zinc-400 hover:text-amber-400 font-semibold transition px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-amber-700/50"
            >
              Service Requests
            </Link>
            <button
              id="refresh-sessions-btn"
              onClick={() => fetchSessions(false)}
              className="text-xs text-amber-500 hover:text-amber-400 underline font-semibold transition cursor-pointer"
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
                className="h-52 rounded-2xl bg-zinc-900 border border-zinc-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <span className="text-5xl">🪑</span>
            <h2 className="text-xl font-black text-zinc-300">
              No active tables
            </h2>
            <p className="text-zinc-500 text-sm max-w-xs">
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
              const isConfirming = confirmToken === s.session_token;
              const cardError = closeError[s.session_token];
              const orderDot =
                s.latest_order_status && ORDER_STATUS_DOT[s.latest_order_status]
                  ? ORDER_STATUS_DOT[s.latest_order_status]
                  : "bg-zinc-600";
              const orderLabel =
                s.latest_order_status
                  ? ORDER_STATUS_LABEL[s.latest_order_status] ?? s.latest_order_status
                  : null;

              return (
                <div
                  key={s.session_token}
                  className="relative flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg transition-all duration-200 hover:border-zinc-700"
                >
                  {/* Table number + status pill */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-black text-white leading-none">
                        {s.table_number}
                      </span>
                      <span className="text-zinc-500 text-sm font-semibold">
                        Table
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                        STATUS_PILL[s.status] ?? "bg-zinc-800 border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/60 rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Open for
                      </span>
                      <span
                        id={`open-duration-${s.session_token}`}
                        className="text-base font-black text-white"
                      >
                        {formatDuration(s.opened_at)}
                      </span>
                    </div>
                    <div className="bg-zinc-800/60 rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Last Activity
                      </span>
                      <span className="text-base font-black text-zinc-300">
                        {timeAgo(s.last_activity_at)}
                      </span>
                    </div>
                    <div className="bg-zinc-800/60 rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Orders
                      </span>
                      <span className="text-base font-black text-white">
                        {s.order_count}
                      </span>
                    </div>
                    <div className="bg-zinc-800/60 rounded-xl p-3 flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Subtotal
                      </span>
                      <span className="text-base font-black text-amber-400">
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
                      <span className="text-xs font-semibold text-zinc-400">
                        Latest order:{" "}
                        <span className="text-zinc-200">{orderLabel}</span>
                      </span>
                    </div>
                  )}

                  {/* Per-card error */}
                  {cardError && (
                    <p className="text-xs text-red-400 font-semibold bg-red-950/20 border border-red-800/30 rounded-xl px-3 py-2">
                      ⚠️ {cardError}
                    </p>
                  )}

                  {/* Close action */}
                  {!isConfirming ? (
                    <button
                      id={`close-btn-${s.session_token}`}
                      disabled={isClosing}
                      onClick={() => handleAskClose(s.session_token)}
                      className="mt-auto text-xs font-bold text-zinc-400 hover:text-red-400 hover:bg-red-950/20 hover:border-red-800/40 border border-zinc-800 rounded-xl py-2 px-4 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isClosing ? "Closing…" : "Close Empty Session"}
                    </button>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <p className="text-xs text-zinc-300 font-semibold text-center">
                        Close this session because the table is empty?
                      </p>
                      <div className="flex gap-2">
                        <button
                          id={`confirm-close-btn-${s.session_token}`}
                          onClick={() => handleConfirmClose(s.session_token)}
                          className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-extrabold py-2 rounded-xl transition cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          id={`cancel-close-btn-${s.session_token}`}
                          onClick={() => setConfirmToken(null)}
                          className="flex-1 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-bold py-2 rounded-xl transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-zinc-700 text-xs">
          Polling every 5 seconds · Only pending orders are cancelled on close ·
          Active kitchen orders block closing
        </p>
      </div>
    </div>
  );
}
