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
  empty_table_report: null | { reported_at: string; reported_by_name: string };
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
  empty_table_report: null | { reported_at: string; reported_by_name: string };
};

export type ManualOrderPayload = {
  items: { menu_item_id: number; quantity: number; item_note: string | null; selected_options?: SelectedOptionRequest[] }[];
  customer_note: string | null;
};

export type StaffTableParticipants = {
  join_code: string;
  participants: {
    public_id: string;
    label: string;
    joined_at: string;
    revoked_at: string | null;
  }[];
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
  const storageKey = `omlu:staff-order-key:${tableId}`;
  const idempotencyKey = localStorage.getItem(storageKey) || crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  const res = await fetch(`/api/staff/tables/${tableId}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not submit order."));
  localStorage.removeItem(storageKey);
  return res.json();
}

export async function createStaffServedItem(tableId: number, payload: ManualOrderPayload & { late_entry_reason: string }): Promise<PublicOrderResponse> {
  const storageKey = `omlu:staff-served-item-key:${tableId}`;
  const idempotencyKey = localStorage.getItem(storageKey) || crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  const res = await fetch(`/api/staff/tables/${tableId}/served-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not add served item."));
  localStorage.removeItem(storageKey);
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

export async function getStaffTableParticipants(sessionToken: string): Promise<StaffTableParticipants> {
  const res = await fetch(`/api/staff/table-sessions/${encodeURIComponent(sessionToken)}/participants`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res, "Could not load customer devices."));
  return res.json();
}

export async function rotateStaffTableJoinCode(sessionToken: string): Promise<{ join_code: string }> {
  const res = await fetch(`/api/staff/table-sessions/${encodeURIComponent(sessionToken)}/rotate-join-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not rotate the join code."));
  return res.json();
}

export async function revokeStaffTableParticipant(sessionToken: string, participantId: string): Promise<void> {
  const res = await fetch(
    `/api/staff/table-sessions/${encodeURIComponent(sessionToken)}/participants/${encodeURIComponent(participantId)}/revoke`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Revoked from the staff table view" }),
    }
  );
  if (!res.ok) throw new Error(await parseError(res, "Could not revoke this device."));
}

export async function reportStaffTableEmpty(
  tableId: number,
  sessionToken: string
): Promise<{ status: string; session_token: string; reported_at: string; reported_by_name: string }> {
  const res = await fetch(`/api/staff/tables/${tableId}/empty-table-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_token: sessionToken }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Could not report this table."));
  return res.json();
}

export async function dismissEmptyTableReport(tableId: number): Promise<void> {
  const res = await fetch(`/api/staff/tables/${tableId}/empty-table-report/dismiss`, { method: "POST", body: "{}" });
  if (!res.ok) throw new Error(await parseError(res, "Could not dismiss this report."));
}

export async function closeReportedTableSession(tableId: number): Promise<void> {
  const res = await fetch(`/api/staff/tables/${tableId}/empty-table-report/close-session`, { method: "POST", body: "{}" });
  if (!res.ok) throw new Error(await parseError(res, "Could not close this session."));
}
