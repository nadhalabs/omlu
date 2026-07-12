"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAdminDashboardSummary,
  ApiError,
} from "@/lib/api";
import { DashboardSummaryResponse } from "@/lib/types";

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  accent?: string;
  href?: string;
}) {
  const content = (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-2 shadow-sm ${accent || ""}`}
    >
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
        <span className="text-lg">{icon}</span>
        {label}
      </div>
      <div className="text-3xl font-black text-white mt-1">{value}</div>
      {sub && (
        <div className="text-xs text-zinc-500 font-semibold">{sub}</div>
      )}
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

export default function AdminDashboardClient() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const summary = await getAdminDashboardSummary();
      setData(summary);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not load dashboard data.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchDashboard(true), 0);
    // Refresh every 30 seconds automatically
    const interval = setInterval(() => fetchDashboard(false), 30_000);
    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-t-2 border-b-2 border-amber-500 rounded-full animate-spin" />
          <p className="text-zinc-400 font-semibold text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="bg-red-950/20 border border-red-800/30 rounded-2xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-white font-bold text-lg mb-2">Dashboard unavailable</h2>
          <p className="text-zinc-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => fetchDashboard(true)}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build hours array for the bar chart (0–23)
  const hourMap: Record<number, number> = {};
  for (const row of data.orders_by_hour) {
    hourMap[row.hour] = row.count;
  }
  const maxCount = Math.max(1, ...Object.values(hourMap));

  const currency = data.timezone?.includes("Kolkata") ? "₹" : "¤";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Admin Home</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Timezone: <span className="text-amber-500 font-bold">{data.timezone}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {lastUpdated && (
            <span className="text-xs text-zinc-500 font-semibold">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchDashboard(false)}
            className="text-xs text-amber-500 hover:text-amber-400 underline font-semibold transition cursor-pointer"
          >
            Refresh now
          </button>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Tables"
          value={data.active_table_count}
          icon="▦"
          href="/staff/sessions"
        />
        <StatCard
          label="Open Sessions"
          value={data.open_session_count}
          icon="◉"
          href="/staff/sessions"
        />
        <StatCard
          label="Pending Orders"
          value={data.pending_order_count}
          icon="⏱"
          href={`/kitchen/${data.restaurant_slug}`}
        />
        <StatCard
          label="Preparing"
          value={data.preparing_order_count}
          icon="◒"
          href={`/kitchen/${data.restaurant_slug}`}
        />
        <StatCard
          label="Ready Orders"
          value={data.ready_order_count}
          icon="✓"
          href={`/kitchen/${data.restaurant_slug}`}
        />
        <StatCard
          label="Payment Pending"
          value={data.payment_pending_count}
          icon="₹"
          href="/staff/requests"
        />
        <StatCard
          label="Service Requests"
          value={data.active_service_request_count}
          sub="Pending only"
          icon="!"
          href="/staff/requests"
          accent={data.active_service_request_count > 0 ? "border-amber-600/50" : ""}
        />
        <StatCard
          label="Today's Revenue"
          value={`${currency}${data.today_revenue}`}
          sub="From served orders"
          icon="₹"
          accent="border-amber-700/30"
        />
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-4">
            Live Restaurant
          </h2>
          {data.tables.length === 0 ? (
            <p className="text-zinc-500 text-sm">No active tables configured.</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {data.tables.map((table) => (
                <div key={table.table_id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white font-black">Table {table.table_number}</div>
                      <div className="text-xs text-zinc-500">{table.order_count} orders · {currency}{table.bill_total}</div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md ${table.status === "Needs Attention" ? "bg-amber-950 text-amber-300" : table.status.includes("Payment") || table.status.includes("Bill") ? "bg-sky-950 text-sky-300" : table.status === "Available" ? "bg-zinc-800 text-zinc-400" : "bg-emerald-950 text-emerald-300"}`}>
                      {table.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Last activity: {table.last_activity_at ? new Date(table.last_activity_at).toLocaleTimeString() : "None"}
                    {table.pending_request && <span className="block text-amber-400 mt-1">Request: {table.pending_request}</span>}
                    {table.payment_status && <span className="block mt-1">Payment: {table.payment_status}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href="/staff/sessions" className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-200 font-bold">Open Session</a>
                    <a href={`/kitchen/${data.restaurant_slug}`} className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-200 font-bold">View Orders</a>
                    <a href="/staff/requests" className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-200 font-bold">View Bill</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-4">
            Attention Required
          </h2>
          {data.attention_items.length === 0 ? (
            <p className="text-zinc-500 text-sm">No urgent operational issues.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.attention_items.map((item, idx) => (
                <div key={`${item.type}-${idx}`} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                  <div className="text-white font-bold text-sm">{item.label}</div>
                  <div className="text-xs text-zinc-500">
                    {item.table_number ? `Table ${item.table_number}` : "Restaurant"} · {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          {data.recent_activity.length === 0 ? (
            <p className="text-zinc-500 text-sm">No activity recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.recent_activity.map((item, idx) => (
                <div key={`${item.timestamp}-${idx}`} className="flex justify-between gap-3 text-sm border-b border-zinc-800 pb-2 last:border-0">
                  <span className="text-zinc-200">{item.action} {item.table_number ? `· Table ${item.table_number}` : ""}</span>
                  <span className="text-zinc-500 shrink-0">{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["Add Staff", "/admin/staff"],
              ["Open New Table Session", "/staff/sessions"],
              ["View All Tables", "/admin/tables"],
              ["View Orders", `/kitchen/${data.restaurant_slug}`],
              ["View Bills", "/staff/requests"],
              ["Manage Menu", "/admin/menu"],
              ["Staff Management", "/admin/staff"],
              ["Restaurant Settings", "/admin/settings"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-bold text-zinc-200 hover:border-amber-700/50">
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Top Selling Items */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-4">
          🏆 Top Selling Items Today
        </h2>
        {data.top_selling_items.length === 0 ? (
          <p className="text-zinc-500 text-sm">No served orders yet today.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.top_selling_items.map((item, idx) => (
              <div
                key={item.item_name}
                className="flex items-center gap-3 bg-zinc-800/50 rounded-xl px-4 py-3"
              >
                <span className="text-amber-500 font-extrabold text-sm w-6 shrink-0">
                  #{idx + 1}
                </span>
                <span className="flex-1 text-white font-bold text-sm truncate">
                  {item.item_name}
                </span>
                <span className="text-zinc-400 font-semibold text-sm shrink-0">
                  {item.total_quantity} sold
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Orders by Hour Chart */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider mb-6">
          🕐 Orders by Hour (Today)
        </h2>
        {data.orders_by_hour.length === 0 ? (
          <p className="text-zinc-500 text-sm">No orders placed yet today.</p>
        ) : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
            {Array.from({ length: 24 }, (_, h) => {
              const count = hourMap[h] ?? 0;
              const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div
                  key={h}
                  className="flex flex-col items-center gap-1 flex-1 min-w-[20px]"
                >
                  <div
                    className="w-full rounded-t transition-all duration-300"
                    style={{
                      height: `${Math.max(heightPct, count > 0 ? 8 : 2)}%`,
                      backgroundColor: count > 0 ? "#d97706" : "#27272a",
                    }}
                    title={`${h}:00 — ${count} order${count !== 1 ? "s" : ""}`}
                  />
                  {h % 3 === 0 && (
                    <span className="text-[8px] text-zinc-600 font-semibold">{h}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
