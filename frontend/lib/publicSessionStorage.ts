const STORAGE_PREFIX = "nadha_public_dining_session";

export function getPublicSessionStorageKey(
  restaurantSlug: string,
  tableCode: string
): string {
  return `${STORAGE_PREFIX}:${restaurantSlug}:${tableCode}`;
}

export function savePublicSessionToken(
  restaurantSlug: string,
  tableCode: string,
  sessionToken: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getPublicSessionStorageKey(restaurantSlug, tableCode),
    sessionToken
  );
}

export function readPublicSessionToken(
  restaurantSlug: string,
  tableCode: string
): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(
    getPublicSessionStorageKey(restaurantSlug, tableCode)
  );
}

export function clearPublicSessionToken(
  restaurantSlug: string,
  tableCode: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    getPublicSessionStorageKey(restaurantSlug, tableCode)
  );
}
