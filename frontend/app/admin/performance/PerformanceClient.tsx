"use client";

import { useEffect, useMemo, useState } from "react";
import { DateFilters, EmptyState } from "../historyControls";
import { fetchHistory, HistoryFilters, PerformanceSummary } from "@/lib/adminHistory";

const metricLabels: Record<string, string> = {
  total_revenue: "Total revenue",
  total_orders: "Total orders",
  average_order_value: "Average order value",
  total_bills: "Total bills",
  paid_bills: "Paid bills",
  unpaid_bills: "Unpaid bills",
  cancelled_orders: "Cancelled orders",
  rejected_orders: "Rejected orders",
  payment_failures: "Payment failures",
  active_table_time_minutes: "Active table time",
  average_session_duration_minutes: "Average session duration",
};

function moneyMetric(key: string) {
  return key.includes("revenue") || key.includes("value");
}

function metricValue(key: string, value: string | number) {
  if (key.includes("minutes")) return `${value} min`;
  return moneyMetric(key) ? `₹${value}` : value;
}

function BarList<T extends Record<string, string | number>>({
  title,
  rows,
  labelKey,
  valueKey,
  suffix = "",
}: {
  title: string;
  rows: T[];
  labelKey: keyof T;
  valueKey: keyof T;
  suffix?: string;
}) {
  const max = useMemo(() => Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 0), [rows, valueKey]);
  return (
    <section className="border border-zinc-800 bg-zinc-950 p-4">
      <h2 className="text-sm font-black text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No performance data available</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((row, index) => {
            const value = Number(row[valueKey]) || 0;
            const width = max ? Math.max((value / max) * 100, 4) : 4;
            return (
              <div key={`${String(row[labelKey])}-${index}`} className="grid gap-1">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="truncate font-bold text-zinc-300">{String(row[labelKey])}</span>
                  <span className="text-zinc-500">{String(row[valueKey])}{suffix}</span>
                </div>
                <div className="h-2 bg-zinc-900">
                  <div className="h-2 bg-amber-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PerformanceClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today" });
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory<PerformanceSummary>("performance", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load performance data."));
    return () => {
      active = false;
    };
  }, [filters]);

  const hasData = data && (Number(data.metrics.total_orders) > 0 || Number(data.metrics.total_bills) > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Performance</h1>
          <p className="mt-1 text-sm text-zinc-500">Restaurant-scoped revenue, order, session, and staff activity metrics.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="performance" />
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {!data ? (
        <EmptyState message="No performance data available" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.metrics).map(([key, value]) => (
              <div key={key} className="border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{metricLabels[key] || key}</div>
                <div className="mt-2 text-2xl font-black text-white">{metricValue(key, value)}</div>
              </div>
            ))}
          </div>
          {!hasData && <EmptyState message="No performance data available" />}
          <div className="grid gap-4 xl:grid-cols-2">
            <BarList title="Revenue by day" rows={data.revenue_by_day.map((row) => ({ ...row, revenue: Number(row.revenue) }))} labelKey="date" valueKey="revenue" />
            <BarList title="Orders by day" rows={data.orders_by_day} labelKey="date" valueKey="orders" />
            <BarList title="Orders by hour" rows={data.orders_by_hour.map((row) => ({ hour: `${row.hour}:00`, orders: row.orders }))} labelKey="hour" valueKey="orders" />
            <BarList title="Top-selling items" rows={data.top_selling_items} labelKey="item_name" valueKey="quantity" />
            <BarList title="Lowest-selling items" rows={data.lowest_selling_items} labelKey="item_name" valueKey="quantity" />
            <BarList title="Category performance" rows={data.category_performance} labelKey="category_name" valueKey="quantity" />
            <BarList title="Table usage" rows={data.table_usage} labelKey="table_number" valueKey="sessions" />
            <BarList title="Staff activity" rows={data.staff_activity} labelKey="staff_name" valueKey="status_changes" />
          </div>
        </>
      )}
    </div>
  );
}
