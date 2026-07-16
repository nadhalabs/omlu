"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { getStaffMe } from "@/lib/api";
import { getStaffTables, StaffTableSummary } from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";
import { CurrentStaffResponse } from "@/lib/types";

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

function simpleStatus(table: StaffTableSummary): SimpleStatus {
  if (table.bill_requested) return "Needs Bill";
  if (table.attention.includes("ready_order")) return "Ready";
  if (!table.has_open_session) return "Available";
  if (table.active_order_count > 0) return "Preparing";
  return "Ordering";
}

function statusClasses(status: SimpleStatus) {
  if (status === "Available") return "border-green-200 bg-green-50 text-green-700";
  if (status === "Needs Bill") return "border-red-200 bg-red-50 text-red-700";
  if (status === "Ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Preparing") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function StaffTablesClient() {
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [search, setSearch] = useState("");
  const [tables, setTables] = useState<StaffTableSummary[]>([]);
  const [staffInfo, setStaffInfo] = useState<CurrentStaffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await getStaffTables("all");
      setTables(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tables.");
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(true), 0);
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

  useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void load(false),
    onReconnect: () => void load(false),
  });

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

  return (
    <div className="min-h-screen bg-[#fff6f6] px-4 pb-28 pt-5 text-zinc-950">
      <div className="mx-auto flex max-w-md flex-col gap-5 sm:max-w-xl">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => void load(false)} className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-zinc-900" aria-label="Refresh tables">
            ≡
          </button>
          <div className="text-center">
            <p className="text-xs font-bold text-zinc-400">{staffInfo?.restaurant_name || "OMLU"}</p>
            <h1 className="text-2xl font-black text-red-700">Tables</h1>
          </div>
          <Link href="/staff/requests" className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-zinc-900" aria-label="Requests">
            ⌾
          </Link>
        </header>

        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm shadow-red-100/50">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search table..."
            className="h-10 w-full bg-transparent text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition ${
                filter === value ? "bg-red-700 text-white shadow-sm shadow-red-200" : "bg-white text-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-white p-5 text-sm font-semibold text-red-700">
            <p>{error}</p>
            <button onClick={() => void load(true)} className="mt-4 h-12 rounded-full bg-red-700 px-6 font-black text-white">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 animate-pulse rounded-3xl bg-white" />)}
          </div>
        ) : visibleTables.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm font-semibold text-zinc-500">No tables found.</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {visibleTables.map((table) => {
              const status = simpleStatus(table);
              const openFor = elapsed(table.opened_minutes_ago);
              const amount = Number(table.current_bill_amount || 0);
              return (
                <Link
                  key={table.id}
                  href={`/staff/orders/new?tableId=${table.id}`}
                  className={`min-h-44 rounded-3xl border p-4 text-center shadow-sm shadow-red-100/60 ${statusClasses(status)}`}
                >
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-2xl">●●</div>
                  <div className="text-xl font-black text-zinc-950">Table {table.table_number}</div>
                  {amount > 0 && <div className="mt-1 text-sm font-bold text-zinc-600">₹{table.current_bill_amount}</div>}
                  {openFor && <div className="mt-1 text-xs font-semibold text-zinc-500">{openFor}</div>}
                  <div className="mt-4 inline-flex min-h-9 items-center rounded-full bg-white/75 px-4 text-sm font-black">{status}</div>
                </Link>
              );
            })}
          </div>
        )}
        {refreshing && <p className="text-center text-xs font-bold text-zinc-400">Updating tables...</p>}
      </div>
      <StaffBottomNav active="tables" />
    </div>
  );
}
