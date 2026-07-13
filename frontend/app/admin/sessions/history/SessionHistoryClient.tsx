"use client";

import { useEffect, useState } from "react";
import { DateFilters, EmptyState, Pager, formatDateTime, formatMinutes } from "../../historyControls";
import { fetchHistory, HistoryFilters, PaginatedResponse, SessionHistoryRow } from "@/lib/adminHistory";

export default function SessionHistoryClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today", page: 1, page_size: 25 });
  const [data, setData] = useState<PaginatedResponse<SessionHistoryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory<PaginatedResponse<SessionHistoryRow>>("sessions", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load sessions."));
    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Session History</h1>
          <p className="mt-1 text-sm text-zinc-500">Historical table sessions and settlement status.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="sessions" />
      </div>
      <div className="flex flex-wrap gap-3">
        <select value={filters.status_filter || ""} onChange={(event) => setFilters({ ...filters, status_filter: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm">
          <option value="">All statuses</option>
          {["open", "payment_requested", "payment_pending", "paid", "closed", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <input placeholder="Table ID" value={filters.table_id || ""} onChange={(event) => setFilters({ ...filters, table_id: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
        <input placeholder="Closed by staff ID" value={filters.closed_by || ""} onChange={(event) => setFilters({ ...filters, closed_by: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {!data || data.items.length === 0 ? (
        <EmptyState message="No sessions found for this period" />
      ) : (
        <div className="overflow-x-auto border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{["Session ID/reference", "Table", "Started at", "Closed at", "Duration", "Order count", "Combined subtotal", "Final bill total", "Payment status", "Closed by"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.items.map((session) => (
                <tr key={session.id} className="bg-zinc-900/60">
                  <td className="p-3 text-xs font-bold text-amber-400">{session.session_token}</td>
                  <td className="p-3">{session.table_number || "-"}</td>
                  <td className="p-3">{formatDateTime(session.started_at)}</td>
                  <td className="p-3">{formatDateTime(session.closed_at)}</td>
                  <td className="p-3">{formatMinutes(session.duration_minutes)}</td>
                  <td className="p-3">{session.order_count}</td>
                  <td className="p-3">₹{session.combined_subtotal}</td>
                  <td className="p-3">₹{session.final_bill_total}</td>
                  <td className="p-3">{session.payment_status}</td>
                  <td className="p-3">{session.closed_by || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} setPage={(page) => setFilters({ ...filters, page })} />
        </div>
      )}
    </div>
  );
}
