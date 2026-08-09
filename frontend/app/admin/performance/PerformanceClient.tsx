"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHistory,
  downloadHistoryPdf,
  exportHistory,
  exportHistoryXlsx,
  HistoryFilters,
  PerformanceSummary,
} from "@/lib/adminHistory";
import { queryKeys, useCachedQuery } from "@/lib/queryCache";
import { useRealtime } from "@/lib/realtime";
import { formatCurrency, formatAverageOrderValue, formatDurationMinutes } from "./performanceFormatters";

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRangeLabel(start?: string, end?: string): string {
  const startFmt = formatDateLabel(start);
  const endFmt = formatDateLabel(end);
  if (startFmt && endFmt) return `${startFmt} → ${endFmt}`;
  if (startFmt) return `${startFmt} → Select end date`;
  if (endFmt) return `Select start date → ${endFmt}`;
  return "Select custom date range";
}
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
const card = "rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_rgba(24,24,27,0.035)]";

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
              stroke="var(--omlu-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--omlu-text-secondary)]">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)]">{value}</p>
      <p className="mt-3 text-xs font-semibold text-[var(--omlu-text-secondary)]" title="The current API does not return the previous equivalent period.">
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
          <h2 id="operational-summary" className="text-base font-extrabold text-[var(--omlu-text-primary)]">Operational summary</h2>
          <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Service health for the selected period</p>
        </div>
        <span className="rounded-full bg-[var(--omlu-muted-surface)] px-3 py-1 text-[11px] font-bold text-[var(--omlu-text-secondary)]">Live data</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        {values.map(([label, value, help], index) => (
          <div key={label} className={`px-3 first:pl-0 ${index > 0 ? "border-l border-[var(--omlu-border-strong)]" : ""}`} title={help}>
            <div className="text-[11px] font-semibold text-[var(--omlu-text-secondary)]">{label}</div>
            <div className="mt-1 text-xl font-black text-[var(--omlu-text-primary)]">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Insights({ data }: { data: PerformanceSummary }) {
  const insights = data.owner_insights;
  if (!insights.length) return null;
  return (
    <section aria-labelledby="performance-insights" className={`${card} overflow-hidden p-5`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700" aria-hidden>✦</span>
        <div>
          <h2 id="performance-insights" className="font-extrabold text-[var(--omlu-text-primary)]">Performance insights</h2>
          <p className="text-xs text-[var(--omlu-text-secondary)]">Deterministic highlights from this report</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {insights.map((insight, index) => (
          <div key={insight} className="rounded-xl bg-orange-50/70 p-4 text-sm font-semibold leading-6 text-[var(--omlu-text-primary)]">
            <span className="mr-2 font-black text-orange-600">0{index + 1}</span>{insight}
          </div>
        ))}
      </div>
    </section>
  );
}

function SalesMix({ data }: { data: PerformanceSummary["sales_mix"] }) {
  return (
    <section aria-labelledby="sales-mix" className={`${card} p-5`}>
      <h2 id="sales-mix" className="font-extrabold text-[var(--omlu-text-primary)]">Sales mix</h2>
      <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Collected revenue by sale type</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {data.map((row) => (
          <article key={row.label} className="rounded-xl bg-[var(--omlu-muted-surface)] p-4">
            <p className="text-xs font-bold text-[var(--omlu-text-secondary)]">{row.label}</p>
            <p className="mt-1 text-xl font-black text-[var(--omlu-text-primary)]">{formatCurrency(row.revenue)}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">{Number(row.contribution_percentage).toFixed(1)}% of collected revenue</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StaffActivity({ data }: { data: PerformanceSummary["staff_activity"] }) {
  return (
    <section aria-labelledby="staff-activity" className={`${card} overflow-hidden`}>
      <div className="border-b border-[var(--omlu-border-strong)] p-5">
        <h2 id="staff-activity" className="font-extrabold text-[var(--omlu-text-primary)]">Staff activity</h2>
        <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">Operational actions only; this is not a staff ranking.</p>
      </div>
      {!data.length ? <div className="p-8 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">No staff activity recorded.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-[var(--omlu-muted-surface)] text-xs uppercase tracking-wide text-[var(--omlu-text-secondary)]">
              <tr><th className="px-5 py-3">Staff member</th><th className="px-5 py-3 text-right">Orders accepted</th><th className="px-5 py-3 text-right">Orders served</th><th className="px-5 py-3 text-right">Status changes</th></tr>
            </thead>
            <tbody>
              {data.map((staff) => (
                <tr key={staff.staff_name} className="border-t border-[var(--omlu-border-strong)] hover:bg-[var(--omlu-muted-surface)]">
                  <td className="px-5 py-4"><span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-700">{staff.staff_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="font-bold text-[var(--omlu-text-primary)]">{staff.staff_name}</span></td>
                  <td className="px-5 py-4 text-right font-semibold text-[var(--omlu-text-secondary)]">{staff.accepted}</td>
                  <td className="px-5 py-4 text-right font-semibold text-[var(--omlu-text-secondary)]">{staff.served}</td>
                  <td className="px-5 py-4 text-right font-semibold text-[var(--omlu-text-secondary)]">{staff.status_changes}</td>
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
  const [customInputsOpen, setCustomInputsOpen] = useState(
    Boolean(initialState.period === "custom" && (!initialState.start || !initialState.end))
  );
  const isCustomIncomplete = filters.preset === "custom" && (!filters.start_date || !filters.end_date);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialState.tab);
  const [pdfLoading, setPdfLoading] = useState<"daily" | "monthly" | "range" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters);
  const queryFn = useCallback(async () => {
    if (isCustomIncomplete) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return fetchHistory<PerformanceSummary>("performance", filters, controller.signal);
  }, [filterKey, isCustomIncomplete]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, isLoading, isRefreshing, refetch } = useCachedQuery<PerformanceSummary | null>(
    queryKeys.analytics("performance", filters),
    queryFn,
    { staleTime: 30_000, enabled: !isCustomIncomplete },
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
  const setPreset = (preset: DatePreset) => {
    if (preset === "custom") setCustomInputsOpen(true);
    setFilters((current) => ({ ...current, preset, page: 1 }));
  };
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
    <div className="min-w-0 space-y-6 pb-10 text-[var(--omlu-text-primary)]">
      <header className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)]/95 p-5 shadow-sm backdrop-blur md:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-orange-600"><span className="h-2 w-2 rounded-full bg-orange-500" />Restaurant analytics</div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--omlu-text-primary)]">Performance</h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--omlu-text-secondary)]">Revenue, demand, menu mix, and operating activity for this restaurant.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex max-w-full overflow-x-auto rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-1" role="tablist" aria-label="Filter report period">
              {presetsList.map((preset, index) => (
                <button
                  key={preset.value}
                  id={`preset-btn-${preset.value}`}
                  role="tab"
                  aria-selected={filters.preset === preset.value}
                  tabIndex={filters.preset === preset.value ? 0 : -1}
                  onClick={() => setPreset(preset.value)}
                  onKeyDown={(event) => handlePresetKeyDown(event, index)}
                  className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold ${filters.preset === preset.value ? "bg-[var(--omlu-primary-surface)] text-orange-700 shadow-sm ring-1 ring-zinc-200" : "text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"}`}
                >
                  {preset.value === "custom" && <span aria-hidden className="mr-1.5">▣</span>}{preset.label}
                </button>
              ))}
            </div>
            <div className="relative" ref={exportContainerRef}>
              <button id="export-menu-trigger" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--omlu-primary-surface)] px-4 text-xs font-black text-[var(--omlu-text-primary)] shadow-sm hover:bg-[var(--omlu-muted-surface)]">
                <span aria-hidden className="mr-2">⇩</span>Export<span aria-hidden className="ml-2 text-[9px]">▼</span>
              </button>
              {exportOpen && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-1.5 shadow-xl">
                  <button role="menuitem" onClick={() => { exportHistory("performance", filters); setExportOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">Export CSV</button>
                  <button role="menuitem" onClick={() => { exportHistoryXlsx("performance", filters); setExportOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">Export XLSX Report</button>
                  {(["daily", "monthly", "range"] as const).map((kind) => (
                    <button key={kind} role="menuitem" disabled={Boolean(pdfLoading)} onClick={async () => { setExportOpen(false); await downloadSelectedPdf(kind); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50">
                      {pdfLoading === kind ? "Generating…" : `Export ${kind === "range" ? "Active Range" : kind[0].toUpperCase() + kind.slice(1)} PDF`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {filters.preset === "custom" && (
          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--omlu-border-strong)] pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCustomInputsOpen((open) => !open)}
                aria-expanded={customInputsOpen}
                aria-controls="custom-date-inputs"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3.5 text-xs font-bold text-[var(--omlu-text-primary)] shadow-sm transition hover:bg-[var(--omlu-muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <span aria-hidden="true">📅</span>
                <span>{formatDateRangeLabel(filters.start_date, filters.end_date)}</span>
                <span aria-hidden="true" className="ml-1 text-[9px] text-[var(--omlu-text-secondary)]">
                  {customInputsOpen ? "▲" : "▼"}
                </span>
              </button>
            </div>

            {customInputsOpen && (
              <div
                id="custom-date-inputs"
                className="flex flex-col gap-3 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] p-3.5 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <label htmlFor="custom-start-date" className="text-xs font-bold text-[var(--omlu-text-secondary)]">
                    Start date
                  </label>
                  <input
                    id="custom-start-date"
                    aria-label="Custom range start date"
                    type="date"
                    value={filters.start_date || ""}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        start_date: event.target.value,
                        page: 1,
                      }))
                    }
                    className="min-h-9 rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-xs font-bold text-[var(--omlu-text-primary)] shadow-xs transition hover:border-[var(--omlu-border-hover)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>

                <span aria-hidden="true" className="hidden text-xs font-bold text-[var(--omlu-text-secondary)] sm:inline">
                  →
                </span>

                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <label htmlFor="custom-end-date" className="text-xs font-bold text-[var(--omlu-text-secondary)]">
                    End date
                  </label>
                  <input
                    id="custom-end-date"
                    aria-label="Custom range end date"
                    type="date"
                    value={filters.end_date || ""}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        end_date: event.target.value,
                        page: 1,
                      }))
                    }
                    className="min-h-9 rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-xs font-bold text-[var(--omlu-text-primary)] shadow-xs transition hover:border-[var(--omlu-border-hover)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <nav className="flex overflow-x-auto border-b border-[var(--omlu-border-strong)]" aria-label="Performance sections">
        {tabs.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)} aria-current={activeTab === tab.value ? "page" : undefined} className={`relative min-h-12 shrink-0 px-5 text-sm font-bold ${activeTab === tab.value ? "text-orange-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-orange-500" : "text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"}`}>{tab.label}</button>
        ))}
      </nav>

      {error && error.name !== "AbortError" && !isCustomIncomplete && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span>Unable to load analytics. Try again.</span>
          <button
            type="button"
            onClick={() => void refetch().catch(() => undefined)}
            className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-black text-red-800 hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Retry
          </button>
        </div>
      )}
      {pdfError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{pdfError}</div>}
      {isRefreshing && data && <div className="sr-only" aria-live="polite">Refreshing performance data</div>}

      {isCustomIncomplete ? (
        <div className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">
          Please select both start date and end date to view custom performance metrics.
        </div>
      ) : isLoading && !data ? (
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
              <SalesMix data={data.sales_mix} />
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
              <SalesMix data={data.sales_mix} />
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
                <h2 className="mt-5 text-xl font-black text-[var(--omlu-text-primary)]">Kitchen timing analytics are not available yet</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--omlu-text-secondary)]">The existing performance API does not return accepted, ready, or preparation-duration aggregates. OMLU will not infer preparation speed from incomplete timestamps. Existing order and realtime behavior remains unchanged.</p>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
