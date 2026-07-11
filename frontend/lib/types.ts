export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
}

export interface RestaurantTable {
  id: number;
  table_number: string;
  table_code: string;
}

export interface MenuItem {
  id: number;
  name_en: string;
  name_ml: string | null;
  description_en: string | null;
  description_ml: string | null;
  price: string; // Price returned as string from API
  image_url: string | null;
  is_available: boolean;
  display_order: number;
}

export interface MenuCategory {
  id: number;
  name_en: string;
  name_ml: string | null;
  display_order: number;
  items: MenuItem[];
}

export interface PublicMenuResponse {
  restaurant: Restaurant;
  table: RestaurantTable;
  categories: MenuCategory[];
}

export interface OrderItemRequest {
  menu_item_id: number;
  quantity: number;
  item_note: string | null;
}

export interface PublicOrderCreateRequest {
  items: OrderItemRequest[];
  customer_note: string | null;
}

export interface PublicOrderResponseItem {
  menu_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
}

export interface OrderStatusHistoryResponse {
  old_status: string | null;
  new_status: string;
  changed_at: string;
}

export interface PublicOrderResponse {
  order_number: string;
  public_token: string;
  status: string;
  subtotal: string;
  table_number: string;
  table_code?: string | null;
  created_at: string;
  restaurant_name?: string;
  restaurant_slug?: string | null;
  customer_note?: string | null;
  items: PublicOrderResponseItem[];
  status_history: OrderStatusHistoryResponse[];
  service_requests_enabled?: boolean;
}

export interface KitchenOrderItemResponse {
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
}

export interface KitchenOrderResponse {
  order_number: string;
  public_token: string;
  table_number: string;
  status: string;
  subtotal: string;
  customer_note: string | null;
  created_at: string;
  status_history: OrderStatusHistoryResponse[];
  items: KitchenOrderItemResponse[];
}

export interface StaffLoginRequest {
  email: string;
  password: string;
  restaurant_slug: string;
}

export interface StaffSummaryResponse {
  name: string;
  email: string;
  role: string;
  restaurant_name: string;
  restaurant_slug: string;
}

export interface CurrentStaffResponse {
  name: string;
  email: string;
  role: string;
  restaurant_name: string;
  restaurant_slug: string;
}

export interface AdminCategoryResponse {
  id: number;
  name_en: string;
  name_ml: string | null;
  display_order: number;
  is_active: boolean;
  item_count: number;
}

export interface AdminMenuItemResponse {
  id: number;
  category_id: number;
  category_name: string;
  name_en: string;
  name_ml: string | null;
  description_en: string | null;
  description_ml: string | null;
  price: string;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
}

export interface AdminTableResponse {
  id: number;
  table_number: string;
  table_code: string;
  is_active: boolean;
  public_menu_url: string;
  qr_code_url: string;
}


// ---- Phase 9: Service Requests ----

export interface ServiceRequestCreate {
  request_type: "waiter" | "water" | "bill";
  public_order_token?: string | null;
}

export interface ServiceRequestResponse {
  id: number;
  restaurant_id: number;
  table_id: number;
  order_id: number | null;
  request_type: string;
  status: "pending" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
  resolved_by_staff_id: number | null;
}

export interface StaffServiceRequestResponse extends ServiceRequestResponse {
  table_number: string | null;
  order_number: string | null;
  resolver_name: string | null;
}


// ---- Phase 9: Dashboard ----

export interface TopSellingItem {
  item_name: string;
  total_quantity: number;
}

export interface OrdersByHour {
  hour: number;
  count: number;
}

export interface DashboardSummaryResponse {
  today_order_count: number;
  today_revenue: string;
  average_order_value: string;
  pending_order_count: number;
  active_service_request_count: number;
  rejected_order_count: number;
  top_selling_items: TopSellingItem[];
  orders_by_hour: OrdersByHour[];
  timezone: string;
}


// ---- Phase 9: Restaurant Settings ----

export interface RestaurantSettingsResponse {
  timezone: string;
  currency: string;
  order_prefix: string;
  service_requests_enabled: boolean;
}

export interface RestaurantSettingsUpdate {
  timezone?: string;
  currency?: string;
  order_prefix?: string;
  service_requests_enabled?: boolean;
}
