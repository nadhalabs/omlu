"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffMe } from "@/lib/api";
import { getStaffTables, StaffTableSummary } from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";
import { CurrentStaffResponse } from "@/lib/types";

const filters = [
  ["all", "All"],
  ["available", "Available"],
  ["occupied", "Occupied"],
  ["needs_attention", "Needs attention"],
  ["bill_requested", "Bill requested"],
];

function minutes(value: number | null) {
  if (value === null) return "-";
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

export default function StaffTablesClient() {
  const [filter, setFilter] = useState("all");
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
      const data = await getStaffTables(filter);
      setTables(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tables.");
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) void load(true);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
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
    onEvent: () => void load(false),
    onReconnect: () => void load(false),
  });

  const visibleTables = tables.filter((table) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      table.table_number.toLowerCase().includes(query) ||
      table.state.toLowerCase().includes(query) ||
      (table.session_status || "").toLowerCase().includes(query) ||
      table.attention.join(" ").toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-5 text-zinc-100 sm:px-4 sm:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="sticky top-0 z-20 -mx-3 border-b border-zinc-900 bg-zinc-950/95 px-3 py-4 backdrop-blur sm:static sm:mx-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-400">{staffInfo?.restaurant_name || "Restaurant"}</p>
              <h1 className="mt-1 text-2xl font-black text-white">Tables</h1>
              <p className="mt-1 text-sm text-zinc-500">Open tables, service requests, bills, and staff-assisted orders.</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void load(false)} disabled={refreshing} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-black text-zinc-100 disabled:opacity-50">
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
              <Link href="/staff/tables" className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white">New Order</Link>
            </div>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search table, status, request"
            className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-base font-bold text-white outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold ${filter === value ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-300"}`}>
              {label}
            </button>
        ))}
        </div>
        {error && (
          <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">
            <div className="font-bold">Could not load tables.</div>
            <div className="mt-1">{error}</div>
            <button onClick={() => void load(true)} className="mt-3 rounded-lg bg-red-900/50 px-3 py-2 text-xs font-black text-red-100">Retry</button>
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-52 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />)}
          </div>
        ) : visibleTables.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">No tables match this view.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTables.map((table) => (
              <Link key={table.id} href={`/staff/tables/${table.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-700/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-black text-white">Table {table.table_number}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${table.state === "occupied" ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"}`}>{table.state}</span>
                      <span className="rounded-full bg-zinc-950 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-400">{table.session_status || "idle"}</span>
                    </div>
                  </div>
                  {table.attention.length > 0 && <span className="rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white">{table.attention.length}</span>}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Orders</div><div className="font-black">{table.active_order_count}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Bill total</div><div className="font-black">₹{table.current_bill_amount}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Latest activity</div><div className="font-black">{minutes(table.opened_minutes_ago)}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Requests</div><div className="font-black">{table.attention.length}</div></div>
                </div>
                {table.attention.length > 0 && <div className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">{table.attention.join(", ")}</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
