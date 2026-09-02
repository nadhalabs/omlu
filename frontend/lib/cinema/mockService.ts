import type { CinemaMenuItem, CinemaOrder, CinemaOrderStatus, CinemaScreen, CinemaSeat, CinemaSettings } from "./types";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateSeats(screenId: string, rowLabels: string[], seatsPerRow: number, existing: CinemaSeat[] = []): CinemaSeat[] {
  const byPosition = new Map(existing.map((seat) => [`${seat.row}:${seat.number}`, seat]));
  return rowLabels.flatMap((row) => Array.from({ length: seatsPerRow }, (_, index) => {
    const number = index + 1;
    const previous = byPosition.get(`${row}:${number}`);
    return previous ?? { id: `${screenId}-${row}-${number}`, row, number, code: `${row}${number}`, status: "active" as const };
  }));
}

export function createScreen(id: string, name: string, code: string, rowCount: number, seatsPerRow: number, aislesAfter: number[] = [4, 10]): CinemaScreen {
  const rows = Array.from({ length: rowCount }, (_, index) => letters[index]);
  return { id, name, code, rows, seatsPerRow, aislesAfter: aislesAfter.filter((n) => n < seatsPerRow), seats: generateSeats(id, rows, seatsPerRow) };
}

const s1 = createScreen("screen-1", "Screen 1", "S1", 8, 12, [4, 8]);
const s2 = createScreen("screen-2", "Screen 2", "S2", 10, 14, [4, 10]);
const s3 = createScreen("screen-3", "Screen 3", "S3", 6, 10, [5]);
s1.seats.find((s) => s.code === "A4")!.status = "disabled";
s2.seats.find((s) => s.code === "G12")!.status = "accessible";
s2.seats.find((s) => s.code === "J1")!.status = "disabled";
s2.seats.find((s) => s.code === "J14")!.status = "disabled";
s3.seats.find((s) => s.code === "F5")!.status = "disabled";

export const initialScreens: CinemaScreen[] = [s1, s2, s3];

export const menuItems: CinemaMenuItem[] = [
  { id: "pop-large", name: "Large Popcorn", category: "Popcorn", description: "Freshly popped, salted or caramel", price: 220, available: true, badge: "Bestseller" },
  { id: "pop-regular", name: "Regular Popcorn", category: "Popcorn", description: "The cinema classic", price: 160, available: true },
  { id: "combo-1", name: "Popcorn + Pepsi Combo", category: "Combos", description: "Large popcorn and two chilled Pepsis", price: 390, available: true, badge: "Save ₹50" },
  { id: "combo-2", name: "Family Movie Combo", category: "Combos", description: "Two popcorns, four drinks and nachos", price: 799, available: true },
  { id: "pepsi", name: "Pepsi", category: "Cold Drinks", description: "Choose regular or large", price: 110, available: true },
  { id: "water", name: "Mineral Water", category: "Water", description: "Chilled 500 ml bottle", price: 50, available: true },
  { id: "nachos", name: "Loaded Nachos", category: "Nachos", description: "Crisp nachos with warm cheese dip", price: 210, available: true },
  { id: "samosa", name: "Mini Samosas", category: "Snacks", description: "Six pieces with mint chutney", price: 140, available: false },
];

export const initialOrders: CinemaOrder[] = [
  { id: "C1048", screenId: "screen-2", seatCode: "G12", status: "preparing", placedMinutesAgo: 2, bagCount: 1, items: [{ name: "Large Popcorn", quantity: 2, price: 220 }, { name: "Pepsi", quantity: 1, price: 110, note: "No ice" }] },
  { id: "C1047", screenId: "screen-1", seatCode: "D06", status: "new", placedMinutesAgo: 1, items: [{ name: "Popcorn + Pepsi Combo", quantity: 1, price: 390 }] },
  { id: "C1046", screenId: "screen-3", seatCode: "B04", status: "ready", placedMinutesAgo: 6, bagCount: 2, items: [{ name: "Loaded Nachos", quantity: 2, price: 210 }, { name: "Mineral Water", quantity: 2, price: 50 }] },
  { id: "C1045", screenId: "screen-2", seatCode: "H08", status: "out-for-delivery", placedMinutesAgo: 9, bagCount: 1, items: [{ name: "Family Movie Combo", quantity: 1, price: 799 }] },
  { id: "C1044", screenId: "screen-1", seatCode: "F11", status: "delivered", placedMinutesAgo: 18, items: [{ name: "Regular Popcorn", quantity: 1, price: 160 }, { name: "Pepsi", quantity: 2, price: 110 }] },
];

export const initialSettings: CinemaSettings = {
  name: "Nadha Cinemas", slug: "nadha-cinemas", contact: "+91 98765 43210",
  orderingEnabled: true, seatDeliveryEnabled: true, pickupEnabled: false,
  currency: "INR (₹)", gstPresentation: "Prices inclusive of GST", defaultFulfilment: "Deliver to seat",
};

export const statusLabels: Record<CinemaOrderStatus, string> = {
  new: "New", accepted: "Accepted", preparing: "Preparing", ready: "Ready", "out-for-delivery": "Out for delivery", delivered: "Delivered",
};

export function screenFor(screens: CinemaScreen[], id: string) { return screens.find((screen) => screen.id === id) ?? screens[0]; }
export function orderTotal(order: CinemaOrder) { return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0); }
export function qrDestination(screen: CinemaScreen, seat: CinemaSeat) { return `http://localhost:3000/c/demo-cinema/${screen.code}/${seat.code}`; }
export function activeSeats(screen: CinemaScreen) { return screen.seats.filter((seat) => seat.status !== "disabled"); }
