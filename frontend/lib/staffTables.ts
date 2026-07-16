import { BillResponse, MenuOptionGroup, PublicOrderResponse, SelectedOptionRequest, StaffServiceRequestResponse } from "./types";

export type StaffTableSummary = {
  id: number;
  table_number: string;
  state: "available" | "occupied";
  has_open_session: boolean;
  session_token: string | null;
  session_status: string | null;
  active_order_count: number;
  current_bill_amount: string;
  opened_minutes_ago: number | null;
  attention: string[];
  bill_requested: boolean;
};

export type StaffTableDetail = {
  table: StaffTableSummary;
  session: null | {
    id: number;
    session_token: string;
    status: string;
    opened_at: string;
    running_subtotal: string;
    bill: BillResponse | null;
    orders: {
      id: number;
      order_number: string;
      status: string;
      subtotal: string;
      source: string;
      created_at: string;
      items: { item_name: string; quantity: number; unit_price: string; total_price: string; item_note: string | null }[];
    }[];
  };
  requests: { id: number; request_type: string; created_at: string; status: string }[];
  menu_categories: { id: number; name_en: string; items: { id: number; name_en: string; price: string; is_available: boolean; option_groups?: MenuOptionGroup[] }[] }[];
  activity: { type: string; label: string; timestamp: string | null }[];
};

export type ManualOrderPayload = {
  items: { menu_item_id: number; quantity: number; item_note: string | null; selected_options?: SelectedOptionRequest[] }[];
  customer_note: string | null;
};

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return typeof data.detail === "string" ? data.detail : fallback;
}

export async function getStaffTables(filter = "all"): Promise<{ items: StaffTableSummary[] }> {
  const res = await fetch(`/api/staff/tables?filter=${encodeURIComponent(filter)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load tables."));
  return res.json();
}

export async function getStaffTableDetail(tableId: number): Promise<StaffTableDetail> {
  const res = await fetch(`/api/staff/tables/${tableId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load table."));
  return res.json();
}

export async function startStaffTableSession(tableId: number) {
  const res = await fetch(`/api/staff/tables/${tableId}/sessions`, { method: "POST", body: "{}" });
  if (!res.ok) throw new Error(await parseError(res, "Could not start session."));
  return res.json();
}

export async function createStaffTableOrder(tableId: number, payload: ManualOrderPayload): Promise<PublicOrderResponse> {
  const idempotencyKey = `staff-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await fetch(`/api/staff/tables/${tableId}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not submit order."));
  return res.json();
}

export async function generateStaffTableBill(tableId: number): Promise<BillResponse> {
  const res = await fetch(`/api/staff/tables/${tableId}/bill`, { method: "POST", body: "{}" });
  if (!res.ok) throw new Error(await parseError(res, "Could not generate bill."));
  return res.json();
}

export async function requestStaffTableBill(tableId: number): Promise<StaffServiceRequestResponse> {
  const res = await fetch(`/api/staff/tables/${tableId}/bill-request`, { method: "POST", body: "{}" });
  if (!res.ok) throw new Error(await parseError(res, "Could not request bill."));
  return res.json();
}
