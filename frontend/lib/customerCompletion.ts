const PREFIX = "omlu:completed-session";

export type CompletedSessionMarker = {
  sessionToken: string;
  restaurantSlug: string;
  restaurantName: string;
  tableCode: string;
  receiptToken?: string;
  /** Human-readable paid amount, e.g. "₹320.00" — for display on the terminal screen only. */
  totalAmount?: string;
  /** Table display number, e.g. "4" — for display on the terminal screen only. */
  tableNumber?: string;
  /** Tenant-scoped external destination copied from the confirmed bill response. */
  googleReviewUrl?: string;
};

const sessionKey = (sessionToken: string) => `${PREFIX}:session:${sessionToken}`;
const tableKey = (restaurantSlug: string, tableCode: string) => `${PREFIX}:table:${restaurantSlug}:${tableCode}`;

export function completionPath(sessionToken: string) {
  return `/complete/${encodeURIComponent(sessionToken)}`;
}

export function markCompletedSession(marker: CompletedSessionMarker) {
  if (typeof window === "undefined") return;
  const value = JSON.stringify(marker);
  window.sessionStorage.setItem(sessionKey(marker.sessionToken), value);
  window.sessionStorage.setItem(tableKey(marker.restaurantSlug, marker.tableCode), value);
}

export function readCompletedSession(sessionToken: string): CompletedSessionMarker | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.sessionStorage.getItem(sessionKey(sessionToken)) || "null"); } catch { return null; }
}

export function readCompletedTable(restaurantSlug: string, tableCode: string): CompletedSessionMarker | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.sessionStorage.getItem(tableKey(restaurantSlug, tableCode)) || "null"); } catch { return null; }
}

export function clearCustomerCartState(restaurantSlug: string, tableCode: string, sessionToken: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`omlu:order-draft:${restaurantSlug}:${tableCode}`);
  window.sessionStorage.removeItem(`omlu:order-draft:${restaurantSlug}:${tableCode}`);
  window.localStorage.removeItem(`omlu:session-cart:${sessionToken}`);
  window.sessionStorage.removeItem(`omlu:session-cart:${sessionToken}`);
}
