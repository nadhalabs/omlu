export type CinemaSeatStatus = "active" | "disabled" | "accessible";
export type CinemaOrderStatus = "new" | "accepted" | "preparing" | "ready" | "out-for-delivery" | "delivered";

export interface CinemaSeat {
  id: string;
  row: string;
  number: number;
  code: string;
  status: CinemaSeatStatus;
}

export interface CinemaScreen {
  id: string;
  name: string;
  code: string;
  rows: string[];
  seatsPerRow: number;
  aislesAfter: number[];
  seats: CinemaSeat[];
}

export interface CinemaOrderItem { name: string; quantity: number; price: number; note?: string }
export interface CinemaOrder {
  id: string;
  screenId: string;
  seatCode: string;
  items: CinemaOrderItem[];
  status: CinemaOrderStatus;
  placedMinutesAgo: number;
  bagCount?: number;
}

export interface CinemaMenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  available: boolean;
  badge?: string;
}

export interface CinemaSettings {
  name: string;
  slug: string;
  contact: string;
  orderingEnabled: boolean;
  seatDeliveryEnabled: boolean;
  pickupEnabled: boolean;
  currency: string;
  gstPresentation: string;
  defaultFulfilment: string;
}
