"use client";

import { useEffect, useState } from "react";
import { DateFilters, EmptyState, Pager, formatDateTime } from "../../historyControls";
import { fetchHistory, HistoryFilters, OrderHistoryDetail, OrderHistoryRow, PaginatedResponse } from "@/lib/adminHistory";

export default function OrderHistoryClient() {
  const [filters, setFilters] = useState<HistoryFilters>({ preset: "today", page: 1, page_size: 25 });
  const [data, setData] = useState<PaginatedResponse<OrderHistoryRow> | null>(null);
  const [detail, setDetail] = useState<OrderHistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory<PaginatedResponse<OrderHistoryRow>>("orders", filters)
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load orders."));
    return () => {
      active = false;
    };
  }, [filters]);

  const openDetail = async (order: OrderHistoryRow) => {
    setDetail(await fetchHistory<OrderHistoryDetail>(`orders/${order.id}`));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Order History</h1>
          <p className="mt-1 text-sm text-zinc-500">Completed and past orders for this restaurant.</p>
        </div>
        <DateFilters filters={filters} setFilters={setFilters} exportPath="orders" />
      </div>
      <div className="flex flex-wrap gap-3">
        <input placeholder="Order number" value={filters.order_number || ""} onChange={(event) => setFilters({ ...filters, order_number: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
        <input placeholder="Table ID" value={filters.table_id || ""} onChange={(event) => setFilters({ ...filters, table_id: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
        <input placeholder="Staff ID" value={filters.staff_id || ""} onChange={(event) => setFilters({ ...filters, staff_id: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm" />
        <select value={filters.status_filter || ""} onChange={(event) => setFilters({ ...filters, status_filter: event.target.value, page: 1 })} className="h-10 rounded border border-zinc-800 bg-zinc-950 px-3 text-sm">
          <option value="">Completed only</option>
          {["pending", "accepted", "preparing", "ready", "served", "rejected"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      {error && <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
      {!data || data.items.length === 0 ? (
        <EmptyState message="No orders found for this period" />
      ) : (
        <div className="overflow-x-auto border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{["Order number", "Date and time", "Table", "Session", "Item count", "Status", "Total", "Accepted by", "Served by"].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.items.map((order) => (
                <tr key={order.id} className="bg-zinc-900/60 hover:bg-zinc-850">
                  <td className="p-3"><button onClick={() => openDetail(order)} className="font-black text-amber-400 underline-offset-4 hover:underline">{order.order_number}</button></td>
                  <td className="p-3 text-zinc-300">{formatDateTime(order.created_at)}</td>
                  <td className="p-3">{order.table_number || "-"}</td>
                  <td className="p-3 text-xs text-zinc-500">{order.session_token || "-"}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">{detail.order_number}</h2>
                <p className="text-sm text-zinc-500">{formatDateTime(detail.created_at)} · {detail.status}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded bg-zinc-800 px-3 py-1 text-sm font-bold">Close</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section>
                <h3 className="font-black text-zinc-200">Items</h3>
                <div className="mt-2 divide-y divide-zinc-800">
                  {detail.items.map((item, index) => (
                    <div key={`${item.item_name}-${index}`} className="py-2 text-sm">
                      <div className="font-bold text-white">{item.quantity} x {item.item_name}</div>
                      <div className="text-zinc-500">₹{item.unit_price} · ₹{item.total_price}</div>
                      {item.item_note && <div className="text-amber-300">{item.item_note}</div>}
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="font-black text-zinc-200">Status History</h3>
                <div className="mt-2 divide-y divide-zinc-800">
                  {detail.status_history.map((item, index) => (
                    <div key={index} className="py-2 text-sm">
                      <div className="font-bold text-white">{item.old_status || "created"} to {item.new_status}</div>
                      <div className="text-zinc-500">{formatDateTime(item.changed_at)} · {item.changed_by || "System"}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
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
