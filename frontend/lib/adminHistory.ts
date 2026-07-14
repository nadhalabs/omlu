export type DatePreset = "today" | "yesterday" | "last_7_days" | "last_30_days" | "custom" | "month";

export type HistoryFilters = {
  preset?: DatePreset;
  start_date?: string;
  end_date?: string;
  status_filter?: string;
  table_id?: string;
  staff_id?: string;
  order_number?: string;
  payment_method?: string;
  closed_by?: string;
  page?: number;
  page_size?: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

export type OrderHistoryRow = {
  id: number;
  order_number: string;
  created_at: string;
  table_number: string | null;
  session_token: string | null;
  item_count: number;
  status: string;
  total: string;
  accepted_by: string | null;
  served_by: string | null;
};

export type OrderHistoryDetail = OrderHistoryRow & {
  customer_note: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  rejected_at: string | null;
  cancel_reason: string | null;
  items: { item_name: string; quantity: number; unit_price: string; total_price: string; item_note: string | null }[];
  status_history: { old_status: string | null; new_status: string; changed_at: string; changed_by: string | null }[];
};

export type BillHistoryRow = {
  id: number;
  bill_number: string;
  date: string;
  table_number: string | null;
  session_token: string | null;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  grand_total: string;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
};

export type SessionHistoryRow = {
  id: number;
  session_token: string;
  table_number: string | null;
  started_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
  order_count: number;
  combined_subtotal: string;
  final_bill_total: string;
  payment_status: string;
  closed_by: string | null;
  status: string;
};

export type PerformanceSummary = {
  metrics: Record<string, string | number>;
  revenue_by_day: { date: string; revenue: string }[];
  orders_by_day: { date: string; orders: number }[];
  orders_by_hour: { hour: number; orders: number }[];
  top_selling_items: { item_name: string; quantity: number; revenue: string }[];
  lowest_selling_items: { item_name: string; quantity: number; revenue: string }[];
  category_performance: { category_name: string; quantity: number; revenue: string }[];
  table_usage: { table_number: string; sessions: number; orders: number; revenue: string }[];
  staff_activity: { staff_name: string; status_changes: number; accepted: number; served: number }[];
};

function paramsFrom(filters: HistoryFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  return params.toString();
}

export async function fetchHistory<T>(path: string, filters: HistoryFilters = {}): Promise<T> {
  const query = paramsFrom(filters);
  const res = await fetch(`/api/admin/history/${path}${query ? `?${query}` : ""}`, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === "string" ? data.detail : "Request failed.";
    throw new Error(detail);
  }
  return res.json();
}

export function exportHistory(path: string, filters: HistoryFilters = {}) {
  const query = paramsFrom(filters);
  window.location.href = `/api/admin/history/${path}/export${query ? `?${query}` : ""}`;
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadHistoryPdf(path: string, filters: HistoryFilters = {}) {
  const query = paramsFrom(filters);
  const res = await fetch(`/api/admin/history/${path}/export.pdf${query ? `?${query}` : ""}`, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === "string" ? data.detail : "PDF download failed.";
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromDisposition(res.headers.get("content-disposition"), "omlu-report.pdf");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
