const STORAGE_PREFIX = "nadha_public_dining_session";
const RECEIPT_PREFIX = "nadha_public_receipt_session";
const PAYMENT_SUCCESS_PREFIX = "nadha_public_payment_success_seen";

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
  const key = getPublicSessionStorageKey(restaurantSlug, tableCode);
  window.localStorage.setItem(key, sessionToken);
  window.sessionStorage.setItem(key, sessionToken);
}

export function readPublicSessionToken(
  restaurantSlug: string,
  tableCode: string
): string | null {
  if (typeof window === "undefined") return null;
  const key = getPublicSessionStorageKey(restaurantSlug, tableCode);
  return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
}

export function clearPublicSessionToken(
  restaurantSlug: string,
  tableCode: string
): void {
  if (typeof window === "undefined") return;
  const key = getPublicSessionStorageKey(restaurantSlug, tableCode);
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

function getPublicReceiptStorageKey(
  restaurantSlug: string,
  tableCode: string
): string {
  return `${RECEIPT_PREFIX}:${restaurantSlug}:${tableCode}`;
}

export function savePublicReceiptToken(
  restaurantSlug: string,
  tableCode: string,
  sessionToken: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getPublicReceiptStorageKey(restaurantSlug, tableCode),
    sessionToken
  );
}

export function readPublicReceiptToken(
  restaurantSlug: string,
  tableCode: string
): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(
    getPublicReceiptStorageKey(restaurantSlug, tableCode)
  );
}

export function clearPublicReceiptToken(
  restaurantSlug: string,
  tableCode: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    getPublicReceiptStorageKey(restaurantSlug, tableCode)
  );
}

function getPaymentSuccessStorageKey(sessionToken: string, billNumber: string): string {
  return `${PAYMENT_SUCCESS_PREFIX}:${sessionToken}:${billNumber}`;
}

export function hasSeenPaymentSuccess(
  sessionToken: string,
  billNumber: string
): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(
    getPaymentSuccessStorageKey(sessionToken, billNumber)
  ) === "1";
}

export function markPaymentSuccessSeen(
  sessionToken: string,
  billNumber: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getPaymentSuccessStorageKey(sessionToken, billNumber),
    "1"
  );
}
