"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export type PeriodPreset = "today" | "this_month" | "last_month" | "quarter" | "financial_year" | "custom";
export type TabKey = "overview" | "sales_register" | "gst_summary" | "hsn_summary" | "b2b_b2c";

export type GstSummaryResponse = {
  gst_enabled: boolean;
  gstin: string | null;
  legal_business_name: string | null;
  gst_state_name: string | null;
  gst_state_code: string | null;
  period: {
    preset: string;
    start_date: string;
    end_date: string;
  };
  summary: {
    gross_sales: string;
    discount_amount: string;
    taxable_sales: string;
    cgst_amount: string;
    sgst_amount: string;
    igst_amount: string;
    total_gst: string;
    net_sales: string;
    document_count: number;
    b2b_count: number;
    b2c_count: number;
    cancelled_count: number;
  };
};

const presetsList: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "quarter", label: "Current Quarter" },
  { value: "financial_year", label: "Financial Year" },
  { value: "custom", label: "Custom" },
];

const tabsList: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "sales_register", label: "Sales Register — Coming soon" },
  { value: "gst_summary", label: "GST Summary — Coming soon" },
  { value: "hsn_summary", label: "HSN/SAC Summary — Coming soon" },
  { value: "b2b_b2c", label: "B2B / B2C Registers — Coming soon" },
];

const cardStyle =
  "rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_rgba(24,24,27,0.035)]";

function fmtCurrency(amountStr: string | number): string {
  const num = typeof amountStr === "number" ? amountStr : parseFloat(amountStr || "0");
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

export default function GstClient() {
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GstSummaryResponse | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("preset", preset);
      if (preset === "custom") {
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);
      }
      const res = await fetch(`/api/admin/gst/summary?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to fetch GST center summary");
      }
      const json: GstSummaryResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  }, [preset, startDate, endDate]);

  useEffect(() => {
    if (preset === "custom" && (!startDate || !endDate)) return;
    void fetchSummary();
  }, [fetchSummary, preset, startDate, endDate]);

  const summary = data?.summary;
  const isGstEnabled = data?.gst_enabled ?? false;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[var(--omlu-text-primary)]">
              GST Center
            </h1>
            {data && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isGstEnabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                }`}
              >
                {isGstEnabled ? "GST Enabled" : "GST Disabled"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">
            Authoritative sales and tax reporting for compliance and financial oversight.
          </p>
        </div>

        {/* Restaurant GST Meta Info */}
        {isGstEnabled && data?.gstin && (
          <div className="flex flex-wrap items-center gap-3 text-xs bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-xl px-3.5 py-2">
            <div>
              <span className="text-[var(--omlu-text-secondary)]">GSTIN:</span>{" "}
              <span className="font-mono font-bold text-[var(--omlu-text-primary)]">{data.gstin}</span>
            </div>
            {data.gst_state_name && (
              <div>
                <span className="text-[var(--omlu-text-secondary)]">State:</span>{" "}
                <span className="font-bold text-[var(--omlu-text-primary)]">
                  {data.gst_state_name} ({data.gst_state_code})
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GST Disabled Alert Banner */}
      {!loading && data && !isGstEnabled && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <div className="space-y-0.5">
            <p className="font-bold text-sm">GST is not enabled for this restaurant.</p>
            <p className="text-xs opacity-90">
              Standard sales figures are displayed below. To enable GST, configure your GSTIN, tax mode, and default tax rate in Settings.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
          >
            Manage GST Settings →
          </Link>
        </div>
      )}

      {/* Period Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {presetsList.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                preset === p.value
                  ? "bg-orange-600 text-white shadow-sm"
                  : "text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-page-background)] hover:text-[var(--omlu-text-primary)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--omlu-border)]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] px-2.5 py-1 text-xs text-[var(--omlu-text-primary)] focus:outline-none"
            />
            <span className="text-xs text-[var(--omlu-text-secondary)]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-page-background)] px-2.5 py-1 text-xs text-[var(--omlu-text-primary)] focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Date Bounds Indicator */}
      {data && (
        <p className="text-xs text-[var(--omlu-text-secondary)] px-1">
          Period: <span className="font-semibold">{formatDate(data.period.start_date)}</span> to{" "}
          <span className="font-semibold">{formatDate(data.period.end_date)}</span>
        </p>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[var(--omlu-border)] overflow-x-auto">
        {tabsList.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-bold transition ${
              activeTab === t.value
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className={`${cardStyle} h-28 bg-[var(--omlu-border)]/20`} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
          <p className="font-bold">Error loading GST summary</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : activeTab === "overview" && summary ? (
        <div className="space-y-6">
          {/* Main KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Gross Sales
              </p>
              <p className="mt-2 text-2xl font-black text-[var(--omlu-text-primary)]">
                {fmtCurrency(summary.gross_sales)}
              </p>
              <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Pre-discount totals</p>
            </div>

            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Taxable Sales
              </p>
              <p className="mt-2 text-2xl font-black text-[var(--omlu-text-primary)]">
                {isGstEnabled ? fmtCurrency(summary.taxable_sales) : "N/A"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">
                {isGstEnabled ? "Tax-assessable base" : "GST disabled"}
              </p>
            </div>

            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Total GST Collected
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {isGstEnabled ? fmtCurrency(summary.total_gst) : "₹0.00"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">
                {isGstEnabled ? "CGST + SGST + IGST" : "GST disabled"}
              </p>
            </div>

            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Net / Grand Sales
              </p>
              <p className="mt-2 text-2xl font-black text-[var(--omlu-text-primary)]">
                {fmtCurrency(summary.net_sales)}
              </p>
              <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Final document total</p>
            </div>
          </div>

          {/* Secondary KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Discounts Given
              </p>
              <p className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400">
                {fmtCurrency(summary.discount_amount)}
              </p>
            </div>

            <div className={cardStyle}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                Sales Documents
              </p>
              <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">
                {summary.document_count}
              </p>
              <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Issued Bills + Completed Sales</p>
            </div>

            {isGstEnabled ? (
              <>
                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                    B2B Invoices
                  </p>
                  <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">
                    {summary.b2b_count}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">With Customer GSTIN</p>
                </div>

                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                    B2C Invoices
                  </p>
                  <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">
                    {summary.b2c_count}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Consumer Invoices</p>
                </div>
              </>
            ) : (
              <div className={`${cardStyle} sm:col-span-2`}>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                  Cancelled Documents
                </p>
                <p className="mt-2 text-xl font-bold text-red-600 dark:text-red-400">
                  {summary.cancelled_count}
                </p>
                <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Excluded from sales totals</p>
              </div>
            )}
          </div>

          {/* Tax Breakdown Detail (GST Enabled only) */}
          {isGstEnabled && (
            <div className={cardStyle}>
              <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">
                Tax Component Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-[var(--omlu-border)] p-3 bg-[var(--omlu-page-background)]">
                  <p className="text-[11px] text-[var(--omlu-text-secondary)] font-medium">CGST (Intrastate)</p>
                  <p className="text-lg font-bold text-[var(--omlu-text-primary)] mt-1">
                    {fmtCurrency(summary.cgst_amount)}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--omlu-border)] p-3 bg-[var(--omlu-page-background)]">
                  <p className="text-[11px] text-[var(--omlu-text-secondary)] font-medium">SGST (Intrastate)</p>
                  <p className="text-lg font-bold text-[var(--omlu-text-primary)] mt-1">
                    {fmtCurrency(summary.sgst_amount)}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--omlu-border)] p-3 bg-[var(--omlu-page-background)]">
                  <p className="text-[11px] text-[var(--omlu-text-secondary)] font-medium">IGST (Interstate)</p>
                  <p className="text-lg font-bold text-[var(--omlu-text-primary)] mt-1">
                    {fmtCurrency(summary.igst_amount)}
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/20 p-3 bg-red-500/5">
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">Cancelled Documents</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">
                    {summary.cancelled_count}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={cardStyle + " text-center py-12"}>
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-base font-bold text-[var(--omlu-text-primary)]">
            Phase 3 Statutory Register
          </h3>
          <p className="text-xs text-[var(--omlu-text-secondary)] mt-1 max-w-md mx-auto">
            Detailed itemized registers, statutory exports, and compliance report mappings will be available in Phase 3.
          </p>
        </div>
      )}
    </div>
  );
}
