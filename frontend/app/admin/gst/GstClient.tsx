"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { displayCustomerTaxType, displayStatus } from "@/lib/presentation";

export type PeriodPreset = "today" | "this_month" | "last_month" | "quarter" | "financial_year" | "custom";
export type TabKey =
  | "overview"
  | "sales_register"
  | "gst_summary"
  | "hsn_summary"
  | "b2b_register"
  | "b2c_register"
  | "documents_issued"
  | "cancelled_documents"
  | "data_health";

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
  { value: "sales_register", label: "Sales Register" },
  { value: "gst_summary", label: "GST Summary" },
  { value: "hsn_summary", label: "HSN/SAC Summary" },
  { value: "b2b_register", label: "B2B Register" },
  { value: "b2c_register", label: "B2C Register" },
  { value: "documents_issued", label: "Documents Issued" },
  { value: "cancelled_documents", label: "Cancelled Documents" },
  { value: "data_health", label: "Data Health" },
];

const cardStyle =
  "rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_rgba(24,24,27,0.035)]";

function fmtCurrency(amountStr: unknown): string {
  if (amountStr === null || amountStr === undefined) return "N/A";
  const str = String(amountStr);
  const num = parseFloat(str);
  if (isNaN(num)) return "N/A";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
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

interface TabDataResponse {
  gst_enabled?: boolean;
  records?: Array<Record<string, unknown>>;
  audit?: Record<string, unknown>;
  tax_allocation_notice?: string;
  [key: string]: unknown;
}

  // Tab specific data state
  const [tabData, setTabData] = useState<TabDataResponse | null>(null);
  const [tabLoading, setTabLoading] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);

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

  const fetchTabData = useCallback(async () => {
    if (activeTab === "overview") return;
    setTabLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("preset", preset);
      params.set("page", page.toString());
      if (preset === "custom") {
        if (startDate) params.set("start_date", startDate);
        if (endDate) params.set("end_date", endDate);
      }

      let endpoint = `/api/admin/gst/${activeTab.replace("_", "-")}`;
      if (activeTab === "sales_register") endpoint = `/api/admin/gst/sales-register`;
      if (activeTab === "gst_summary") endpoint = `/api/admin/gst/rate-summary`;
      if (activeTab === "hsn_summary") endpoint = `/api/admin/gst/hsn-summary`;
      if (activeTab === "b2b_register") endpoint = `/api/admin/gst/b2b-register`;
      if (activeTab === "b2c_register") endpoint = `/api/admin/gst/b2c-register`;
      if (activeTab === "documents_issued") endpoint = `/api/admin/gst/documents-issued`;
      if (activeTab === "cancelled_documents") endpoint = `/api/admin/gst/cancelled-documents`;
      if (activeTab === "data_health") endpoint = `/api/admin/gst/data-health`;

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setTabData(json);
      }
    } catch {
      // Ignore tab fetch error
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, preset, startDate, endDate, page]);

  useEffect(() => {
    const run = async () => {
      await fetchSummary();
    };
    void run();
  }, [fetchSummary]);

  useEffect(() => {
    const run = async () => {
      await fetchTabData();
    };
    void run();
  }, [fetchTabData]);

  const isGstEnabled = data?.gst_enabled ?? false;

  const handleDownloadExport = (type: string, format: string = "xlsx") => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    params.set("format", format);
    if (preset === "custom") {
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
    }
    window.open(`/api/admin/gst/export/${type}?${params.toString()}`, "_blank");
  };

  const handleDownloadCaPackage = () => {
    const params = new URLSearchParams();
    params.set("preset", preset);
    if (preset === "custom") {
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
    }
    window.open(`/api/admin/gst/export/ca-package?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[var(--omlu-text-primary)]">
              GST Center
            </h1>
            {isGstEnabled ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                GST Active
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/20">
                Non-GST Mode
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
            {isGstEnabled
              ? `${data?.legal_business_name || "GST Restaurant"} • GSTIN: ${data?.gstin || "N/A"}`
              : "Tax reporting workspace & historical document audit"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCaPackage}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-all flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download CA Package
          </button>
          <button
            onClick={() => {
              fetchSummary();
              fetchTabData();
            }}
            className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2 text-xs font-bold text-[var(--omlu-text-primary)] shadow-sm hover:bg-[var(--omlu-hover-surface)] transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Non-GST Banner */}
      {!loading && !isGstEnabled && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-900 dark:text-amber-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold">GST is not enabled for this restaurant</h3>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Standard non-GST sales metrics are displayed below. Tax fields show N/A. You can enable GST anytime in Settings.
              </p>
            </div>
            <Link
              href="/admin/settings"
              className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-all shrink-0"
            >
              Manage GST Settings →
            </Link>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className={cardStyle}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {presetsList.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  preset === p.value
                    ? "bg-[var(--omlu-text-primary)] text-[var(--omlu-primary-surface)] shadow-sm"
                    : "bg-[var(--omlu-secondary-surface)] text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex items-center gap-2 pt-2 md:pt-0">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-xs text-[var(--omlu-text-secondary)]">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 text-xs text-[var(--omlu-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
        </div>

        {data?.period && (
          <div className="mt-3 border-t border-[var(--omlu-border-subtle)] pt-3 text-[11px] font-medium text-[var(--omlu-text-secondary)]">
            Period: <span className="font-bold text-[var(--omlu-text-primary)]">{formatDate(data.period.start_date)}</span> to{" "}
            <span className="font-bold text-[var(--omlu-text-primary)]">{formatDate(data.period.end_date)}</span>
          </div>
        )}
      </div>

      {/* Tabs Header */}
      <div className="border-b border-[var(--omlu-border-strong)] overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {tabsList.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setActiveTab(t.value);
                setPage(1);
              }}
              className={`pb-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                activeTab === t.value
                  ? "border-[var(--omlu-text-primary)] text-[var(--omlu-text-primary)]"
                  : "border-transparent text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-xs font-medium text-[var(--omlu-text-secondary)]">Loading GST data...</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Gross Sales</p>
                  <p className="mt-2 text-2xl font-black text-[var(--omlu-text-primary)]">
                    {fmtCurrency(data.summary.gross_sales)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Pre-discount subtotal</p>
                </div>

                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Discounts</p>
                  <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
                    {fmtCurrency(data.summary.discount_amount)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Stored document discounts</p>
                </div>

                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Taxable Sales</p>
                  <p className="mt-2 text-2xl font-black text-[var(--omlu-text-primary)]">
                    {isGstEnabled ? fmtCurrency(data.summary.taxable_sales) : "N/A"}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">
                    {isGstEnabled ? "Tax-assessable base" : "GST disabled"}
                  </p>
                </div>

                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Total GST Collected</p>
                  <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {isGstEnabled ? fmtCurrency(data.summary.total_gst) : "₹0.00"}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">
                    {isGstEnabled ? "CGST + SGST + IGST" : "GST disabled"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Net / Grand Sales</p>
                  <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">
                    {fmtCurrency(data.summary.net_sales)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Authoritative final totals</p>
                </div>

                <div className={cardStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Sales Documents</p>
                  <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">
                    {data.summary.document_count}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Issued Bills + Completed Sales</p>
                </div>

                {isGstEnabled ? (
                  <>
                    <div className={cardStyle}>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">B2B Invoices</p>
                      <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">{data.summary.b2b_count}</p>
                      <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">With Customer GSTIN</p>
                    </div>

                    <div className={cardStyle}>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">B2C Invoices</p>
                      <p className="mt-2 text-xl font-bold text-[var(--omlu-text-primary)]">{data.summary.b2c_count}</p>
                      <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Consumer Invoices</p>
                    </div>
                  </>
                ) : (
                  <div className={`${cardStyle} sm:col-span-2`}>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--omlu-text-secondary)]">Cancelled Documents</p>
                    <p className="mt-2 text-xl font-bold text-red-600 dark:text-red-400">{data.summary.cancelled_count}</p>
                    <p className="mt-1 text-[11px] text-[var(--omlu-text-secondary)]">Excluded from sales totals</p>
                  </div>
                )}
              </div>

              {isGstEnabled && (
                <div className={cardStyle}>
                  <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">Tax Component Breakdown</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-[var(--omlu-border-subtle)] bg-[var(--omlu-secondary-surface)] p-4">
                      <p className="text-xs font-medium text-[var(--omlu-text-secondary)]">CGST (Central Tax)</p>
                      <p className="mt-1 text-lg font-bold text-[var(--omlu-text-primary)]">{fmtCurrency(data.summary.cgst_amount)}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--omlu-border-subtle)] bg-[var(--omlu-secondary-surface)] p-4">
                      <p className="text-xs font-medium text-[var(--omlu-text-secondary)]">SGST (State Tax)</p>
                      <p className="mt-1 text-lg font-bold text-[var(--omlu-text-primary)]">{fmtCurrency(data.summary.sgst_amount)}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--omlu-border-subtle)] bg-[var(--omlu-secondary-surface)] p-4">
                      <p className="text-xs font-medium text-[var(--omlu-text-secondary)]">IGST (Integrated Tax)</p>
                      <p className="mt-1 text-lg font-bold text-[var(--omlu-text-primary)]">{fmtCurrency(data.summary.igst_amount)}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: SALES REGISTER */}
          {activeTab === "sales_register" && (
            <div className={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--omlu-text-primary)]">Sales Register</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadExport("sales-register", "xlsx")}
                    className="rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-secondary-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-surface)] transition-all"
                  >
                    Export XLSX
                  </button>
                  <button
                    onClick={() => handleDownloadExport("sales-register", "csv")}
                    className="rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-secondary-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-hover-surface)] transition-all"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading sales register...</p>
              ) : tabData?.records ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Doc #</th>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Tax Type</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-right">Taxable</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                      {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                        <tr key={String(r.id || idx)} className="hover:bg-[var(--omlu-hover-surface)]">
                          <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(typeof r.invoice_date === "string" ? r.invoice_date.split("T")[0] : "")}</td>
                          <td className="py-2.5 px-3 font-medium">{String(r.document_number ?? "")}</td>
                          <td className="py-2.5 px-3 font-medium text-emerald-600 dark:text-emerald-400">{String(r.invoice_number || "—")}</td>
                          <td className="py-2.5 px-3 capitalize">{String(r.document_type ?? "")}</td>
                          <td className="py-2.5 px-3 font-bold text-[10px]">{displayCustomerTaxType(r.customer_tax_type)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.subtotal)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.cgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.sgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold">{fmtCurrency(r.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 3: GST SUMMARY */}
          {activeTab === "gst_summary" && (
            <div className={cardStyle}>
              <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">GST Rate Breakdown Summary</h3>
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading rate summary...</p>
              ) : tabData?.records ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                        <th className="py-2 px-3">GST Rate</th>
                        <th className="py-2 px-3">Tax Type</th>
                        <th className="py-2 px-3 text-right">Taxable Sales</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">IGST</th>
                        <th className="py-2 px-3 text-right">Total GST</th>
                        <th className="py-2 px-3 text-right">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                      {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                        <tr key={idx} className="hover:bg-[var(--omlu-hover-surface)]">
                          <td className="py-2.5 px-3 font-bold">{String(r.gst_rate)}%</td>
                          <td className="py-2.5 px-3 font-semibold">{displayCustomerTaxType(r.customer_tax_type)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.cgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.sgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.igst_amount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(r.total_gst)}</td>
                          <td className="py-2.5 px-3 text-right font-medium">{String(r.document_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 4: HSN/SAC SUMMARY */}
          {activeTab === "hsn_summary" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-900 dark:text-blue-200">
                <p className="font-bold">HSN/SAC Quantity & Usage Breakdown</p>
                <p className="mt-1">
                  Line-level tax allocation is omitted because document-level discounts are applied at document header level in OMLU Phase 1/3 without a line-discount allocation rule.
                </p>
              </div>

              <div className={cardStyle}>
                <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">HSN/SAC Quantity Summary</h3>
                {tabLoading ? (
                  <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading HSN summary...</p>
                ) : tabData?.records ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                          <th className="py-2 px-3">HSN / SAC Code</th>
                          <th className="py-2 px-3">Item Description</th>
                          <th className="py-2 px-3 text-right">Total Qty</th>
                          <th className="py-2 px-3 text-right">Line Items</th>
                          <th className="py-2 px-3">GST Rates</th>
                          <th className="py-2 px-3 text-right">Taxable Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                        {tabData.records.map((r: Record<string, unknown>, idx: number) => {
                          const rates = Array.isArray(r.gst_rates_used) ? r.gst_rates_used.join("%, ") : "";
                          return (
                            <tr key={idx} className="hover:bg-[var(--omlu-hover-surface)]">
                              <td className="py-2.5 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">{String(r.hsn_sac_code ?? "")}</td>
                              <td className="py-2.5 px-3">{String(r.description ?? "")}</td>
                              <td className="py-2.5 px-3 text-right font-bold">{String(r.total_quantity ?? 0)}</td>
                              <td className="py-2.5 px-3 text-right">{String(r.line_count ?? 0)}</td>
                              <td className="py-2.5 px-3">{rates ? `${rates}%` : "—"}</td>
                              <td className="py-2.5 px-3 text-right text-[var(--omlu-text-secondary)] italic">Unallocated</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 5: B2B REGISTER */}
          {activeTab === "b2b_register" && (
            <div className={cardStyle}>
              <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">B2B Tax Invoices</h3>
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading B2B register...</p>
              ) : tabData?.records ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Customer GSTIN</th>
                        <th className="py-2 px-3">Customer Name</th>
                        <th className="py-2 px-3 text-right">Taxable Value</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">IGST</th>
                        <th className="py-2 px-3 text-right">Total Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                      {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                        <tr key={String(r.id || idx)} className="hover:bg-[var(--omlu-hover-surface)]">
                          <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">{String(r.invoice_number || r.document_number || "—")}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold">{String(r.customer_gstin || "N/A")}</td>
                          <td className="py-2.5 px-3 font-medium">{String(r.customer_legal_name || "B2B Customer")}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.cgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.sgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.igst_amount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold">{fmtCurrency(r.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 6: B2C REGISTER */}
          {activeTab === "b2c_register" && (
            <div className={cardStyle}>
              <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">B2C Sales Register</h3>
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading B2C register...</p>
              ) : tabData?.records ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Doc #</th>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-right">Taxable</th>
                        <th className="py-2 px-3 text-right">Tax</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                      {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                        <tr key={String(r.id || idx)} className="hover:bg-[var(--omlu-hover-surface)]">
                          <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(typeof r.invoice_date === "string" ? r.invoice_date.split("T")[0] : "")}</td>
                          <td className="py-2.5 px-3 font-medium">{String(r.document_number ?? "")}</td>
                          <td className="py-2.5 px-3 font-medium text-emerald-600 dark:text-emerald-400">{String(r.invoice_number || "—")}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.subtotal)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.tax_amount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold">{fmtCurrency(r.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 7: DOCUMENTS ISSUED */}
          {activeTab === "documents_issued" && (
            <div className="space-y-4">
              {Array.isArray((tabData?.audit as Record<string, unknown> | undefined)?.sequence_gaps) &&
              ((tabData?.audit as Record<string, unknown>).sequence_gaps as unknown[]).length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-bold">Invoice Sequence Gaps Detected (Needs Review)</p>
                  <p className="mt-1">
                    Detected {((tabData?.audit as Record<string, unknown>).sequence_gaps as unknown[]).length} missing contiguous invoice number range(s). Unexplained gaps require operational review.
                  </p>
                </div>
              )}

              <div className={cardStyle}>
                <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">Invoice Sequence Audit</h3>
                {tabLoading ? (
                  <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading audit data...</p>
                ) : tabData?.records ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                          <th className="py-2 px-3">Invoice Number</th>
                          <th className="py-2 px-3">Invoice Date</th>
                          <th className="py-2 px-3">Source Type</th>
                          <th className="py-2 px-3">Doc #</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                        {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--omlu-hover-surface)]">
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">{String(r.invoice_number ?? "")}</td>
                            <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(typeof r.invoice_date === "string" ? r.invoice_date.split("T")[0] : "")}</td>
                            <td className="py-2.5 px-3 capitalize">{String(r.document_type ?? "")}</td>
                            <td className="py-2.5 px-3 font-medium">{String(r.document_number ?? "")}</td>
                            <td className="py-2.5 px-3 font-bold text-[10px]">{displayStatus(typeof r.status === "string" ? r.status : undefined)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* TAB 8: CANCELLED DOCUMENTS */}
          {activeTab === "cancelled_documents" && (
            <div className={cardStyle}>
              <h3 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">Cancelled Bills Register</h3>
              <p className="text-xs text-[var(--omlu-text-secondary)] mb-4">
                Filtered by document creation date (<code className="font-mono">created_at</code>). The database schema persists actual bill status <code className="font-mono">cancelled</code>.
              </p>
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Loading cancelled documents...</p>
              ) : tabData?.records ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Bill #</th>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-right">Taxable</th>
                        <th className="py-2 px-3 text-right">CGST</th>
                        <th className="py-2 px-3 text-right">SGST</th>
                        <th className="py-2 px-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                      {tabData.records.map((r: Record<string, unknown>, idx: number) => (
                        <tr key={String(r.id || idx)} className="hover:bg-[var(--omlu-hover-surface)]">
                          <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(typeof r.created_at === "string" ? r.created_at.split("T")[0] : "")}</td>
                          <td className="py-2.5 px-3 font-medium text-red-600 dark:text-red-400">{String(r.document_number ?? "")}</td>
                          <td className="py-2.5 px-3 font-medium">{String(r.invoice_number || "—")}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.taxable_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.cgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right">{fmtCurrency(r.sgst_amount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-600 dark:text-red-400">{fmtCurrency(r.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 9: DATA HEALTH */}
          {activeTab === "data_health" && (
            <div className="space-y-4">
              {tabLoading ? (
                <p className="text-xs text-[var(--omlu-text-secondary)] py-6 text-center">Evaluating GST data health...</p>
              ) : tabData ? (
                <div className="space-y-4">
                  {/* Readiness Banner */}
                  <div className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-base font-extrabold text-[var(--omlu-text-primary)]">
                          GST Data Health & Reconciliation Summary
                        </h3>
                        <p className={`mt-1 text-sm font-semibold ${tabData.scan_limit_reached ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {String(
                            (tabData.summary as Record<string, unknown> | undefined)?.summary_text ||
                              "GST Data Health Audit Complete"
                          )}
                        </p>
                        {tabData.scan_limit_reached ? (
                          <div className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                            ⚠️ {String(tabData.scan_warning || "Partial evaluation: Scan limit reached. Please select a custom or narrower date range for complete audit.")}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-xs text-[var(--omlu-text-secondary)]">
                        Checked at {formatDate(String(tabData.checked_at || "").split("T")[0])}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-[var(--omlu-border-subtle)] bg-[var(--omlu-secondary-surface)] p-3">
                        <p className="text-xs text-[var(--omlu-text-secondary)]">Checked Docs</p>
                        <p className="text-lg font-bold text-[var(--omlu-text-primary)]">
                          {String((tabData.summary as Record<string, unknown> | undefined)?.total_documents_checked ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">Ready (Clean)</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {String((tabData.summary as Record<string, unknown> | undefined)?.ready_count ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="text-xs text-amber-700 dark:text-amber-400">Warnings</p>
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                          {String((tabData.summary as Record<string, unknown> | undefined)?.warning_count ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                        <p className="text-xs text-red-700 dark:text-red-400">Needs Review</p>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">
                          {String((tabData.summary as Record<string, unknown> | undefined)?.needs_review_count ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Issues Table */}
                  <div className={cardStyle}>
                    <h4 className="text-sm font-bold text-[var(--omlu-text-primary)] mb-4">Detected Review Items</h4>
                    {Array.isArray(tabData.issues) && tabData.issues.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[var(--omlu-border-strong)] text-[var(--omlu-text-secondary)]">
                              <th className="py-2 px-3">Severity</th>
                              <th className="py-2 px-3">Doc #</th>
                              <th className="py-2 px-3">Invoice #</th>
                              <th className="py-2 px-3">Type</th>
                              <th className="py-2 px-3">Date</th>
                              <th className="py-2 px-3">Plain-Language Explanation</th>
                              <th className="py-2 px-3">Suggested Review Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--omlu-border-subtle)]">
                            {(tabData.issues as Record<string, unknown>[]).map((iss, idx) => {
                              const sev = String(iss.severity || "");
                              return (
                                <tr key={idx} className="hover:bg-[var(--omlu-hover-surface)]">
                                  <td className="py-2.5 px-3 whitespace-nowrap font-bold">
                                    {sev === "needs_review" ? (
                                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/20">
                                        NEEDS REVIEW
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                        WARNING
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-medium">{String(iss.document_number ?? "")}</td>
                                  <td className="py-2.5 px-3 font-mono font-bold">{String(iss.invoice_number ?? "")}</td>
                                  <td className="py-2.5 px-3 capitalize">{String(iss.document_type ?? "")}</td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(String(iss.document_date ?? ""))}</td>
                                  <td className="py-2.5 px-3 max-w-xs">{String(iss.explanation ?? "")}</td>
                                  <td className="py-2.5 px-3 text-[var(--omlu-text-secondary)] italic max-w-xs">
                                    {String(iss.suggested_action ?? "")}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-[var(--omlu-text-secondary)]">
                        No data health issues or sequence anomalies detected for this period. All checked documents are Ready.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
