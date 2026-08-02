const STORAGE_PREFIX = "nadha_public_dining_session";
const RECEIPT_PREFIX = "nadha_public_receipt_session";
const PARTICIPANT_PREFIX = "omlu_table_participant";
const ORDER_PARTICIPANT_PREFIX = "omlu_order_participant";
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

function participantKey(restaurantSlug: string, tableCode: string): string {
  return `${PARTICIPANT_PREFIX}:${encodeURIComponent(restaurantSlug)}:${encodeURIComponent(tableCode)}`;
}

export function saveParticipantToken(restaurantSlug: string, tableCode: string, token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(participantKey(restaurantSlug, tableCode), token);
}

export function readParticipantToken(restaurantSlug: string, tableCode: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(participantKey(restaurantSlug, tableCode));
}

export function clearParticipantToken(restaurantSlug: string, tableCode: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(participantKey(restaurantSlug, tableCode));
}

export function saveSessionParticipantToken(sessionToken: string, token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PARTICIPANT_PREFIX}:session:${sessionToken}`, token);
}

export function readSessionParticipantToken(sessionToken: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${PARTICIPANT_PREFIX}:session:${sessionToken}`);
}

export function clearSessionParticipantToken(sessionToken: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${PARTICIPANT_PREFIX}:session:${sessionToken}`);
}

export function saveOrderParticipantToken(orderToken: string, token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${ORDER_PARTICIPANT_PREFIX}:${orderToken}`, token);
}

export function readOrderParticipantToken(orderToken: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${ORDER_PARTICIPANT_PREFIX}:${orderToken}`);
}

export function clearOrderParticipantToken(orderToken: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${ORDER_PARTICIPANT_PREFIX}:${orderToken}`);
}

function getLegacyPublicReceiptStorageKey(
  restaurantSlug: string,
  tableCode: string
): string {
  return `${RECEIPT_PREFIX}:${restaurantSlug}:${tableCode}`;
}

export function clearLegacyPublicReceiptToken(
  restaurantSlug: string,
  tableCode: string
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    getLegacyPublicReceiptStorageKey(restaurantSlug, tableCode)
  );
  window.sessionStorage.removeItem(
    getLegacyPublicReceiptStorageKey(restaurantSlug, tableCode)
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
