import {
  PublicMenuResponse,
  PublicDiningSessionResponse,
  BillResponse,
  CounterPaymentMethod,
  CounterPaymentResponse,
  IssueBillResponse,
  PublicOrderCreateRequest,
  PublicOrderResponse,
  KitchenOrderResponse,
  StaffLoginRequest,
  RestaurantRegistrationRequest,
  RestaurantRegistrationResponse,
  CurrentStaffResponse,
  AdminCategoryResponse,
  AdminMenuItemResponse,
  AdminTableResponse,
  ServiceRequestCreate,
  PublicServiceRequestResponse,
  StaffServiceRequestResponse,
  DashboardSummaryResponse,
  RestaurantSettingsResponse,
  RestaurantSettingsUpdate,
  StaffSessionListItem,
  StaffSessionDetail,
  StaffAccountCreateRequest,
  StaffAccountResponse,
  PendingPaymentItem,
  BillingCounterQueues,
  MenuImportResponse,
  MenuImportDraftItem,
  IssueAndReleaseResponse,
  PaymentCodeLookupResponse,
} from "./types";
import { saveOrderParticipantToken } from "./publicSessionStorage";
import {
  activateWebTenantScope,
  handleAuthenticationStatus,
  prepareForAuthentication,
  terminateWebAuthentication,
} from "./authRuntime.mjs";

export class ApiError extends Error {
  status: number;
  code?: string;
  field?: string;
  constructor(status: number, message: string, code?: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.name = "ApiError";
    handleAuthenticationStatus(status);
  }
}

const DEFINITE_AUTH_FAILURE_CODES = new Set([
  "INVALID_PARTICIPANT_AUTHORITY",
  "PARTICIPANT_AUTHORITY_EXPIRED",
  "SESSION_NOT_FOUND",
  "SESSION_CLOSED",
]);

export function isDefiniteAuthFailure(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return Boolean(err.code && DEFINITE_AUTH_FAILURE_CODES.has(err.code));
}

export type ParsedApiError = {
  message: string;
  code?: string;
  field?: string;
};

export function parseApiError(data: unknown, fallback: string): ParsedApiError {
  let message = fallback;
  let code: string | undefined = undefined;
  let field: string | undefined = undefined;

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (typeof obj.code === "string") {
      code = obj.code;
    }

    if ("detail" in obj && obj.detail) {
      if (typeof obj.detail === "object" && obj.detail !== null) {
        const detail = obj.detail as Record<string, unknown>;
        if (typeof detail.message === "string") {
          message = detail.message;
        } else if (typeof detail.detail === "string") {
          message = detail.detail;
        }
        if (typeof detail.code === "string") {
          code = detail.code;
        }
        if (typeof detail.field === "string") {
          field = detail.field;
        }
      } else if (typeof obj.detail === "string") {
        message = obj.detail;
      }
    } else if (typeof obj.message === "string") {
      message = obj.message;
    }
  }

  return { message, code, field };
}

function publicBackendBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

export async function getPublicMenu(
  restaurantSlug: string,
  tableCode: string
): Promise<PublicMenuResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/restaurants/${encodeURIComponent(
    restaurantSlug
  )}/tables/${encodeURIComponent(tableCode)}/menu`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let message = "An error occurred while fetching the menu.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {
        // Fail silent if response is not JSON
      }
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function createPublicOrder(
  restaurantSlug: string,
  tableCode: string,
  body: PublicOrderCreateRequest,
  idempotencyKey: string,
  participantToken: string
): Promise<PublicOrderResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/restaurants/${encodeURIComponent(
    restaurantSlug
  )}/tables/${encodeURIComponent(tableCode)}/orders`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Participant-Token": participantToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = "An error occurred while placing the order.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {
        // Fail silent if not JSON
      }
      throw new ApiError(response.status, message);
    }

    const order = await response.json();
    saveOrderParticipantToken(order.public_token, participantToken);
    return order;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function createFirstTableOrder(
  restaurantSlug: string,
  tableCode: string,
  body: PublicOrderCreateRequest,
  idempotencyKey: string,
): Promise<{ participant_token: string; session: PublicDiningSessionResponse }> {
  try {
    const response = await fetch(
      `${publicBackendBaseUrl()}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/first-order`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ApiError(response.status, parseApiError(errorData, "An error occurred while placing the order.").message);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function getPublicDiningSession(
  sessionToken: string,
  participantToken: string
): Promise<PublicDiningSessionResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Participant-Token": participantToken,
      },
    });

    if (!response.ok) {
      let message = "An error occurred while fetching the table session.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function getActivePublicDiningSession(
  restaurantSlug: string,
  tableCode: string
): Promise<PublicDiningSessionResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/restaurants/${encodeURIComponent(
    restaurantSlug
  )}/tables/${encodeURIComponent(tableCode)}/session`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "No active table session found.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "No active table session found.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export type TableParticipantAuthority = {
  participant_token: string;
  participant: { public_id: string; joined_at: string; label: string };
  session: { public_id: string; public_token: string; table_number: string; status: string };
  join_code: string;
  participant_count: number;
};

export async function getTableParticipantAuthority(
  sessionToken: string,
  participantToken: string
): Promise<Omit<TableParticipantAuthority, "participant_token">> {
  const response = await fetch(
    `${publicBackendBaseUrl()}/public/sessions/${encodeURIComponent(sessionToken)}/participant`,
    {
      cache: "no-store",
      headers: { "X-Participant-Token": participantToken },
    }
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = parseApiError(body, "Table access has ended.");
    throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
  }
  return body;
}

export async function getTableSessionStatus(restaurantSlug: string, tableCode: string): Promise<{ occupied: boolean }> {
  const response = await fetch(`${publicBackendBaseUrl()}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/session-status`, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail || "Could not check table access.");
  return body;
}

export async function startSecureTableSession(restaurantSlug: string, tableCode: string): Promise<TableParticipantAuthority> {
  const response = await fetch(`${publicBackendBaseUrl()}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-ID": getOrCreatePublicDeviceId() },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = parseApiError(body, "Could not start table ordering.");
    throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
  }
  return body;
}

export async function joinSecureTableSession(restaurantSlug: string, tableCode: string, code: string): Promise<TableParticipantAuthority> {
  const response = await fetch(`${publicBackendBaseUrl()}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, device_id: getOrCreatePublicDeviceId() }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = parseApiError(body, "Could not join table.");
    throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
  }
  return body;
}

function getOrCreatePublicDeviceId(): string {
  const key = "omlu_public_device_id";
  let value = window.localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    window.localStorage.setItem(key, value);
  }
  return value;
}

export async function addOrderToDiningSession(
  sessionToken: string,
  body: PublicOrderCreateRequest,
  idempotencyKey: string,
  participantToken: string
): Promise<PublicDiningSessionResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/orders`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Participant-Token": participantToken,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let message = "An error occurred while adding items to the table bill.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function createOrRefreshPublicBill(
  sessionToken: string,
  participantToken = ""
): Promise<BillResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/bill`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Participant-Token": participantToken },
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "An error occurred while preparing the bill.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "An error occurred while preparing the bill.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function createOrRefreshStaffSessionBill(sessionToken: string): Promise<BillResponse> {
  const response = await fetch(`/api/staff/sessions/${encodeURIComponent(sessionToken)}/bill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail || "Could not prepare the bill.");
  return body;
}

export async function getPublicBill(
  sessionToken: string,
  participantToken = "",
  receiptToken = ""
): Promise<BillResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = receiptToken
    ? `${baseUrl}/public/bills/${encodeURIComponent(receiptToken)}`
    : `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/bill`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(participantToken ? { "X-Participant-Token": participantToken } : {}),
      },
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "Bill not found.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Bill not found.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function issueStaffBill(
  billNumber: string
): Promise<IssueBillResponse> {
  try {
    const response = await fetch(
      `/api/staff/bills/${encodeURIComponent(billNumber)}/issue`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `bill-issue-${billNumber}-v1` },
      }
    );

    if (!response.ok) {
      let message = "Failed to issue bill.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function reopenBillOrdering(
  billNumber: string,
  reason: string
): Promise<IssueBillResponse> {
  try {
    const response = await fetch(
      `/api/staff/bills/${encodeURIComponent(billNumber)}/reopen-ordering`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `reopen-${billNumber}-${Date.now()}`,
        },
        body: JSON.stringify({ reason }),
      }
    );

    if (!response.ok) {
      let message = "Failed to reopen ordering.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function confirmStaffCounterPayment(
  billNumber: string,
  method: CounterPaymentMethod
): Promise<CounterPaymentResponse> {
  try {
    const response = await fetch(
      `/api/staff/bills/${encodeURIComponent(billNumber)}/confirm-counter-payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `bill-payment-${billNumber}-${method}-v1`,
        },
        body: JSON.stringify({ method }),
      }
    );

    if (!response.ok) {
      let message = "Failed to confirm counter payment.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function requestStaffPaymentAssistance(
  billNumber: string
): Promise<BillResponse> {
  try {
    const response = await fetch(
      `/api/staff/bills/${encodeURIComponent(billNumber)}/send-to-counter`,
      { method: "POST" }
    );

    if (!response.ok) {
      let message = "Failed to send bill to counter.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function getPublicOrder(
  publicToken: string,
  participantToken?: string | null
): Promise<PublicOrderResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/orders/${encodeURIComponent(publicToken)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(participantToken ? { "X-Participant-Token": participantToken } : {}),
      },
    });

    if (!response.ok) {
      let message = "An error occurred while fetching the order.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {
        // Fail silent if not JSON
      }
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function getKitchenOrders(
  restaurantSlug: string,
  status?: string
): Promise<KitchenOrderResponse[]> {
  // Call local Next.js API proxy route instead of FastAPI directly
  const url = new URL(
    `/api/kitchen/${encodeURIComponent(restaurantSlug)}/orders`,
    window.location.origin
  );
  if (status) {
    url.searchParams.set("status", status);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let message = "An error occurred while fetching kitchen orders.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function updateKitchenOrderStatus(
  restaurantSlug: string,
  publicToken: string,
  status: string
): Promise<KitchenOrderResponse> {
  // Call local Next.js API proxy route instead of FastAPI directly
  const url = `/api/kitchen/${encodeURIComponent(
    restaurantSlug
  )}/orders/${encodeURIComponent(publicToken)}/status`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      let message = "An error occurred while updating order status.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function staffLogin(
  body: StaffLoginRequest
): Promise<{ staff: CurrentStaffResponse }> {
  try {
    await prepareForAuthentication();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "Login failed.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Login failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    await response.json();
    const staff = await getStaffMe();
    activateWebTenantScope(staff.scope);
    return { staff };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function registerRestaurant(
  body: RestaurantRegistrationRequest
): Promise<RestaurantRegistrationResponse> {
  try {
    const response = await fetch("/api/restaurants/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "Registration failed.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Registration failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function staffLogout(): Promise<void> {
  await terminateWebAuthentication({
    reason: "explicit_logout",
    clearServerSession: true,
    redirectTo: "/login",
  });
}

export async function changeStaffPassword(body: {
  current_password: string;
  new_password: string;
}): Promise<{ staff: CurrentStaffResponse }> {
  try {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let parsed: ParsedApiError = { message: "Password change failed.", code: undefined, field: undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Password change failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.code, parsed.field);
    }

    await response.json();
    await terminateWebAuthentication({
      reason: "authority_epoch_changed",
      clearServerSession: false,
      redirectTo: null,
    });
    const staff = await getStaffMe();
    activateWebTenantScope(staff.scope);
    return { staff };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function getStaffMe(): Promise<CurrentStaffResponse> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let message = "Could not load session.";
      try {
        const errorData = await response.json();
        if (errorData && typeof errorData.detail === "string") {
          message = errorData.detail;
        }
      } catch {}
      throw new ApiError(response.status, message);
    }

    const staff = (await response.json()) as CurrentStaffResponse;
    try {
      activateWebTenantScope(staff.scope);
    } catch {
      await terminateWebAuthentication({
        reason: "authority_scope_mismatch",
        clearServerSession: true,
        redirectTo: "/login",
      });
      throw new ApiError(401, "Authentication authority changed.");
    }
    return staff;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

// --- Admin API Methods ---

export async function getAdminCategories(): Promise<AdminCategoryResponse[]> {
  try {
    const response = await fetch("/api/admin/categories");
    if (!response.ok) {
      let msg = "Failed to fetch categories.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function createAdminCategory(data: {
  name_en: string;
  name_ml?: string;
  display_order?: number;
  is_active?: boolean;
}): Promise<AdminCategoryResponse> {
  try {
    const response = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to create category.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateAdminCategory(
  categoryId: number,
  data: {
    name_en?: string;
    name_ml?: string;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<AdminCategoryResponse> {
  try {
    const response = await fetch(`/api/admin/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to update category.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function deleteAdminCategory(categoryId: number): Promise<void> {
  try {
    const response = await fetch(`/api/admin/categories/${categoryId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      let msg = "Failed to delete category.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function deleteAdminCategoryWithItems(categoryId: number, confirmationName: string): Promise<void> {
  const response = await fetch(`/api/admin/categories/${categoryId}/delete-with-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation_name: confirmationName }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail || "Failed to delete category and items.");
}

export async function moveAdminCategoryItemsAndDelete(categoryId: number, destinationCategoryId: number): Promise<void> {
  const response = await fetch(`/api/admin/categories/${categoryId}/move-items-and-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination_category_id: destinationCategoryId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail || "Failed to move items and delete category.");
}

export async function getAdminMenuItems(filters?: {
  category_id?: number;
  is_available?: boolean;
  search?: string;
}): Promise<AdminMenuItemResponse[]> {
  try {
    const url = new URL("/api/admin/menu-items", window.location.origin);
    if (filters?.category_id !== undefined) {
      url.searchParams.set("category_id", String(filters.category_id));
    }
    if (filters?.is_available !== undefined) {
      url.searchParams.set("is_available", String(filters.is_available));
    }
    if (filters?.search) {
      url.searchParams.set("search", filters.search);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      let msg = "Failed to fetch menu items.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function createAdminMenuItem(data: {
  category_id: number;
  name_en: string;
  name_ml?: string;
  description_en?: string;
  description_ml?: string;
  price: number;
  image_url?: string;
  is_available?: boolean;
  display_order?: number;
}): Promise<AdminMenuItemResponse> {
  try {
    const response = await fetch("/api/admin/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to create menu item.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateAdminMenuItem(
  itemId: number,
  data: {
    category_id?: number;
    name_en?: string;
    name_ml?: string;
    description_en?: string;
    description_ml?: string;
    price?: number;
    image_url?: string;
    is_available?: boolean;
    display_order?: number;
  }
): Promise<AdminMenuItemResponse> {
  try {
    const response = await fetch(`/api/admin/menu-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to update menu item.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function deleteAdminMenuItem(itemId: number): Promise<void> {
  try {
    const response = await fetch(`/api/admin/menu-items/${itemId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      let msg = "Failed to delete menu item.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateAdminMenuItemAvailability(
  itemId: number,
  is_available: boolean
): Promise<AdminMenuItemResponse> {
  try {
    const response = await fetch(`/api/admin/menu-items/${itemId}/availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_available }),
    });
    if (!response.ok) {
      let msg = "Failed to toggle availability.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function scanAdminMenu(images: File[]): Promise<MenuImportResponse> {
  const formData = new FormData();
  images.forEach((image) => formData.append("images", image));
  const response = await fetch("/api/admin/menu-imports", { method: "POST", body: formData });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body?.detail || "Menu scan failed.");
  }
  return body;
}

export async function confirmAdminMenuImport(
  importId: string,
  items: MenuImportDraftItem[],
): Promise<{ status: string; imported: number; skipped: number }> {
  const response = await fetch(`/api/admin/menu-imports/${encodeURIComponent(importId)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((item) => ({
        draft_item_id: item.id,
        selected: item.selected,
        category_name: item.category_name,
        item_name: item.item_name,
        description: item.description,
        price: item.price,
        food_type: item.food_type,
        option_groups: item.option_groups || [],
        variants: item.variants || [],
        duplicate_action: item.duplicate_action || "skip",
      })),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body?.detail || "Menu import failed.");
  }
  return body;
}

export async function getAdminTables(): Promise<AdminTableResponse[]> {
  try {
    const response = await fetch("/api/admin/tables");
    if (!response.ok) {
      let msg = "Failed to fetch tables.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function createAdminTable(data: {
  table_number: string;
}): Promise<AdminTableResponse> {
  try {
    const response = await fetch("/api/admin/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to create table.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateAdminTable(
  tableId: number,
  data: {
    table_number?: string;
    is_active?: boolean;
  }
): Promise<AdminTableResponse> {
  try {
    const response = await fetch(`/api/admin/tables/${tableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let msg = "Failed to update table.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function regenerateAdminTableCode(
  tableId: number
): Promise<AdminTableResponse> {
  try {
    const response = await fetch(`/api/admin/tables/${tableId}/regenerate`, {
      method: "POST",
    });
    if (!response.ok) {
      let msg = "Failed to regenerate table code.";
      try {
        const err = await response.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(response.status, msg);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

// ---- Phase 9: Public Service Requests (called directly from customer browser) ----

export async function createPublicServiceRequest(
  restaurantSlug: string,
  tableCode: string,
  body: ServiceRequestCreate,
  participantToken = ""
): Promise<PublicServiceRequestResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/service-requests`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Participant-Token": participantToken },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = "Failed to submit service request.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to server.");
  }
}

export async function requestPublicSessionBill(sessionToken: string, participantToken: string): Promise<BillResponse> {
  const response = await fetch(
    `${publicBackendBaseUrl()}/public/sessions/${encodeURIComponent(sessionToken)}/bill-request`,
    { method: "POST", headers: { "Content-Type": "application/json", "X-Participant-Token": participantToken } },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail || "Failed to request bill.");
  return body;
}


// ---- Phase 9: Staff Service Requests (via server-side proxy) ----

export async function getStaffServiceRequests(
  statusFilter?: "pending" | "resolved" | "all"
): Promise<StaffServiceRequestResponse[]> {
  const params = statusFilter ? `?status_filter=${statusFilter}` : "";
  try {
    const res = await fetch(`/api/staff/service-requests${params}`);
    if (!res.ok) {
      let msg = "Failed to load service requests.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function resolveStaffServiceRequest(
  requestId: number
): Promise<StaffServiceRequestResponse> {
  try {
    const res = await fetch(`/api/staff/service-requests/${requestId}/resolve`, {
      method: "PATCH",
    });
    if (!res.ok) {
      let msg = "Failed to resolve request.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}


// ---- Phase 9: Dashboard (via server-side proxy) ----

export async function getAdminDashboardSummary(): Promise<DashboardSummaryResponse> {
  try {
    const res = await fetch("/api/admin/dashboard/summary");
    if (!res.ok) {
      let msg = "Failed to load dashboard.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}


// ---- Phase 9: Restaurant Settings (via server-side proxy) ----

export async function getRestaurantSettings(): Promise<RestaurantSettingsResponse> {
  try {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) {
      let msg = "Failed to load settings.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateRestaurantSettings(
  data: RestaurantSettingsUpdate
): Promise<RestaurantSettingsResponse> {
  try {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let msg = "Failed to update settings.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}


// ---- Staff Management ----

export async function getStaffAccounts(): Promise<StaffAccountResponse[]> {
  try {
    const res = await fetch("/api/admin/staff");
    if (!res.ok) {
      let msg = "Failed to load staff accounts.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function getStaffOperations() {
  const res = await fetch("/api/admin/staff/operations");
  if (!res.ok) throw new ApiError(res.status, "Failed to load staff operations.");
  return res.json();
}

export async function setAllStaffLocked(locked: boolean, reason?: string, confirmActiveOperations = false) {
  const res = await fetch(`/api/admin/staff/operations/${locked ? "lock" : "unlock"}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: locked ? JSON.stringify({ reason, confirm_active_operations: confirmActiveOperations }) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : detail?.message || "Failed to update staff operations.");
  }
  return res.json();
}

export async function setStaffLocked(staffId: number, locked: boolean, reason?: string): Promise<StaffAccountResponse> {
  const res = await fetch(`/api/admin/staff/${staffId}/${locked ? "lock" : "unlock"}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: locked ? JSON.stringify({ reason, confirm_active_operations: true }) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to update staff lock.");
  return res.json();
}

export async function setRestaurantOperatingStatus(status: "open" | "closing" | "closed") {
  const res = await fetch("/api/admin/staff/operations/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  if (!res.ok) throw new ApiError(res.status, "Failed to update restaurant status.");
  return res.json();
}

export async function createStaffAccount(
  data: StaffAccountCreateRequest
): Promise<StaffAccountResponse> {
  try {
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let parsed: ParsedApiError = { message: "Failed to create staff account.", code: undefined, field: undefined };
      try {
        const err = await res.json();
        parsed = parseApiError(err, "Failed to create staff account.");
      } catch {}
      throw new ApiError(res.status, parsed.message, parsed.code, parsed.field);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function updateStaffAccount(
  staffId: number,
  data: { role?: string; status?: string; reason?: string }
): Promise<StaffAccountResponse> {
  try {
    const res = await fetch(`/api/admin/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let msg = "Failed to update staff account.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function resetStaffPassword(
  staffId: number,
  temporaryPassword: string
): Promise<StaffAccountResponse> {
  try {
    const res = await fetch(`/api/admin/staff/${staffId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporary_password: temporaryPassword }),
    });
    if (!res.ok) {
      let parsed: ParsedApiError = { message: "Failed to reset password.", code: undefined, field: undefined };
      try {
        const err = await res.json();
        parsed = parseApiError(err, "Failed to reset password.");
      } catch {}
      throw new ApiError(res.status, parsed.message, parsed.code, parsed.field);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function revokeStaffSessions(
  staffId: number
): Promise<StaffAccountResponse> {
  try {
    const res = await fetch(`/api/admin/staff/${staffId}/sessions/revoke`, {
      method: "POST",
    });
    if (!res.ok) {
      let msg = "Failed to sign out staff sessions.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function removeStaffAccess(staffId: number): Promise<void> {
  try {
    const res = await fetch(`/api/admin/staff/${staffId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      let msg = "Failed to remove access.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}


// ---- Staff Active Sessions ----

export async function getStaffSessions(): Promise<StaffSessionListItem[]> {
  try {
    const res = await fetch("/api/staff/sessions");
    if (!res.ok) {
      let msg = "Failed to load active sessions.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function closeEmptySession(
  sessionToken: string
): Promise<StaffSessionDetail> {
  try {
    const res = await fetch(
      `/api/staff/sessions/${encodeURIComponent(sessionToken)}/close-empty`,
      { method: "POST" }
    );
    if (!res.ok) {
      let msg = "Failed to close session.";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") msg = err.detail;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Could not connect to proxy server.");
  }
}

export async function getPendingPayments(): Promise<PendingPaymentItem[]> {
  const res = await fetch("/api/staff/bills/pending-payments", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Failed to load pending payments.");
  }
  const body = await res.json();
  return body.items || [];
}

export async function getBillingCounter(): Promise<BillingCounterQueues> {
  const res = await fetch("/api/staff/bills/billing-counter", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message;
    throw new ApiError(res.status, detail || "Failed to load the billing counter.");
  }
  return body;
}

export async function issueAndReleaseBill(
  billNumber: string,
  idempotencyKey: string,
): Promise<IssueAndReleaseResponse> {
  const res = await fetch(
    `/api/staff/bills/${encodeURIComponent(billNumber)}/issue-and-release`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ confirm_table_is_free: true }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.detail || "Could not release this table.");
  return body;
}

export async function lookupPendingPaymentCode(
  paymentCode: string,
): Promise<PaymentCodeLookupResponse> {
  const normalized = paymentCode.replace(/\s+/g, "").toUpperCase();
  const res = await fetch("/api/staff/bills/payment-code/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_code: normalized }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const retryAfter = res.headers.get("Retry-After");
    if (res.status === 429) {
      throw new ApiError(429, `Too many attempts. Try again in ${retryAfter || body.retry_after_seconds || "a few"} seconds.`);
    }
    if (res.status === 404) {
      throw new ApiError(404, "No active unpaid bill was found for this code.");
    }
    throw new ApiError(res.status, body.detail || "Could not look up this payment code.");
  }
  return body;
}

export async function confirmPendingPayment(
  billNumber: string,
  method: "counter_cash" | "counter_upi",
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `/api/staff/bills/${encodeURIComponent(billNumber)}/confirm-counter-payment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `bill-payment-${billNumber}-${method}-v1`,
      },
      body: JSON.stringify({ method }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Payment confirmation failed.");
  }
  return res.json();
}

export async function getStaffBillReceiptPayload(billNumber: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/staff/bills/${encodeURIComponent(billNumber)}/receipt-payload`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Could not fetch receipt payload.");
  }
  return res.json();
}

export async function requestPrintBridgeToken(
  action: "bridge:pair" | "printer:configure" | "printer:test" | "bill:print" | "receipt:reprint",
  installationId: string,
  billId?: string,
): Promise<{ status: string; token: string; expires_in_seconds: number }> {
  const res = await fetch("/api/admin/print-bridge/authorize-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, installation_id: installationId, bill_id: billId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Could not authorize print bridge action.");
  }
  return res.json();
}

export async function createPairingChallenge(installationId: string): Promise<{ pairing_code: string }> {
  const res = await fetch("/api/admin/print-bridge/pairing-challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installation_id: installationId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Could not create pairing challenge.");
  }
  return res.json();
}

export async function confirmBridgePairing(installationId: string, pairingCode: string): Promise<{ bridge_token: string }> {
  const res = await fetch("/api/admin/print-bridge/confirm-pairing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installation_id: installationId, pairing_code: pairingCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail || "Pairing confirmation failed.");
  }
  return res.json();
}
