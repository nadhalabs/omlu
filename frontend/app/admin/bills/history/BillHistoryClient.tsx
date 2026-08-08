"use client";

import { useEffect, useState } from "react";
import {
  DateFilters,
  EmptyState,
  HistorySkeleton,
  Pager,
  formatCurrencyINR,
  formatDateTime,
  formatPaymentMethod,
  formatPaymentStatus,
} from "../../historyControls";
import { BillHistoryRow, fetchHistory, HistoryFilters, PaginatedResponse } from "@/lib/adminHistory";

export default function BillHistoryClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today", page: 1, page_size: 25 });
  const [data, setData] = useState<PaginatedResponse<BillHistoryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchHistory<PaginatedResponse<BillHistoryRow>>("bills", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load bills."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Bill History</h1>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Historical bills and payment status.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="bills" />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Payment status<select value={filters.status_filter || ""} onChange={(event) => setFilters({ ...filters, status_filter: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm">
          <option value="">All statuses</option>
          {["paid", "unpaid", "payment_pending", "void"].map((status) => (
            <option key={status} value={status}>
              {formatPaymentStatus(status)}
            </option>
          ))}
        </select></label>
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Payment method<select value={filters.payment_method || ""} onChange={(event) => setFilters({ ...filters, payment_method: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm">
          <option value="">All methods</option>
          {["counter_cash", "counter_upi", "counter_card", "online"].map((method) => (
            <option key={method} value={method}>
              {formatPaymentMethod(method)}
            </option>
          ))}
        </select></label>
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Table ID<input inputMode="numeric" placeholder="Table ID" value={filters.table_id || ""} onChange={(event) => setFilters({ ...filters, table_id: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm" /></label>
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {loading && !data ? <HistorySkeleton /> : !data || data.items.length === 0 ? (
        <EmptyState message="No bills found for this period" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--omlu-border-strong)]">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="contrast-dark-header bg-[var(--omlu-primary-surface)] text-left text-[10px] uppercase tracking-wider text-[var(--omlu-text-primary)]">
              <tr>{["Bill number", "Date", "Table", "Session", "Subtotal", "Tax", "Discount", "Grand total", "Payment status", "Payment method", "Paid time"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.items.map((bill) => {
                const isQuickSale = !bill.table_number && !bill.session_token;
                return (
                  <tr key={bill.id} className="bg-[var(--omlu-primary-surface)] hover:bg-[var(--omlu-muted-surface)]">
                    <td className="p-3">
                      <div className="font-black text-orange-400">
                        {bill.invoice_number || bill.bill_number}
                      </div>
                      {bill.invoice_number && bill.bill_number && bill.invoice_number !== bill.bill_number && (
                        <div className="text-[10px] font-medium text-[var(--omlu-text-secondary)]">
                          Ref: {bill.bill_number}
                        </div>
                      )}
                      {bill.gst_enabled && bill.gstin && (
                        <div className="mt-1 inline-block rounded border border-[var(--omlu-border-strong)] bg-zinc-800/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--omlu-text-secondary)]">
                          GSTIN {bill.gstin}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">{formatDateTime(bill.date)}</td>
                    <td className="p-3 font-medium">{bill.table_number || "Quick Sale"}</td>
                    <td className="max-w-48 break-all p-3 text-xs text-[var(--omlu-text-secondary)]">
                      {bill.session_token || (isQuickSale ? "Quick Sale" : "-")}
                    </td>
                    <td className="whitespace-nowrap p-3">{formatCurrencyINR(bill.subtotal)}</td>
                    <td className="whitespace-nowrap p-3">
                      <div>{formatCurrencyINR(bill.tax_amount)}</div>
                      {bill.gst_enabled && (bill.cgst_amount || bill.sgst_amount || bill.igst_amount) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--omlu-text-secondary)]">
                          {bill.cgst_amount && <span>CGST {formatCurrencyINR(bill.cgst_amount)}</span>}
                          {bill.sgst_amount && <span>SGST {formatCurrencyINR(bill.sgst_amount)}</span>}
                          {bill.igst_amount && <span>IGST {formatCurrencyINR(bill.igst_amount)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">{formatCurrencyINR(bill.discount_amount)}</td>
                    <td className="whitespace-nowrap p-3 font-bold">{formatCurrencyINR(bill.grand_total)}</td>
                    <td className="whitespace-nowrap p-3">{formatPaymentStatus(bill.payment_status)}</td>
                    <td className="whitespace-nowrap p-3">{formatPaymentMethod(bill.payment_method)}</td>
                    <td className="whitespace-nowrap p-3">{formatDateTime(bill.paid_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} setPage={(page) => setFilters({ ...filters, page })} />
        </div>
      )}
    </div>
  );
}

