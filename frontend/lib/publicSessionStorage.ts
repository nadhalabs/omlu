const STORAGE_PREFIX = "nadha_public_dining_session";
const RECEIPT_PREFIX = "nadha_public_receipt_session";
const PARTICIPANT_PREFIX = "omlu_table_participant";
const ORDER_PARTICIPANT_PREFIX = "omlu_order_participant";
const PAYMENT_SUCCESS_PREFIX = "nadha_public_payment_success_seen";
const SCOPED_STATE_KEY = "omlu:public-session-state:v2";

export type PublicSessionOwnership = {
  restaurantId: number;
  restaurantSlug: string;
  tableId: number;
  tableCode: string;
  sessionToken: string;
};

export type PublicSessionState = {
  ownership: PublicSessionOwnership;
  participantToken: string;
};

type StoredPublicSessionState = PublicSessionState & { version: 2 };

function parseScopedState(value: string | null): StoredPublicSessionState | null {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<StoredPublicSessionState>;
    const ownership = state.ownership;
    if (
      state.version !== 2 || !ownership || !state.participantToken ||
      !Number.isInteger(ownership.restaurantId) || !Number.isInteger(ownership.tableId) ||
      !ownership.restaurantSlug || !ownership.tableCode || !ownership.sessionToken
    ) return null;
    return state as StoredPublicSessionState;
  } catch {
    return null;
  }
}

function sameOwnership(left: PublicSessionOwnership, right: PublicSessionOwnership): boolean {
  return left.restaurantId === right.restaurantId &&
    left.restaurantSlug === right.restaurantSlug &&
    left.tableId === right.tableId &&
    left.tableCode === right.tableCode &&
    left.sessionToken === right.sessionToken;
}

export function savePublicSessionState(ownership: PublicSessionOwnership, participantToken: string): void {
  if (typeof window === "undefined") return;
  const value = JSON.stringify({ version: 2, ownership, participantToken } satisfies StoredPublicSessionState);
  window.localStorage.setItem(SCOPED_STATE_KEY, value);
  window.sessionStorage.setItem(SCOPED_STATE_KEY, value);
  // Legacy scalar records are only validation inputs. Once the server-validated
  // ownership envelope is available, do not leave them eligible for reuse.
  const legacySessionKey = getPublicSessionStorageKey(ownership.restaurantSlug, ownership.tableCode);
  window.localStorage.removeItem(legacySessionKey);
  window.sessionStorage.removeItem(legacySessionKey);
  window.localStorage.removeItem(participantKey(ownership.restaurantSlug, ownership.tableCode));
}

export function readPublicSessionState(expected: PublicSessionOwnership): PublicSessionState | null {
  if (typeof window === "undefined") return null;
  const local = parseScopedState(window.localStorage.getItem(SCOPED_STATE_KEY));
  const current = parseScopedState(window.sessionStorage.getItem(SCOPED_STATE_KEY)) || local;
  if (!current || !sameOwnership(current.ownership, expected)) {
    if (current) {
      window.localStorage.removeItem(SCOPED_STATE_KEY);
      window.sessionStorage.removeItem(SCOPED_STATE_KEY);
    }
    return null;
  }
  return { ownership: current.ownership, participantToken: current.participantToken };
}

export function readPublicSessionStateForTable(
  expected: Omit<PublicSessionOwnership, "sessionToken">
): PublicSessionState | null {
  if (typeof window === "undefined") return null;
  const current = parseScopedState(window.sessionStorage.getItem(SCOPED_STATE_KEY)) ||
    parseScopedState(window.localStorage.getItem(SCOPED_STATE_KEY));
  if (!current) return null;
  const matches = current.ownership.restaurantId === expected.restaurantId &&
    current.ownership.restaurantSlug === expected.restaurantSlug &&
    current.ownership.tableId === expected.tableId &&
    current.ownership.tableCode === expected.tableCode;
  if (!matches) {
    window.localStorage.removeItem(SCOPED_STATE_KEY);
    window.sessionStorage.removeItem(SCOPED_STATE_KEY);
    return null;
  }
  return { ownership: current.ownership, participantToken: current.participantToken };
}

export function clearPublicSessionState(restaurantSlug: string, tableCode: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SCOPED_STATE_KEY);
  window.sessionStorage.removeItem(SCOPED_STATE_KEY);
  clearPublicSessionToken(restaurantSlug, tableCode);
  clearParticipantToken(restaurantSlug, tableCode);
}

export function readLegacyPublicSessionCandidate(
  restaurantSlug: string,
  tableCode: string
): { sessionToken: string; participantToken: string } | null {
  if (typeof window === "undefined") return null;
  const sessionToken = readPublicSessionToken(restaurantSlug, tableCode);
  const participantToken = readParticipantToken(restaurantSlug, tableCode);
  return sessionToken && participantToken ? { sessionToken, participantToken } : null;
}

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
