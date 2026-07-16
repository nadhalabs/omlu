"use client";

import { useEffect, useState, useRef } from "react";
import { fetchHistory, downloadHistoryPdf, exportHistory, HistoryFilters, PerformanceSummary } from "@/lib/adminHistory";
import { formatCurrency, formatAverageOrderValue, formatDurationMinutes } from "./performanceFormatters";
import { TrendChart, HourBarChart, HorizontalBarList, ChartEmptyState, ChartSkeleton } from "./PerformanceCharts";

type DatePreset = "today" | "last_7_days" | "month" | "custom";

const presetsList: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
] as const;

export default function PerformanceClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today" });
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<"daily" | "monthly" | "range" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchHistory<PerformanceSummary>("performance", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load performance data.");
        }
      });
    return () => {
      active = false;
    };
  }, [filters]);

  // Click outside and Escape key handler for export dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exportContainerRef.current && !exportContainerRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handlePdfDownload = async (kind: "daily" | "monthly" | "range") => {
    if (pdfLoading) return;
    setPdfLoading(kind);
    setPdfError(null);
    const pdfFilters: HistoryFilters =
      kind === "daily"
        ? { preset: "today" }
        : kind === "monthly"
          ? { preset: "month" }
          : { ...filters };
    try {
      await downloadHistoryPdf("performance", pdfFilters);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not download PDF report.");
    } finally {
      setPdfLoading(null);
    }
  };

  const handlePresetKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % presetsList.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + presetsList.length) % presetsList.length;
    } else {
      return;
    }
    e.preventDefault();
    const nextPreset = presetsList[nextIndex].value;
    setFilters({ ...filters, preset: nextPreset, page: 1 });
    const btn = document.getElementById(`preset-btn-${nextPreset}`);
    btn?.focus();
  };

  const hasData = data && (Number(data.metrics.total_orders) > 0 || Number(data.metrics.total_bills) > 0);

  if (!data && !error) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-zinc-800 animate-pulse" />
            <div className="h-4 w-96 rounded bg-zinc-850 animate-pulse" />
          </div>
          <div className="h-10 w-64 rounded bg-zinc-800 animate-pulse" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded border border-zinc-850 bg-zinc-900/10 p-4 animate-pulse space-y-3">
              <div className="h-3 w-20 rounded bg-zinc-800" />
              <div className="h-6 w-32 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  const m = data?.metrics || {};
  const activePreset = filters.preset || "today";

  return (
    <div className="flex flex-col gap-6 text-zinc-100">
      {/* 1. Page Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-850 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white leading-none">Performance</h1>
          <p className="mt-2 text-xs text-zinc-500">
            Restaurant-scoped revenue, order, session, and staff activity metrics.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <div
            className="flex rounded border border-zinc-800 bg-zinc-950 p-0.5"
            role="tablist"
            aria-label="Filter report period"
          >
            {presetsList.map((p, idx) => {
              const isSelected = activePreset === p.value;
              return (
                <button
                  key={p.value}
                  id={`preset-btn-${p.value}`}
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => handlePresetChange(p.value)}
                  onKeyDown={(e) => handlePresetKeyDown(e, idx)}
                  className={`px-3 py-1.5 text-xs font-bold transition-all focus:outline-hidden focus:ring-1 focus:ring-orange-500 rounded-sm ${
                    isSelected
                      ? "bg-orange-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs */}
          {activePreset === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase">
                Start
                <input
                  type="date"
                  value={filters.start_date || ""}
                  onChange={(e) => setFilters({ ...filters, start_date: e.target.value, page: 1 })}
                  className="h-9 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase">
                End
                <input
                  type="date"
                  value={filters.end_date || ""}
                  onChange={(e) => setFilters({ ...filters, end_date: e.target.value, page: 1 })}
                  className="h-9 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </label>
            </div>
          )}

          {/* Export Dropdown */}
          <div className="relative inline-block text-left" ref={exportContainerRef}>
            <button
              id="export-menu-trigger"
              onClick={() => setExportOpen(!exportOpen)}
              className="h-9 rounded border border-zinc-800 bg-zinc-950 px-4 text-xs font-black text-zinc-200 hover:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            >
              Export
              <span className="ml-2 select-none text-[8px] inline-block align-middle transition-transform duration-200">▼</span>
            </button>
            {exportOpen && (
              <div className="absolute right-0 z-50 mt-1 w-52 rounded border border-zinc-850 bg-zinc-950 shadow-xl focus:outline-hidden">
                <div className="py-1">
                  <button
                    onClick={() => {
                      exportHistory("performance", filters);
                      setExportOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-900"
                  >
                    Export CSV
                  </button>
                  <button
                    disabled={Boolean(pdfLoading)}
                    onClick={async () => {
                      setExportOpen(false);
                      await handlePdfDownload("daily");
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    {pdfLoading === "daily" ? "Generating..." : "Export Daily PDF"}
                  </button>
                  <button
                    disabled={Boolean(pdfLoading)}
                    onClick={async () => {
                      setExportOpen(false);
                      await handlePdfDownload("monthly");
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    {pdfLoading === "monthly" ? "Generating..." : "Export Monthly PDF"}
                  </button>
                  <button
                    disabled={Boolean(pdfLoading)}
                    onClick={async () => {
                      setExportOpen(false);
                      await handlePdfDownload("range");
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    {pdfLoading === "range" ? "Generating..." : "Export Active Range PDF"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Errors */}
      {error && <div className="rounded border border-red-950 bg-red-950/20 p-3 text-xs text-red-200 font-semibold">{error}</div>}
      {pdfError && <div className="rounded border border-red-950 bg-red-950/20 p-3 text-xs text-red-200 font-semibold">{pdfError}</div>}

      {data && (
        <>
          {/* 2. Overview Metrics - Primary cards */}
          <section aria-label="Primary Performance Metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-zinc-850 bg-zinc-900/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total revenue</span>
              <div className="mt-1 text-2xl font-black text-white">{formatCurrency(m.total_revenue)}</div>
            </div>
            <div className="rounded border border-zinc-850 bg-zinc-900/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total orders</span>
              <div className="mt-1 text-2xl font-black text-white">{m.total_orders || "0"}</div>
            </div>
            <div className="rounded border border-zinc-850 bg-zinc-900/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Average order value</span>
              <div className="mt-1 text-2xl font-black text-white">{formatAverageOrderValue(m.average_order_value)}</div>
            </div>
            <div className="rounded border border-zinc-850 bg-zinc-900/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Paid bills</span>
              <div className="mt-1 text-2xl font-black text-white">{m.paid_bills || "0"}</div>
            </div>
          </section>

          {/* Secondary metrics row */}
          <section aria-label="Supporting Operations Metrics" className="rounded border border-zinc-850 bg-zinc-900/10 p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Operational Summary</h4>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 text-xs">
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Unpaid bills</span>
                <span className="font-semibold text-sm text-zinc-300">{m.unpaid_bills || "0"}</span>
              </div>
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Cancelled orders</span>
                <span className="font-semibold text-sm text-zinc-300">{m.cancelled_orders || "0"}</span>
              </div>
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Rejected orders</span>
                <span className="font-semibold text-sm text-zinc-300">{m.rejected_orders || "0"}</span>
              </div>
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Failures</span>
                <span className="font-semibold text-sm text-zinc-300">{m.payment_failures || "0"}</span>
              </div>
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Avg Session</span>
                <span className="font-semibold text-sm text-zinc-300">
                  {formatDurationMinutes(m.average_session_duration_minutes as number)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-zinc-500 font-bold uppercase">Table active time</span>
                <span className="font-semibold text-sm text-zinc-300">
                  {formatDurationMinutes(m.active_table_time_minutes as number)}
                </span>
              </div>
            </div>
          </section>

          {!hasData ? (
            <ChartEmptyState message="No performance metrics recorded for this period." />
          ) : (
            <>
              {/* 3. Sales trends charts */}
              <section aria-label="Sales and Orders Trends" className="grid gap-4 xl:grid-cols-2">
                <TrendChart
                  title="Revenue trend"
                  isCurrency={true}
                  data={data.revenue_by_day.map((r) => ({ label: r.date, value: parseFloat(r.revenue) }))}
                  accessibleSummary={`Line chart representing daily revenue trends for the period. Maximum revenue reached is ${formatCurrency(Math.max(...data.revenue_by_day.map(r => parseFloat(r.revenue)), 0))}.`}
                />
                <TrendChart
                  title="Orders trend"
                  data={data.orders_by_day.map((o) => ({ label: o.date, value: o.orders }))}
                  accessibleSummary={`Line chart representing daily order counts for the period. Maximum orders in a single day is ${Math.max(...data.orders_by_day.map(r => r.orders), 0)}.`}
                />
                <HourBarChart
                  title="Orders by hour"
                  data={data.orders_by_hour}
                  accessibleSummary={`Vertical bar chart representing order counts by hour bucket (0 to 23). Max hourly load is ${Math.max(...data.orders_by_hour.map(r => r.orders), 0)}.`}
                />
                <HorizontalBarList
                  title="Category performance"
                  rows={data.category_performance.map((c) => ({ label: c.category_name, value: c.quantity, revenue: c.revenue }))}
                  formatVal={(val) => `${val} sold`}
                />
              </section>

              {/* 4. Item performance */}
              <section aria-label="Items and Category Sales" className="grid gap-4 xl:grid-cols-2">
                <HorizontalBarList
                  title="Top-selling items"
                  rows={data.top_selling_items.map((i) => ({ label: i.item_name, value: i.quantity, revenue: i.revenue }))}
                  formatVal={(val) => `${val} sold`}
                />
                <HorizontalBarList
                  title="Lowest-selling items"
                  rows={data.lowest_selling_items.map((i) => ({ label: i.item_name, value: i.quantity, revenue: i.revenue }))}
                  formatVal={(val) => `${val} sold`}
                />
              </section>

              {/* 5. Operations & Table usage */}
              <section aria-label="Operations and Table usage">
                <HorizontalBarList
                  title="Table usage"
                  rows={data.table_usage.map((t) => ({ label: `Table ${t.table_number}`, value: t.sessions, revenue: t.revenue }))}
                  formatVal={(val) => `${val} sessions`}
                />
              </section>

              {/* 6. Staff activity */}
              <section aria-label="Staff Activity" className="flex flex-col gap-3">
                <h3 className="text-sm font-black text-white">Staff activity</h3>
                {data.staff_activity.length === 0 ? (
                  <ChartEmptyState message="No staff activity recorded." />
                ) : (
                  <>
                    {/* Desktop layout */}
                    <div className="hidden md:block overflow-x-auto rounded border border-zinc-850 bg-zinc-900/10">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 font-bold uppercase select-none">
                            <th className="p-3">Staff member</th>
                            <th className="p-3 text-right">Orders accepted</th>
                            <th className="p-3 text-right">Orders served</th>
                            <th className="p-3 text-right">Status changes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.staff_activity.map((staff, idx) => (
                            <tr key={idx} className="border-b border-zinc-800/40 hover:bg-zinc-900/20">
                              <td className="p-3 font-bold text-zinc-300">{staff.staff_name}</td>
                              <td className="p-3 text-right text-zinc-400">{staff.accepted}</td>
                              <td className="p-3 text-right text-zinc-400">{staff.served}</td>
                              <td className="p-3 text-right text-zinc-400">{staff.status_changes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile layout */}
                    <div className="grid gap-3 md:hidden">
                      {data.staff_activity.map((staff, idx) => (
                        <div key={idx} className="rounded border border-zinc-805 bg-zinc-900/20 p-3 text-xs space-y-2">
                          <div className="font-bold text-zinc-300 text-sm">{staff.staff_name}</div>
                          <div className="grid grid-cols-3 gap-2 text-zinc-400">
                            <div>
                              <span className="block text-[9px] text-zinc-500 font-bold uppercase">Accepted</span>
                              <span className="font-black text-sm">{staff.accepted}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-zinc-500 font-bold uppercase">Served</span>
                              <span className="font-black text-sm">{staff.served}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-zinc-500 font-bold uppercase">Changes</span>
                              <span className="font-black text-sm">{staff.status_changes}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );

  function handlePresetChange(preset: DatePreset) {
    setFilters({ ...filters, preset, page: 1 });
  }
}
