"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { getStaffMe } from "@/lib/api";
import { closeReportedTableSession, dismissEmptyTableReport, getStaffTables, StaffTableSummary } from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";
import { CurrentStaffResponse } from "@/lib/types";
import { queryKeys, useCachedQuery } from "@/lib/queryCache";
import { useOmluUi } from "@/components/OmluUiProvider";

const filters = [
  ["all", "All"],
  ["available", "Available"],
  ["ordering", "Ordering"],
  ["ready", "Ready"],
  ["needs_bill", "Needs Bill"],
] as const;

type SimpleStatus = "Available" | "Ordering" | "Preparing" | "Ready" | "Needs Bill";

function elapsed(value: number | null) {
  if (value === null) return null;
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function reportedAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}

function simpleStatus(table: StaffTableSummary): SimpleStatus {
  if (table.bill_requested) return "Needs Bill";
  if (table.attention.includes("ready_order")) return "Ready";
  if (!table.has_open_session) return "Available";
  if (table.active_order_count > 0) return "Preparing";
  return "Ordering";
}

function statusClasses(status: SimpleStatus) {
  if (status === "Available") return "border-green-300 bg-green-100 text-green-700";
  if (status === "Needs Bill") return "border-red-200 bg-red-50 text-red-700";
  if (status === "Ready") return "border-purple-200 bg-purple-50 text-purple-700";
  if (status === "Preparing") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default function StaffTablesClient() {
  const { confirm: confirmDialog } = useOmluUi();
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [search, setSearch] = useState("");
  const tablesQuery = useCallback(async () => {
    const data = await getStaffTables("all");
    return data.items;
  }, []);
  const staffQuery = useCallback(() => getStaffMe(), []);
  const {
    data: tables = [],
    error: tablesError,
    isLoading: loading,
    isRefreshing: refreshing,
    refetch: load,
  } = useCachedQuery<StaffTableSummary[]>(queryKeys.tables({ filter: "all" }), tablesQuery, {
    staleTime: 15_000,
  });
  const { data: staffInfo } = useCachedQuery<CurrentStaffResponse>(
    queryKeys.staffMe(),
    staffQuery,
    { staleTime: 5 * 60_000 },
  );
  const error = tablesError
    ? tablesError.message || "Could not load tables."
    : null;

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void load().catch(() => undefined),
    onReconnect: () => void load().catch(() => undefined),
  });
  useEffect(() => {
    const intervalMs = realtimeStatus === "live" ? 90_000 : 15_000;
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load().catch(() => undefined);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [load, realtimeStatus]);

  const visibleTables = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tables.filter((table) => {
      const status = simpleStatus(table);
      const matchesQuery = !query || table.table_number.toLowerCase().includes(query) || status.toLowerCase().includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "available" && status === "Available") ||
        (filter === "ordering" && (status === "Ordering" || status === "Preparing")) ||
        (filter === "ready" && status === "Ready") ||
        (filter === "needs_bill" && status === "Needs Bill");
      return matchesQuery && matchesFilter;
    });
  }, [filter, search, tables]);
  const reportCount = tables.filter((table) => table.empty_table_report).length;
  const canResolveReports = staffInfo?.role === "owner" || staffInfo?.role === "admin";
  const resolveReport = async (table: StaffTableSummary, action: "dismiss" | "close") => {
    const confirmed = await confirmDialog(action === "close" ? {
      title: `Close Table ${table.table_number}?`,
      message: "This will cancel all orders from this session, remove them from the active kitchen dashboard, void the draft bill, and end the session.",
      confirmLabel: "Close Session",
      tone: "destructive",
    } : {
      title: "Dismiss this empty-table report?",
      message: "The table session and its orders will remain unchanged.",
      confirmLabel: "Dismiss Report",
    });
    if (!confirmed) return;
    if (action === "close") await closeReportedTableSession(table.id);
    else await dismissEmptyTableReport(table.id);
    await load();
  };

  return (
    <div className="min-h-screen bg-[var(--omlu-background)] px-4 pb-28 pt-5 text-[var(--omlu-text-primary)]">
      <div className="mx-auto flex max-w-md flex-col gap-5 sm:max-w-xl">
        <header className="flex items-center justify-between">
          <button type="button" disabled={refreshing} onClick={() => void load().catch(() => undefined)} className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-[var(--omlu-text-primary)] transition active:scale-95 disabled:opacity-50" aria-label="Refresh tables">
            ≡
          </button>
          <div className="text-center">
            <p className="text-xs font-bold text-[var(--omlu-text-secondary)]">{staffInfo?.restaurant_name || "OMLU"}</p>
            <h1 className="text-2xl font-black text-orange-600">Active Tables</h1>
            {reportCount > 0 && <p className="text-xs font-black text-amber-700">{reportCount} empty-table {reportCount === 1 ? "report" : "reports"}</p>}
          </div>
          <Link href="/staff/requests" className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-[var(--omlu-text-primary)]" aria-label="Requests">
            ⌾
          </Link>
        </header>

        <div className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-3 shadow-sm shadow-orange-100/50">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search table..."
            className="h-10 w-full bg-transparent text-base font-semibold text-[var(--omlu-text-primary)] outline-none placeholder:text-[var(--omlu-text-secondary)]"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition ${
                filter === value ? "bg-orange-600 text-[var(--omlu-primary-action-text)] shadow-sm shadow-orange-200" : "bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-[var(--omlu-primary-surface)] p-5 text-sm font-semibold text-red-700">
            <p>{error}</p>
            <button onClick={() => void load().catch(() => undefined)} className="mt-4 h-12 rounded-full bg-orange-600 px-6 font-black text-[var(--omlu-primary-action-text)] transition active:scale-95">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 animate-pulse rounded-3xl bg-[var(--omlu-primary-surface)]" />)}
          </div>
        ) : visibleTables.length === 0 ? (
          <div className="rounded-3xl bg-[var(--omlu-primary-surface)] p-8 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">No tables found.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
            {visibleTables.map((table) => {
              const status = simpleStatus(table);
              const openFor = elapsed(table.opened_minutes_ago);
              const amount = Number(table.current_bill_amount || 0);
              return (
                <article
                  key={table.id}
                  className={`min-w-0 min-h-44 rounded-3xl border p-4 text-center shadow-sm shadow-orange-100/60 ${statusClasses(status)}`}
                >
                  <Link href={`/staff/tables/${table.id}`} className="block">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--omlu-primary-surface)] text-2xl">●●</div>
                  <div className="break-words text-xl font-black text-[var(--omlu-text-primary)]">Table {table.table_number}</div>
                  {amount > 0 && <div className="mt-1 text-sm font-bold text-[var(--omlu-text-secondary)]">₹{table.current_bill_amount}</div>}
                  {openFor && <div className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">{openFor}</div>}
                  <div className="mt-4 inline-flex min-h-9 items-center rounded-full bg-[var(--omlu-primary-surface)] px-4 text-sm font-black">{status}</div>
                  </Link>
                  {table.empty_table_report && (
                    <div className="mt-3 rounded-2xl border border-amber-500 bg-amber-50 p-3 text-left text-amber-950">
                      <p className="text-sm font-black">Staff reported this table empty</p>
                      <p className="mt-1 text-xs">Reported by {table.empty_table_report.reported_by_name} · {reportedAgo(table.empty_table_report.reported_at)}</p>
                      <p className="mt-0.5 text-[11px] opacity-75">{new Date(table.empty_table_report.reported_at).toLocaleString()}</p>
                      {canResolveReports && <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => void resolveReport(table, "close")} className="rounded-lg bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-black text-[var(--omlu-text-primary)]">Close Session</button>
                        <button onClick={() => void resolveReport(table, "dismiss")} className="rounded-lg border border-amber-700 px-3 py-2 text-xs font-black">Dismiss Report</button>
                      </div>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {refreshing && <p className="text-center text-xs font-bold text-[var(--omlu-text-secondary)]">Updating tables...</p>}
      </div>
      <StaffBottomNav active="tables" />
    </div>
  );
}
