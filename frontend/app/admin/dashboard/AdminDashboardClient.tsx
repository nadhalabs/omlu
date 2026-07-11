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
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  accent?: string;
}) {
  return (
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
    fetchDashboard(true);
    // Refresh every 30 seconds automatically
    const interval = setInterval(() => fetchDashboard(false), 30_000);
    return () => clearInterval(interval);
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
          <h1 className="text-2xl font-black text-white">Daily Dashboard</h1>
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Orders Today"
          value={data.today_order_count}
          icon="🧾"
        />
        <StatCard
          label="Revenue Today"
          value={`${currency}${data.today_revenue}`}
          sub="From served orders only"
          icon="💰"
          accent="border-amber-700/30"
        />
        <StatCard
          label="Avg Order Value"
          value={`${currency}${data.average_order_value}`}
          sub="Served orders"
          icon="📈"
        />
        <StatCard
          label="Active Orders"
          value={data.pending_order_count}
          sub="Pending, accepted, preparing, ready"
          icon="🔄"
        />
        <StatCard
          label="Service Requests"
          value={data.active_service_request_count}
          sub="Pending only"
          icon="🔔"
          accent={data.active_service_request_count > 0 ? "border-amber-600/50" : ""}
        />
        <StatCard
          label="Rejected Orders"
          value={data.rejected_order_count}
          sub="Created today"
          icon="❌"
          accent={data.rejected_order_count > 0 ? "border-red-800/30" : ""}
        />
      </div>

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
