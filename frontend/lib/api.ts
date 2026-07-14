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
  StaffSummaryResponse,
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
} from "./types";

export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
    this.name = "ApiError";
  }
}

function parseApiError(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    data.detail &&
    typeof data.detail === "object" &&
    "message" in data.detail
  ) {
    const detail = data.detail as { field?: unknown; message?: unknown };
    return {
      message: typeof detail.message === "string" ? detail.message : fallback,
      field: typeof detail.field === "string" ? detail.field : undefined,
    };
  }
  if (data && typeof data === "object" && "detail" in data && typeof data.detail === "string") {
    return { message: data.detail, field: undefined };
  }
  return { message: fallback, field: undefined };
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
  idempotencyKey: string
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

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function getPublicDiningSession(
  sessionToken: string
): Promise<PublicDiningSessionResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
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
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let message = "No active table session found.";
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

export async function addOrderToDiningSession(
  sessionToken: string,
  body: PublicOrderCreateRequest,
  idempotencyKey: string
): Promise<PublicDiningSessionResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/orders`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
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
  sessionToken: string
): Promise<BillResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/bill`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      let message = "An error occurred while preparing the bill.";
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
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function getPublicBill(
  sessionToken: string
): Promise<BillResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/bill`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      let message = "Bill not found.";
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
    throw new ApiError(500, "Could not connect to the backend server.");
  }
}

export async function issueStaffBill(
  billNumber: string
): Promise<IssueBillResponse> {
  try {
    const response = await fetch(
      `/api/staff/bills/${encodeURIComponent(billNumber)}/issue`,
      { method: "POST" }
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

export async function requestPayAtCounter(
  sessionToken: string,
  method: CounterPaymentMethod
): Promise<CounterPaymentResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/sessions/${encodeURIComponent(sessionToken)}/pay-at-counter`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });

    if (!response.ok) {
      let message = "Failed to request counter payment.";
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
    throw new ApiError(500, "Could not connect to the backend server.");
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
        headers: { "Content-Type": "application/json" },
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
      `/api/staff/bills/${encodeURIComponent(billNumber)}/payment-assistance`,
      { method: "POST" }
    );

    if (!response.ok) {
      let message = "Failed to notify admin for payment.";
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
  publicToken: string
): Promise<PublicOrderResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/orders/${encodeURIComponent(publicToken)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
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
): Promise<{ staff: StaffSummaryResponse }> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let parsed = { message: "Login failed.", field: undefined as string | undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Login failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.field);
    }

    return await response.json();
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
      let parsed = { message: "Registration failed.", field: undefined as string | undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Registration failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.field);
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
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, "Logout failed.");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, "Could not connect to the Next.js API server.");
  }
}

export async function changeStaffPassword(body: {
  current_password: string;
  new_password: string;
}): Promise<{ staff: StaffSummaryResponse }> {
  try {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let parsed = { message: "Password change failed.", field: undefined as string | undefined };
      try {
        const errorData = await response.json();
        parsed = parseApiError(errorData, "Password change failed.");
      } catch {}
      throw new ApiError(response.status, parsed.message, parsed.field);
    }

    return await response.json();
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

    return await response.json();
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
  body: ServiceRequestCreate
): Promise<PublicServiceRequestResponse> {
  const baseUrl = publicBackendBaseUrl();
  const url = `${baseUrl}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableCode)}/service-requests`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      let parsed = { message: "Failed to create staff account.", field: undefined as string | undefined };
      try {
        const err = await res.json();
        parsed = parseApiError(err, "Failed to create staff account.");
      } catch {}
      throw new ApiError(res.status, parsed.message, parsed.field);
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
      let parsed = { message: "Failed to reset password.", field: undefined as string | undefined };
      try {
        const err = await res.json();
        parsed = parseApiError(err, "Failed to reset password.");
      } catch {}
      throw new ApiError(res.status, parsed.message, parsed.field);
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
