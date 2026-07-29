"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchHistory,
  downloadHistoryPdf,
  exportHistory,
  HistoryFilters,
  PerformanceSummary,
} from "@/lib/adminHistory";
import { queryKeys, useCachedQuery } from "@/lib/queryCache";
import { useRealtime } from "@/lib/realtime";
import { formatCurrency, formatAverageOrderValue, formatDurationMinutes } from "./performanceFormatters";
import { TrendChart, HourBarChart, RankedList, ChartEmptyState, ChartSkeleton } from "./PerformanceCharts";

type DatePreset = "today" | "last_7_days" | "month" | "custom";
type AnalyticsTab = "overview" | "sales" | "menu" | "kitchen";
export type PerformanceInitialState = {
  period: DatePreset;
  tab: AnalyticsTab;
  start?: string;
  end?: string;
};

const presetsList: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];
const tabs: { value: AnalyticsTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "sales", label: "Sales" },
  { value: "menu", label: "Menu" },
  { value: "kitchen", label: "Kitchen" },
];
const card = "rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_rgba(24,24,27,0.035)]";

function numberMetric(metrics: Record<string, string | number>, key: string) {
  const value = Number(metrics[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function MetricCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  trend: number[];
}) {
  const max = Math.max(...trend, 1);
  return (
    <article className={`${card} group p-5 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-lg text-orange-700" aria-hidden>{icon}</span>
        {trend.length > 1 && (
          <svg viewBox="0 0 70 28" className="h-8 w-20" aria-hidden>
            <polyline
              points={trend.map((point, index) => `${(index / (trend.length - 1)) * 68 + 1},${27 - (point / max) * 24}`).join(" ")}
              fill="none"
              stroke="#fb923c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-zinc-950">{value}</p>
      <p className="mt-3 text-xs font-semibold text-zinc-400" title="The current API does not return the previous equivalent period.">
        No comparison available
      </p>
    </article>
  );
}

function OperationalStrip({ metrics }: { metrics: Record<string, string | number> }) {
  const values = [
    ["Unpaid bills", String(numberMetric(metrics, "unpaid_bills")), "Bills currently in draft or issued state."],
    ["Cancelled orders", "Not tracked", "The current endpoint returns a placeholder rather than a calculated cancellation count."],
    ["Rejected orders", String(numberMetric(metrics, "rejected_orders")), "Orders rejected during the selected period."],
    ["Failed actions", "Not tracked", "The current endpoint returns a placeholder rather than a calculated failure count."],
    ["Average session", formatDurationMinutes(numberMetric(metrics, "average_session_duration_minutes")), "Average duration of closed dining sessions."],
    ["Table active time", formatDurationMinutes(numberMetric(metrics, "active_table_time_minutes")), "Combined duration of closed table sessions."],
  ];
  return (
    <section aria-labelledby="operational-summary" className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="operational-summary" className="text-base font-extrabold text-zinc-900">Operational summary</h2>
          <p className="mt-1 text-xs text-zinc-500">Service health for the selected period</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-bold text-zinc-500">Live data</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        {values.map(([label, value, help], index) => (
          <div key={label} className={`px-3 first:pl-0 ${index > 0 ? "border-l border-zinc-100" : ""}`} title={help}>
            <div className="text-[11px] font-semibold text-zinc-500">{label}</div>
            <div className="mt-1 text-xl font-black text-zinc-900">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Insights({ data }: { data: PerformanceSummary }) {
  const insights = useMemo(() => {
    const result: string[] = [];
    if (data.orders_by_hour.length) {
      const peak = data.orders_by_hour.reduce((best, row) => row.orders > best.orders ? row : best);
      const start = new Date(2020, 0, 1, peak.hour).toLocaleTimeString("en-IN", { hour: "numeric" });
      const end = new Date(2020, 0, 1, (peak.hour + 1) % 24).toLocaleTimeString("en-IN", { hour: "numeric" });
      result.push(`${start}–${end} was the busiest hour with ${peak.orders} orders.`);
    }
    if (data.category_performance.length) {
      const best = [...data.category_performance].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];
      result.push(`${best.category_name} generated the highest category revenue at ${formatCurrency(best.revenue)}.`);
    }
    if (data.top_selling_items.length) {
      const best = [...data.top_selling_items].sort((a, b) => b.quantity - a.quantity)[0];
      result.push(`${best.item_name} was the most ordered item with ${best.quantity} sold.`);
    }
    return result.slice(0, 3);
  }, [data]);
  if (!insights.length) return null;
  return (
    <section aria-labelledby="performance-insights" className={`${card} overflow-hidden p-5`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700" aria-hidden>✦</span>
        <div>
          <h2 id="performance-insights" className="font-extrabold text-zinc-900">Performance insights</h2>
          <p className="text-xs text-zinc-500">Deterministic highlights from this report</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {insights.map((insight, index) => (
          <div key={insight} className="rounded-xl bg-orange-50/70 p-4 text-sm font-semibold leading-6 text-zinc-700">
            <span className="mr-2 font-black text-orange-600">0{index + 1}</span>{insight}
          </div>
        ))}
      </div>
    </section>
  );
}

function StaffActivity({ data }: { data: PerformanceSummary["staff_activity"] }) {
  return (
    <section aria-labelledby="staff-activity" className={`${card} overflow-hidden`}>
      <div className="border-b border-zinc-100 p-5">
        <h2 id="staff-activity" className="font-extrabold text-zinc-900">Staff activity</h2>
        <p className="mt-1 text-xs text-zinc-500">Operational actions only; this is not a staff ranking.</p>
      </div>
      {!data.length ? <div className="p-8 text-center text-sm font-semibold text-zinc-500">No staff activity recorded.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-5 py-3">Staff member</th><th className="px-5 py-3 text-right">Orders accepted</th><th className="px-5 py-3 text-right">Orders served</th><th className="px-5 py-3 text-right">Status changes</th></tr>
            </thead>
            <tbody>
              {data.map((staff) => (
                <tr key={staff.staff_name} className="border-t border-zinc-100 hover:bg-zinc-50/70">
                  <td className="px-5 py-4"><span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-700">{staff.staff_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="font-bold text-zinc-800">{staff.staff_name}</span></td>
                  <td className="px-5 py-4 text-right font-semibold text-zinc-600">{staff.accepted}</td>
                  <td className="px-5 py-4 text-right font-semibold text-zinc-600">{staff.served}</td>
                  <td className="px-5 py-4 text-right font-semibold text-zinc-600">{staff.status_changes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function PerformanceClient({ initialState }: { initialState: PerformanceInitialState }) {
  const [filters, setFilters] = useState<HistoryFilters>({
    preset: initialState.period,
    start_date: initialState.start,
    end_date: initialState.end,
  });
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialState.tab);
  const [pdfLoading, setPdfLoading] = useState<"daily" | "monthly" | "range" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters);
  const queryFn = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return fetchHistory<PerformanceSummary>("performance", filters, controller.signal);
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, isLoading, isRefreshing, refetch } = useCachedQuery<PerformanceSummary>(
    queryKeys.analytics("performance", filters),
    queryFn,
    { staleTime: 30_000 },
  );

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    params.set("period", filters.preset || "today");
    if (filters.start_date) params.set("start", filters.start_date);
    else params.delete("start");
    if (filters.end_date) params.set("end", filters.end_date);
    else params.delete("end");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [activeTab, filters]);
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportContainerRef.current && !exportContainerRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setExportOpen(false); };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useRealtime({
    target: { kind: "staff", channel: "admin" },
    onEvent: () => void refetch().catch(() => undefined),
    onReconnect: () => void refetch().catch(() => undefined),
  });

  const handlePdfDownload = async (kind: "daily" | "monthly" | "range") => {
    if (pdfLoading) return;
    setPdfLoading(kind);
    setPdfError(null);
    const pdfFilters = kind === "daily" ? { preset: "today" as const } : kind === "monthly" ? { preset: "month" as const } : { ...filters };
    try { await downloadHistoryPdf("performance", pdfFilters); }
    catch (reason) { setPdfError(reason instanceof Error ? reason.message : "Could not download PDF report."); }
    finally { setPdfLoading(null); }
  };
  const downloadSelectedPdf = async (kind: "daily" | "monthly" | "range") => {
    if (kind === "daily") await handlePdfDownload("daily");
    else if (kind === "monthly") await handlePdfDownload("monthly");
    else await handlePdfDownload("range");
  };
  const setPreset = (preset: DatePreset) => setFilters((current) => ({ ...current, preset, page: 1 }));
  const handlePresetKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + presetsList.length) % presetsList.length;
    setPreset(presetsList[next].value);
    document.getElementById(`preset-btn-${presetsList[next].value}`)?.focus();
  };

  const metrics = data?.metrics ?? {};
  const hasData = Boolean(data && (numberMetric(metrics, "total_orders") > 0 || numberMetric(metrics, "total_bills") > 0));
  const revenueTrend = data?.revenue_by_day.map((row) => Number(row.revenue)) ?? [];
  const ordersTrend = data?.orders_by_day.map((row) => row.orders) ?? [];
  const categories = data?.category_performance.map((row) => ({ label: row.category_name, quantity: row.quantity, revenue: Number(row.revenue) })) ?? [];
  const topItems = data?.top_selling_items.map((row) => ({ label: row.item_name, quantity: row.quantity, revenue: Number(row.revenue) })) ?? [];
  const lowItems = data?.lowest_selling_items.map((row) => ({ label: row.item_name, quantity: row.quantity, revenue: Number(row.revenue) })) ?? [];
  const tableRows = data?.table_usage.map((row) => ({ label: `Table ${row.table_number}`, quantity: row.sessions, revenue: Number(row.revenue) })) ?? [];

  return (
    <div className="min-w-0 space-y-6 pb-10 text-zinc-950">
      <header className="rounded-2xl border border-zinc-200 bg-white/95 p-5 shadow-sm backdrop-blur md:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-600"><span className="h-2 w-2 rounded-full bg-orange-500" />Restaurant analytics</div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-950">Performance</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-500">Revenue, demand, menu mix, and operating activity for this restaurant.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-1" role="tablist" aria-label="Filter report period">
              {presetsList.map((preset, index) => (
                <button
                  key={preset.value}
                  id={`preset-btn-${preset.value}`}
                  role="tab"
                  aria-selected={filters.preset === preset.value}
                  tabIndex={filters.preset === preset.value ? 0 : -1}
                  onClick={() => setPreset(preset.value)}
                  onKeyDown={(event) => handlePresetKeyDown(event, index)}
                  className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold ${filters.preset === preset.value ? "bg-white text-orange-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900"}`}
                >
                  {preset.value === "custom" && <span aria-hidden className="mr-1.5">▣</span>}{preset.label}
                </button>
              ))}
            </div>
            <div className="relative" ref={exportContainerRef}>
              <button id="export-menu-trigger" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-zinc-950 px-4 text-xs font-black text-white shadow-sm hover:bg-zinc-800">
                <span aria-hidden className="mr-2">⇩</span>Export<span aria-hidden className="ml-2 text-[9px]">▼</span>
              </button>
              {exportOpen && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
                  <button role="menuitem" onClick={() => { exportHistory("performance", filters); setExportOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-zinc-700 hover:bg-zinc-50">Export CSV</button>
                  {(["daily", "monthly", "range"] as const).map((kind) => (
                    <button key={kind} role="menuitem" disabled={Boolean(pdfLoading)} onClick={async () => { setExportOpen(false); await downloadSelectedPdf(kind); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                      {pdfLoading === kind ? "Generating…" : `Export ${kind === "range" ? "Active Range" : kind[0].toUpperCase() + kind.slice(1)} PDF`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {filters.preset === "custom" && (
          <div className="mt-5 flex flex-wrap gap-3 border-t border-zinc-100 pt-5">
            <label className="text-xs font-bold text-zinc-600">Start date<input aria-label="Custom range start date" type="date" value={filters.start_date || ""} onChange={(event) => setFilters((current) => ({ ...current, start_date: event.target.value, page: 1 }))} className="ml-2 rounded-xl border border-zinc-200 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-zinc-600">End date<input aria-label="Custom range end date" type="date" value={filters.end_date || ""} onChange={(event) => setFilters((current) => ({ ...current, end_date: event.target.value, page: 1 }))} className="ml-2 rounded-xl border border-zinc-200 px-3 text-sm" /></label>
          </div>
        )}
      </header>

      <nav className="flex overflow-x-auto border-b border-zinc-200" aria-label="Performance sections">
        {tabs.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)} aria-current={activeTab === tab.value ? "page" : undefined} className={`relative min-h-12 shrink-0 px-5 text-sm font-bold ${activeTab === tab.value ? "text-orange-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-orange-500" : "text-zinc-500 hover:text-zinc-900"}`}>{tab.label}</button>
        ))}
      </nav>

      {(error && error.name !== "AbortError") && <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><span>{error.message}</span><button onClick={() => void refetch().catch(() => undefined)} className="rounded-lg px-3 text-xs font-black">Retry</button></div>}
      {pdfError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{pdfError}</div>}
      {isRefreshing && data && <div className="sr-only" aria-live="polite">Refreshing performance data</div>}

      {isLoading && !data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className={`${card} h-44 p-5`}><div className="omlu-skeleton h-10 w-10 rounded-xl" /><div className="omlu-skeleton mt-5 h-3 w-28 rounded" /><div className="omlu-skeleton mt-3 h-8 w-36 rounded" /></div>)}</div>
          <div className="grid gap-5 xl:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>
        </>
      ) : data ? (
        <>
          {(activeTab === "overview" || activeTab === "sales") && (
            <section aria-label="Primary Performance Metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon="₹" label="Total revenue" value={formatCurrency(metrics.total_revenue)} trend={revenueTrend} />
              <MetricCard icon="▤" label="Total orders" value={String(numberMetric(metrics, "total_orders"))} trend={ordersTrend} />
              <MetricCard icon="↗" label="Average order value" value={formatAverageOrderValue(metrics.average_order_value)} trend={[]} />
              <MetricCard icon="✓" label="Paid bills" value={String(numberMetric(metrics, "paid_bills"))} trend={[]} />
            </section>
          )}

          {activeTab === "overview" && (
            <>
              <OperationalStrip metrics={metrics} />
              <Insights data={data} />
              {!hasData ? <ChartEmptyState message="No performance metrics were recorded for this period." /> : (
                <section aria-label="Sales and Orders Trends" className="grid gap-5 xl:grid-cols-2">
                  <TrendChart title="Revenue trend" isCurrency data={data.revenue_by_day.map((row) => ({ label: dateLabel(row.date), value: Number(row.revenue) }))} explanation="Paid bill and completed quick-sale revenue, grouped by local day." accessibleSummary={`Revenue trend. Maximum daily revenue is ${formatCurrency(Math.max(...revenueTrend, 0))}.`} />
                  <TrendChart title="Orders trend" data={data.orders_by_day.map((row) => ({ label: dateLabel(row.date), value: row.orders }))} explanation="Created orders and completed quick sales, grouped by local day." accessibleSummary={`Orders trend. Maximum daily order count is ${Math.max(...ordersTrend, 0)}.`} />
                </section>
              )}
              <div className="grid gap-5 xl:grid-cols-2">
                <RankedList title="Table usage" rows={tableRows} />
                <RankedList title="Category performance" rows={categories} />
              </div>
              <StaffActivity data={data.staff_activity} />
            </>
          )}

          {activeTab === "sales" && (
            <>
              <section className="grid gap-5 xl:grid-cols-2">
                <TrendChart title="Revenue trend" isCurrency data={data.revenue_by_day.map((row) => ({ label: dateLabel(row.date), value: Number(row.revenue) }))} explanation="Paid bill and completed quick-sale revenue, grouped by local day." accessibleSummary={`Revenue trend for the selected period. Maximum is ${formatCurrency(Math.max(...revenueTrend, 0))}.`} />
                <TrendChart title="Orders trend" data={data.orders_by_day.map((row) => ({ label: dateLabel(row.date), value: row.orders }))} explanation="Compare order volume with revenue movement." accessibleSummary={`Order trend for the selected period. Maximum is ${Math.max(...ordersTrend, 0)} orders.`} />
              </section>
              <HourBarChart title="Orders by hour" data={data.orders_by_hour} multiDay={filters.preset !== "today"} accessibleSummary={`Orders grouped by restaurant-local hour. Maximum hourly count is ${Math.max(...data.orders_by_hour.map((row) => row.orders), 0)}.`} />
            </>
          )}

          {activeTab === "menu" && (
            <>
              <div className="grid gap-5 xl:grid-cols-2"><RankedList title="Category performance" rows={categories} /><RankedList title="Top-selling items" rows={topItems} /></div>
              <RankedList title="Lowest-selling items" rows={lowItems} lowPerformance />
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-800">Lowest-selling items include only items present in orders during this period. The current analytics response does not expose availability duration or item creation dates, so availability and “new item” labels are intentionally not inferred.</p>
            </>
          )}

          {activeTab === "kitchen" && (
            <section className={`${card} p-8 md:p-12`}>
              <div className="mx-auto max-w-2xl text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-xl text-amber-700" aria-hidden>◷</span>
                <h2 className="mt-5 text-xl font-black text-zinc-900">Kitchen timing analytics are not available yet</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">The existing performance API does not return accepted, ready, or preparation-duration aggregates. OMLU will not infer preparation speed from incomplete timestamps. Existing order and realtime behavior remains unchanged.</p>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
