"use client";

import { useEffect, useState } from "react";
import { DateFilters, EmptyState, Pager, formatDateTime } from "../../historyControls";
import { BillHistoryRow, fetchHistory, HistoryFilters, PaginatedResponse } from "@/lib/adminHistory";

export default function BillHistoryClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today", page: 1, page_size: 25 });
  const [data, setData] = useState<PaginatedResponse<BillHistoryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory<PaginatedResponse<BillHistoryRow>>("bills", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load bills."));
    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Bill History</h1>
          <p className="mt-1 text-sm text-zinc-500">Historical bills and payment status.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="bills" />
      </div>
      <div className="flex flex-wrap gap-3">
        <select value={filters.status_filter || ""} onChange={(event) => setFilters({ ...filters, status_filter: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm">
          <option value="">All statuses</option>
          {["paid", "unpaid", "payment_pending", "void"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.payment_method || ""} onChange={(event) => setFilters({ ...filters, payment_method: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm">
          <option value="">All methods</option>
          {["counter_cash", "counter_upi", "online"].map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
        <input placeholder="Table ID" value={filters.table_id || ""} onChange={(event) => setFilters({ ...filters, table_id: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {!data || data.items.length === 0 ? (
        <EmptyState message="No bills found for this period" />
      ) : (
        <div className="overflow-x-auto border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{["Bill number", "Date", "Table", "Session", "Subtotal", "Tax", "Discount", "Grand total", "Payment status", "Payment method", "Paid time"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.items.map((bill) => (
                <tr key={bill.id} className="bg-zinc-900/60">
                  <td className="p-3 font-black text-amber-400">{bill.bill_number}</td>
                  <td className="p-3">{formatDateTime(bill.date)}</td>
                  <td className="p-3">{bill.table_number || "-"}</td>
                  <td className="p-3 text-xs text-zinc-500">{bill.session_token || "-"}</td>
                  <td className="p-3">₹{bill.subtotal}</td>
                  <td className="p-3">₹{bill.tax_amount}</td>
                  <td className="p-3">₹{bill.discount_amount}</td>
                  <td className="p-3 font-bold">₹{bill.grand_total}</td>
                  <td className="p-3">{bill.payment_status}</td>
                  <td className="p-3">{bill.payment_method || "-"}</td>
                  <td className="p-3">{formatDateTime(bill.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} setPage={(page) => setFilters({ ...filters, page })} />
        </div>
      )}
    </div>
  );
}
