const PREFIX = "omlu:detached-session";

export type DetachedSessionMarker = {
  sessionToken: string;
  restaurantSlug: string;
  restaurantName: string;
  tableCode: string;
  receiptToken: string;
};

const key = (sessionToken: string) => `${PREFIX}:${sessionToken}`;

export function detachedBillPath(marker: Pick<DetachedSessionMarker, "sessionToken" | "receiptToken">) {
  return `/bill/${encodeURIComponent(marker.sessionToken)}?receipt=${encodeURIComponent(marker.receiptToken)}`;
}

export function markDetachedSession(marker: DetachedSessionMarker) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key(marker.sessionToken), JSON.stringify(marker));
}

export function readDetachedSession(sessionToken: string): DetachedSessionMarker | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.sessionStorage.getItem(key(sessionToken)) || "null");
  } catch {
    return null;
  }
}

export function clearDetachedSession(sessionToken: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key(sessionToken));
}
