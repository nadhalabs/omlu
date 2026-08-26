import type { BillResponse, PublicReceiptBillResponse } from "@/lib/types";

const PREFIX = "omlu:completed-session";

export type CompletedSessionMarker = {
  sessionToken: string;
  restaurantSlug?: string;
  restaurantName: string;
  tableCode?: string;
  receiptToken?: string;
  /** Human-readable paid amount, e.g. "₹320.00" — for display on the terminal screen only. */
  totalAmount?: string;
  /** Table display number, e.g. "4" — for display on the terminal screen only. */
  tableNumber?: string;
  /** Confirmed bill state that caused this completion marker to be written. */
  billStatus?: "paid";
  /** Tenant-scoped external destination copied from the confirmed bill response. */
  googleReviewUrl?: string;
};

const sessionKey = (sessionToken: string) => `${PREFIX}:session:${sessionToken}`;
const tableKey = (restaurantSlug: string, tableCode: string) => `${PREFIX}:table:${restaurantSlug}:${tableCode}`;

export function completionPath(sessionToken: string, receiptToken?: string | null) {
  const path = `/complete/${encodeURIComponent(sessionToken)}`;
  return receiptToken ? `${path}?receipt=${encodeURIComponent(receiptToken)}` : path;
}

export function buildPaidCompletionMarker(
  bill: BillResponse | PublicReceiptBillResponse,
  canonicalSessionToken?: string,
): CompletedSessionMarker | null {
  const sessionToken = canonicalSessionToken || bill.session_token;
  if (bill.status !== "paid" || !sessionToken) return null;
  return {
    sessionToken,
    restaurantSlug: bill.restaurant_slug,
    restaurantName: bill.restaurant_name,
    tableCode: bill.table_code,
    receiptToken: bill.receipt_token || undefined,
    totalAmount: new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: bill.currency || "INR",
    }).format(Number(bill.total_amount)),
    tableNumber: String(bill.table_number),
    billStatus: "paid",
    googleReviewUrl: bill.google_review_url?.trim() || undefined,
  };
}

export function markCompletedSession(marker: CompletedSessionMarker) {
  if (typeof window === "undefined") return;
  const value = JSON.stringify(marker);
  window.sessionStorage.setItem(sessionKey(marker.sessionToken), value);
  if (marker.restaurantSlug && marker.tableCode) {
    window.sessionStorage.setItem(tableKey(marker.restaurantSlug, marker.tableCode), value);
  }
}

export function readCompletedSession(sessionToken: string): CompletedSessionMarker | null {
  if (typeof window === "undefined") return null;
  const key = sessionKey(sessionToken);
  try {
    const marker = JSON.parse(window.sessionStorage.getItem(key) || "null") as CompletedSessionMarker | null;
    if (!marker || marker.sessionToken !== sessionToken || marker.billStatus !== "paid") {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return marker;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function readCompletedTable(restaurantSlug: string, tableCode: string): CompletedSessionMarker | null {
  if (typeof window === "undefined") return null;
  const key = tableKey(restaurantSlug, tableCode);
  try {
    const marker = JSON.parse(window.sessionStorage.getItem(key) || "null") as CompletedSessionMarker | null;
    if (!marker || marker.restaurantSlug !== restaurantSlug || marker.tableCode !== tableCode || marker.billStatus !== "paid") {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return marker;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearCustomerCartState(restaurantSlug: string, tableCode: string, sessionToken: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`omlu:order-draft:${restaurantSlug}:${tableCode}`);
  window.sessionStorage.removeItem(`omlu:order-draft:${restaurantSlug}:${tableCode}`);
  window.localStorage.removeItem(`omlu:session-cart:${sessionToken}`);
  window.sessionStorage.removeItem(`omlu:session-cart:${sessionToken}`);
}
