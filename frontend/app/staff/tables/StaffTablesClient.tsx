"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getStaffTables, StaffTableSummary } from "@/lib/staffTables";
import { useRealtime } from "@/lib/realtime";

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
  const [tables, setTables] = useState<StaffTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getStaffTables(filter);
      setTables(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tables.");
    } finally {
      if (showLoading) setLoading(false);
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

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void load(false),
    onReconnect: () => void load(false),
  });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">Tables</h1>
            <p className="mt-1 text-sm text-zinc-500">Open tables, requests, bills, and staff-assisted orders.</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
          </div>
          <Link href="/staff/orders/new" className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-black text-white">New Order</Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold ${filter === value ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-300"}`}>
              {label}
            </button>
          ))}
        </div>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
        {loading ? (
          <div className="text-sm text-zinc-500">Loading tables...</div>
        ) : tables.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">No tables match this filter.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <Link key={table.id} href={`/staff/tables/${table.id}`} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-700/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-black text-white">Table {table.table_number}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{table.state}</div>
                  </div>
                  {table.attention.length > 0 && <span className="rounded-full bg-amber-600 px-2 py-1 text-[10px] font-black text-white">{table.attention.length}</span>}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Orders</div><div className="font-black">{table.active_order_count}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Bill</div><div className="font-black">₹{table.current_bill_amount}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Open for</div><div className="font-black">{minutes(table.opened_minutes_ago)}</div></div>
                  <div className="rounded-lg bg-zinc-950 p-3"><div className="text-zinc-500">Status</div><div className="font-black">{table.session_status || "idle"}</div></div>
                </div>
                {table.attention.length > 0 && <div className="mt-4 text-xs font-bold text-amber-300">{table.attention.join(", ")}</div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
