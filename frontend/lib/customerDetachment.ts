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

export function readDetachedSession(
  sessionToken: string,
  expectedTable?: Pick<DetachedSessionMarker, "restaurantSlug" | "tableCode">,
): DetachedSessionMarker | null {
  if (typeof window === "undefined") return null;
  const storageKey = key(sessionToken);
  try {
    const marker = JSON.parse(window.sessionStorage.getItem(storageKey) || "null") as DetachedSessionMarker | null;
    if (
      !marker || marker.sessionToken !== sessionToken || !marker.receiptToken ||
      (expectedTable && (
        marker.restaurantSlug !== expectedTable.restaurantSlug || marker.tableCode !== expectedTable.tableCode
      ))
    ) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return marker;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function clearDetachedSession(sessionToken: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key(sessionToken));
}
