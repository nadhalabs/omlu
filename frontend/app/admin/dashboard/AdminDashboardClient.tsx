"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAdminDashboardSummary,
  ApiError,
} from "@/lib/api";
import { DashboardSummaryResponse } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { queryKeys, useCachedQuery } from "@/lib/queryCache";
import { buildHourlyChart } from "@/lib/dashboardHourly";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";

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
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 shadow-sm sm:p-5 ${accent || ""}`}
    >
      <div className="flex items-center gap-2 text-[var(--omlu-text-secondary)] text-xs font-bold uppercase tracking-wider">
        <span className="text-lg">{icon}</span>
        {label}
      </div>
      <div className="min-w-0 break-words text-2xl font-black text-[var(--omlu-text-primary)] sm:text-3xl">{value}</div>
      {sub && (
        <div className="text-xs text-[var(--omlu-text-secondary)] font-semibold">{sub}</div>
      )}
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

export default function AdminDashboardClient() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [backendHealthUnavailable, setBackendHealthUnavailable] = useState(false);

  const queryFn = useCallback(async () => {
    const summary = await getAdminDashboardSummary();
    setLastUpdated(new Date());
    return summary;
  }, []);
  const {
    data,
    error: queryError,
    isLoading: loading,
    isRefreshing,
    refetch,
  } = useCachedQuery<DashboardSummaryResponse>(queryKeys.dashboard(), queryFn, {
    staleTime: 30_000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : "Could not load dashboard data."
    : null;
  const fetchDashboard = useCallback(async () => {
    await refetch().catch(() => undefined);
  }, [refetch]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "admin" },
    onEvent: () => void fetchDashboard(),
    onReconnect: () => void fetchDashboard(),
  });

  useEffect(() => {
    const intervalMs = realtimeStatus === "live" ? 90_000 : 30_000;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetchDashboard();
    }, intervalMs);
    const unregister = registerAuthenticatedCleanup(() => clearInterval(interval));
    return () => {
      unregister();
      clearInterval(interval);
    };
  }, [fetchDashboard, realtimeStatus]);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      if (!isVisible) return;
      try {
        const response = await fetch("/api/health/ready", { cache: "no-store" });
        if (active) setBackendHealthUnavailable(!response.ok);
      } catch {
        if (active) setBackendHealthUnavailable(true);
      }
    };
    void checkHealth();
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void checkHealth();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6" aria-label="Loading dashboard">
        <div className="space-y-3"><div className="omlu-skeleton h-7 w-48 rounded" /><div className="omlu-skeleton h-4 w-72 max-w-full rounded" /></div>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5"><div className="omlu-skeleton h-3 w-24 rounded" /><div className="omlu-skeleton mt-4 h-8 w-20 rounded" /></div>)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2"><div className="omlu-skeleton h-72 rounded-2xl" /><div className="omlu-skeleton h-72 rounded-2xl" /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="bg-red-950/20 border border-red-800/30 rounded-2xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-[var(--omlu-text-primary)] font-bold text-lg mb-2">Dashboard unavailable</h2>
          <p className="text-[var(--omlu-text-secondary)] text-sm mb-6">{error}</p>
          <button
            onClick={() => void fetchDashboard()}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-[var(--omlu-primary-action-text)] font-semibold rounded-xl transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build hours array for the bar chart (0–23)
  const hourlyChart = buildHourlyChart(data.orders_by_hour);

  const currency = data.timezone?.includes("Kolkata") ? "₹" : "¤";

  return (
    <div className="flex flex-col gap-8">
      {(backendHealthUnavailable || realtimeStatus === "offline" || realtimeStatus === "reconnecting") && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200">
          {backendHealthUnavailable
            ? "Some backend services are unavailable. Live data may be delayed; retry before recording critical actions."
            : "Real-time updates are reconnecting. Refresh before acting on time-sensitive information."}
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Admin Home</h1>
          <p className="text-[var(--omlu-text-secondary)] text-sm mt-1">
            Timezone: <span className="text-orange-500 font-bold">{data.timezone}</span>
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--omlu-text-secondary)]">
            Real-time: {realtimeStatus}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {lastUpdated && (
            <span className="text-xs text-[var(--omlu-text-secondary)] font-semibold">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => void fetchDashboard()}
            disabled={isRefreshing}
            className="text-xs text-orange-500 hover:text-orange-400 underline font-semibold transition cursor-pointer"
          >
            {isRefreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
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
          href="/admin/requests"
        />
        <StatCard
          label="Service Requests"
          value={data.active_service_request_count}
          sub="Pending only"
          icon="!"
          href="/admin/requests"
          accent={data.active_service_request_count > 0 ? "border-orange-600/50" : ""}
        />
        <StatCard
          label="Collected Revenue"
          value={`${currency}${data.collected_revenue}`}
          sub="Collected from paid bills and quick sales"
          icon="₹"
          accent="border-orange-700/30"
        />
        <StatCard
          label="Pending Collection"
          value={`${currency}${data.pending_collection}`}
          sub="Issued and payment-pending bills"
          icon="₹"
        />
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
        <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
          <h2 className="text-sm font-black text-[var(--omlu-text-primary)] uppercase tracking-wider mb-4">
            Live Restaurant
          </h2>
          {data.tables.length === 0 ? (
            <p className="text-[var(--omlu-text-secondary)] text-sm">No active tables configured.</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {data.tables.map((table) => (
                <div key={table.table_id} className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[var(--omlu-text-primary)] font-black">Table {table.table_number}</div>
                      <div className="text-xs"><span className="text-[var(--omlu-text-secondary)]">{table.order_count} orders · </span><span className="font-bold text-[var(--omlu-text-primary)]">{currency}{table.bill_total}</span></div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md ${table.status === "Needs Attention" ? "bg-orange-950 text-orange-300" : table.status.includes("Payment") || table.status.includes("Bill") ? "bg-sky-950 text-sky-300" : table.status === "Available" ? "border border-green-300 bg-green-100 text-green-700" : "bg-emerald-950 text-emerald-300"}`}>
                      {table.status}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--omlu-text-secondary)]">
                    Last activity: {table.last_activity_at ? new Date(table.last_activity_at).toLocaleTimeString() : "None"}
                    {table.pending_request && <span className="block text-orange-400 mt-1">Request: {table.pending_request}</span>}
                    {table.payment_status && <span className="block mt-1">Payment: {table.payment_status}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href="/staff/sessions" className="text-[11px] px-2 py-1 rounded bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] font-bold">Open Session</a>
                    <a href={`/kitchen/${data.restaurant_slug}`} className="text-[11px] px-2 py-1 rounded bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] font-bold">View Orders</a>
                    <a href="/admin/requests" className="text-[11px] px-2 py-1 rounded bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] font-bold">View Bill</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
          <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-4">
            Attention Required
          </h2>
          {data.attention_items.length === 0 ? (
            <p className="text-[var(--omlu-text-secondary)] text-sm">No urgent operational issues.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.attention_items.map((item, idx) => (
                <div key={`${item.type}-${idx}`} className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-lg px-3 py-2">
                  <div className="text-[var(--omlu-text-primary)] font-bold text-sm">{item.label}</div>
                  <div className="text-xs text-[var(--omlu-text-secondary)]">
                    {item.table_number ? `Table ${item.table_number}` : "Restaurant"} · {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider">
              Recent Activity
            </h2>
            <a href="/admin/history?view=orders" className="text-xs font-bold text-orange-400 hover:text-orange-300">
              View all activity
            </a>
          </div>
          {data.recent_activity.length === 0 ? (
            <p className="text-[var(--omlu-text-secondary)] text-sm">No activity recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.recent_activity.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 text-sm border-b border-[var(--omlu-border)] pb-2 last:border-0">
                  <span className="text-[var(--omlu-text-secondary)]">{item.action} {item.table_number ? `· Table ${item.table_number}` : ""}</span>
                  <span className="text-[var(--omlu-text-secondary)] shrink-0">{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
          <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ["🧾 Quick Sale", "/admin/quick-sale"],
              ["Add Staff", "/admin/staff"],
              ["Open New Table Session", "/staff/sessions"],
              ["View All Tables", "/admin/tables"],
              ["View Orders", `/kitchen/${data.restaurant_slug}`],
              ["View Bills", "/admin/requests"],
              ["Manage Menu", "/admin/menu"],
              ["Staff Management", "/admin/staff"],
              ["Restaurant Settings", "/admin/settings"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--omlu-text-primary)] hover:border-orange-700/50">
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Top Selling Items */}
      <section className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
        <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-4">
          🏆 Top Selling Items Today
        </h2>
        {data.top_selling_items.length === 0 ? (
          <p className="text-[var(--omlu-text-secondary)] text-sm">No served orders yet today.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.top_selling_items.map((item, idx) => (
              <div
                key={item.item_name}
                className="flex items-center gap-3 bg-[var(--omlu-muted-surface)] rounded-xl px-4 py-3"
              >
                <span className="text-orange-500 font-extrabold text-sm w-6 shrink-0">
                  #{idx + 1}
                </span>
                <span className="flex-1 text-[var(--omlu-text-primary)] font-bold text-sm truncate">
                  {item.item_name}
                </span>
                <span className="text-[var(--omlu-text-secondary)] font-semibold text-sm shrink-0">
                  {item.total_quantity} sold
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Orders by Hour Chart */}
      <section className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-6">
        <h2 className="text-sm font-black text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-6">
          🕐 Orders by Hour (Today)
        </h2>
        {hourlyChart.total === 0 ? (
          <p className="text-[var(--omlu-text-secondary)] text-sm">No orders placed yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid h-36 min-w-[520px] grid-cols-[repeat(24,minmax(20px,1fr))] gap-1 pb-2" role="img" aria-label={`${hourlyChart.total} orders today by local restaurant hour`}>
              {hourlyChart.buckets.map(({ hour: h, orders: count }) => {
                const heightPct = (count / hourlyChart.max) * 100;
                return (
                  <div
                    key={h}
                    className="grid min-w-[20px] grid-rows-[1fr_14px] gap-1"
                  >
                    <div className="flex min-h-0 items-end">
                      <div
                        className="w-full rounded-t bg-orange-500 transition-all duration-300"
                        style={{ height: `${Math.max(heightPct, count > 0 ? 8 : 0)}%` }}
                        title={`${h}:00 — ${count} order${count !== 1 ? "s" : ""}`}
                        aria-label={`${h}:00, ${count} order${count !== 1 ? "s" : ""}`}
                      />
                    </div>
                    {h % 3 === 0 && (
                      <span className="text-center text-[8px] font-semibold text-[var(--omlu-text-secondary)]">{h}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
