"use client";

import { useEffect, useState } from "react";
import { DateFilters, EmptyState, HistorySkeleton, Pager, formatDateTime } from "../../historyControls";
import { fetchHistory, HistoryFilters, OrderHistoryDetail, OrderHistoryRow, PaginatedResponse } from "@/lib/adminHistory";

export default function OrderHistoryClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today", page: 1, page_size: 25 });
  const [data, setData] = useState<PaginatedResponse<OrderHistoryRow> | null>(null);
  const [detail, setDetail] = useState<OrderHistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchHistory<PaginatedResponse<OrderHistoryRow>>("orders", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load orders."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
    };
  }, [detail]);

  const openDetail = async (order: OrderHistoryRow) => {
    setDetail(await fetchHistory<OrderHistoryDetail>(`orders/${order.id}`));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Order History</h1>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Completed and past orders for this restaurant.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="orders" />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Order number<input placeholder="e.g. ORD-100" value={filters.order_number || ""} onChange={(event) => setFilters({ ...filters, order_number: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm" /></label>
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Table ID<input inputMode="numeric" placeholder="Table ID" value={filters.table_id || ""} onChange={(event) => setFilters({ ...filters, table_id: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm" /></label>
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Staff ID<input inputMode="numeric" placeholder="Staff ID" value={filters.staff_id || ""} onChange={(event) => setFilters({ ...filters, staff_id: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm" /></label>
        <label className="text-xs font-bold text-[var(--omlu-text-secondary)]">Order status<select value={filters.status_filter || ""} onChange={(event) => setFilters({ ...filters, status_filter: event.target.value, page: 1 })} className="mt-1 block rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm">
          <option value="">Completed only</option>
          {["pending", "accepted", "preparing", "ready", "served", "rejected"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select></label>
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {loading && !data ? <HistorySkeleton /> : !data || data.items.length === 0 ? (
        <EmptyState message="No orders found for this period" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--omlu-border-strong)]">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="contrast-dark-header bg-[var(--omlu-primary-surface)] text-left text-[10px] uppercase tracking-wider text-[var(--omlu-text-primary)]">
              <tr>{["Order number", "Date and time", "Table", "Session", "Item count", "Status", "Total", "Accepted by", "Served by"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.items.map((order) => (
                <tr key={order.id} className="bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]">
                  <td className="p-3"><button onClick={() => openDetail(order)} className="font-black text-orange-400 underline-offset-4 hover:underline">{order.order_number}</button></td>
                  <td className="p-3 text-[var(--omlu-text-primary)]">{formatDateTime(order.created_at)}</td>
                  <td className="p-3">{order.table_number || "-"}</td>
                  <td className="max-w-48 break-all p-3 text-xs text-[var(--omlu-text-secondary)]">{order.session_token || "-"}</td>
                  <td className="p-3">{order.item_count}</td>
                  <td className="p-3">{order.status}</td>
                  <td className="p-3">₹{order.total}</td>
                  <td className="p-3">{order.accepted_by || "-"}</td>
                  <td className="p-3">{order.served_by || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} setPage={(page) => setFilters({ ...filters, page })} />
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="order-detail-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 text-[var(--omlu-text-secondary)] shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="order-detail-title" className="break-words text-xl font-black text-[var(--omlu-text-primary)]">{detail.order_number}</h2>
                <p className="text-sm text-[var(--omlu-text-secondary)]">{formatDateTime(detail.created_at)} · {detail.status}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded bg-[var(--omlu-muted-surface)] px-3 py-1 text-sm font-bold">Close</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section>
                <h3 className="font-black text-[var(--omlu-text-secondary)]">Items</h3>
                <div className="mt-2 divide-y divide-zinc-800">
                  {detail.items.map((item, index) => (
                    <div key={`${item.item_name}-${index}`} className="py-2 text-sm">
                      <div className="font-bold text-[var(--omlu-text-primary)]">{item.quantity} x {item.item_name}</div>
                      {item.selected_options.map((option, optionIndex) => <div key={`${option.option_name}-${optionIndex}`} className="break-words text-cyan-300">{option.kitchen_display_name || option.option_name}</div>)}
                      <div className="text-[var(--omlu-text-secondary)]">₹{item.unit_price} · ₹{item.total_price}</div>
                      {item.item_note && <div className="text-orange-300">{item.item_note}</div>}
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="font-black text-[var(--omlu-text-secondary)]">Status History</h3>
                <div className="mt-2 divide-y divide-zinc-800">
                  {detail.status_history.map((item, index) => (
                    <div key={index} className="py-2 text-sm">
                      <div className="font-bold text-[var(--omlu-text-primary)]">{item.old_status || "created"} to {item.new_status}</div>
                      <div className="text-[var(--omlu-text-secondary)]">{formatDateTime(item.changed_at)} · {item.changed_by || "System"}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-[var(--omlu-text-secondary)] md:grid-cols-3">
              {["accepted_at", "preparing_at", "ready_at", "served_at", "rejected_at"].map((key) => <div key={key}>{key.replace("_", " ")}: {formatDateTime(detail[key as keyof OrderHistoryDetail] as string | null)}</div>)}
              <div>Cancel reason: {detail.cancel_reason || "-"}</div>
              <div>Notes: {detail.customer_note || "-"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
