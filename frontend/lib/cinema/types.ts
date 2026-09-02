export type CinemaSeatStatus = "active" | "disabled" | "accessible";
export type CinemaOrderStatus = "pending" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered";
export type CinemaOperationalStatus = "pending" | "ready" | "delivered";

export const cinemaOperationalStatus = (status: CinemaOrderStatus): CinemaOperationalStatus => {
  if (status === "accepted" || status === "preparing") return "pending";
  if (status === "out_for_delivery") return "ready";
  return status;
};

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

export interface CinemaOrderItem { name: string; quantity: number; price: number; note?: string; options?: {name:string;quantity:number}[] }
export interface CinemaOrder {
  id: string;
  backendId?: string;
  publicToken?: string;
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

export interface CinemaDashboard {
  cinemaName:string; cinemaSlug:string; revenue:number; orderCount:number; activeOrderCount:number; averageOrderValue:number;
  activeScreens:number; activeSeats:number; disabledSeats:number; statusCounts:Record<CinemaOperationalStatus,number>;
  revenueByScreen:{screen:string;revenue:number}[]; ordersByScreen:{screen:string;orders:number}[];
  ordersBySeat:{seat:string;orders:number}[]; topItems:{name:string;quantity:number}[];
}

export interface CinemaMenuCategory { id:number;name:string;isActive:boolean;items:CinemaMenuItem[] }
