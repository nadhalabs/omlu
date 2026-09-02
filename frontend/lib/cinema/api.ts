import { publicBackendBaseUrl } from "@/lib/api";
import type {
  CinemaDashboard,
  CinemaMenuCategory,
  CinemaMenuItem,
  CinemaOrder,
  CinemaOrderStatus,
  CinemaScreen,
  CinemaSeat,
} from "./types";

type ApiSeat = {
  id: number;
  row_label: string;
  seat_number: number;
  public_code: string;
  position_index: number;
  aisle_after: boolean;
  is_active: boolean;
  is_accessible: boolean;
};
type ApiScreen = {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  seats: ApiSeat[];
};
type ApiOrder = {
  id: number;
  order_number: string;
  status: CinemaOrderStatus;
  subtotal: string;
  screen_id: number;
  seat_code: string;
  created_at: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: string;
    note?: string;
    options?: { name: string; quantity: number }[];
  }>;
  public_token: string;
};
type ApiDashboard = {
  cinema_name: string;
  cinema_slug: string;
  revenue: string;
  order_count: number;
  active_order_count: number;
  average_order_value: string;
  active_screens: number;
  active_seats: number;
  disabled_seats: number;
  status_counts: Record<CinemaOrderStatus, number>;
  revenue_by_screen: { screen: string; revenue: string }[];
  orders_by_screen: { screen: string; orders: number }[];
  orders_by_seat: { seat: string; orders: number }[];
  top_items: { name: string; quantity: number }[];
};
type ApiMenu = {
  categories: Array<{
    id: number;
    name: string;
    is_active: boolean;
    items: Array<{
      id: number;
      name: string;
      description?: string;
      price: string;
      is_available: boolean;
      display_order: number;
    }>;
  }>;
};

const seat = (value: ApiSeat): CinemaSeat => ({
  id: String(value.id),
  row: value.row_label,
  number: value.seat_number,
  code: value.public_code,
  status: !value.is_active
    ? "disabled"
    : value.is_accessible
      ? "accessible"
      : "active",
});
export const screen = (value: ApiScreen): CinemaScreen => {
  const seats = value.seats.map(seat),
    active = seats.filter((x) => x.status !== "disabled"),
    rows = [...new Set(active.map((x) => x.row))];
  return {
    id: String(value.id),
    name: value.name,
    code: value.code,
    rows,
    seatsPerRow: Math.max(0, ...active.map((x) => x.number)),
    aislesAfter: [
      ...new Set(
        value.seats.filter((x) => x.aisle_after).map((x) => x.seat_number),
      ),
    ],
    seats,
  };
};
const order = (value: ApiOrder): CinemaOrder => ({
  id: value.order_number,
  backendId: String(value.id),
  publicToken: value.public_token,
  screenId: String(value.screen_id),
  seatCode: value.seat_code,
  status: value.status,
  placedMinutesAgo: Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value.created_at)) / 60000),
  ),
  items: value.items.map((x) => ({
    name: x.name,
    quantity: x.quantity,
    price: Number(x.unit_price),
    note: x.note,
    options: x.options,
  })),
});

async function admin(path: string, init?: RequestInit) {
  const response = await fetch(`/api/cinema/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.detail === "string"
        ? payload.detail
        : "Cinema API request failed",
    );
  }
  if (response.status === 204) return null;
  return response.json();
}
export async function loadScreens() {
  return ((await admin("screens")) as ApiScreen[]).map(screen);
}
export async function addScreen(body: {
  name: string;
  code: string;
  rows: number;
  seats_per_row: number;
  aisles_after: number[];
}) {
  return screen(
    await admin("screens", { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function updateScreen(
  id: string,
  body: { name?: string; code?: string; is_active?: boolean },
) {
  return screen(
    await admin(`screens/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}
export async function removeScreen(id: string) {
  await admin(`screens/${id}`, { method: "DELETE" });
}
export async function saveLayout(
  id: string,
  rows: number,
  seats_per_row: number,
  aisles_after: number[],
) {
  return screen(
    await admin(`screens/${id}/layout`, {
      method: "PUT",
      body: JSON.stringify({ rows, seats_per_row, aisles_after }),
    }),
  );
}
export async function saveSeat(
  screenId: string,
  seatId: string,
  body: { public_code?: string; is_active?: boolean; is_accessible?: boolean },
) {
  return seat(
    await admin(`screens/${screenId}/seats/${seatId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}
export async function loadOrders() {
  return ((await admin("orders")) as ApiOrder[]).map(order);
}
export async function advanceOrder(
  value: CinemaOrder,
  next: CinemaOrderStatus,
) {
  return order(
    await admin(`orders/${value.backendId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    }),
  );
}
export async function loadDashboard(): Promise<CinemaDashboard> {
  const d = (await admin("dashboard")) as ApiDashboard;
  return {
    cinemaName: d.cinema_name,
    cinemaSlug: d.cinema_slug,
    revenue: Number(d.revenue),
    orderCount: d.order_count,
    activeOrderCount: d.active_order_count,
    averageOrderValue: Number(d.average_order_value),
    activeScreens: d.active_screens,
    activeSeats: d.active_seats,
    disabledSeats: d.disabled_seats,
    statusCounts: d.status_counts,
    revenueByScreen: d.revenue_by_screen.map((x) => ({
      ...x,
      revenue: Number(x.revenue),
    })),
    ordersByScreen: d.orders_by_screen,
    ordersBySeat: d.orders_by_seat,
    topItems: d.top_items,
  };
}
export async function loadMenu(): Promise<CinemaMenuCategory[]> {
  const data = (await admin("menu")) as ApiMenu;
  return data.categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.is_active,
    items: category.items.map((item) => ({
      id: String(item.id),
      name: item.name,
      category: category.name,
      description: item.description || "",
      price: Number(item.price),
      available: item.is_available,
    })),
  }));
}
export async function setMenuAvailability(
  item: CinemaMenuItem,
  isAvailable: boolean,
) {
  await admin(`menu/items/${item.id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ is_available: isAvailable }),
  });
}

export function qrDestination(
  slug: string,
  screenValue: CinemaScreen,
  seatValue: CinemaSeat,
) {
  if (typeof window === "undefined")
    return `/c/${slug}/${screenValue.code}/${seatValue.code}`;
  return `${window.location.origin}/c/${slug}/${screenValue.code}/${seatValue.code}`;
}
export async function openSeat(
  slug: string,
  screenCode: string,
  seatCode: string,
) {
  const base = publicBackendBaseUrl(),
    route = `${base}/public/cinemas/${encodeURIComponent(slug)}/screens/${encodeURIComponent(screenCode)}/seats/${encodeURIComponent(seatCode)}`;
  const resolved = await fetch(route, { cache: "no-store" });
  if (!resolved.ok) throw new Error("Seat not found");
  const session = await fetch(`${route}/sessions`, { method: "POST" });
  if (!session.ok) throw new Error("Unable to authorize this seat");
  const menu = await fetch(`${route}/menu`, { cache: "no-store" });
  if (!menu.ok) throw new Error("Unable to load concessions");
  return { resolved: await session.json(), menu: await menu.json() };
}
export async function placeOrder(
  token: string,
  items: Array<{ menu_item_id: number; quantity: number; selected_options?: Array<{group_id:number;option_id:number;quantity:number}> }>,
) {
  const response = await fetch(
    `${publicBackendBaseUrl()}/public/cinemas/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cinema-Seat-Token": token,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ items }),
    },
  );
  if (!response.ok)
    throw new Error((await response.json()).detail || "Order failed");
  return response.json();
}
export async function trackOrder(token: string, publicToken: string) {
  const response = await fetch(
    `${publicBackendBaseUrl()}/public/cinemas/orders/${encodeURIComponent(publicToken)}`,
    { headers: { "X-Cinema-Seat-Token": token }, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Order tracking unavailable");
  return response.json();
}
