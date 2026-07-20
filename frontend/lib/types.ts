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
  option_groups?: MenuOptionGroup[];
}

export interface MenuOption {
  id: number;
  group_id: number;
  name: string;
  price_delta: string;
  available: boolean;
  display_order: number;
}

export interface MenuOptionGroup {
  id: number;
  restaurant_id: number;
  name: string;
  type: "variant" | "addon";
  required: boolean;
  minimum_selections: number;
  maximum_selections: number;
  display_order: number;
  active: boolean;
  options: MenuOption[];
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
  selected_options?: SelectedOptionRequest[];
}

export interface SelectedOptionRequest {
  group_id: number;
  option_id: number;
  quantity: number;
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
  selected_options: OrderItemSelectedOption[];
}

export interface OrderItemSelectedOption {
  option_name: string;
  group_name: string;
  option_type: "variant" | "addon";
  price_delta: string;
  quantity: number;
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
  dining_session_token?: string | null;
  session_subtotal?: string | null;
  session_order_count?: number | null;
  can_order_more?: boolean | null;
}

export type DiningSessionStatus =
  | "open"
  | "payment_requested"
  | "payment_pending"
  | "paid"
  | "closed"
  | "cancelled";

export interface DiningSessionOrderItem {
  menu_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
  selected_options: OrderItemSelectedOption[];
}

export interface DiningSessionOrder {
  order_number: string;
  public_token: string;
  status: string;
  subtotal: string;
  created_at: string;
  customer_note: string | null;
  items: DiningSessionOrderItem[];
  status_history?: OrderStatusHistoryResponse[];
}

export interface PublicDiningSessionResponse {
  public_token: string;
  status: DiningSessionStatus;
  restaurant_name: string;
  restaurant_slug: string;
  table_number: string;
  table_code: string;
  opened_at: string;
  orders: DiningSessionOrder[];
  combined_subtotal: string;
  order_count: number;
  service_requests_enabled: boolean;
  can_order_more: boolean;
  bill: PublicDiningSessionBillSummary | null;
  service_requests: PublicDiningSessionServiceRequest[];
}

export type SessionSummaryResponse = PublicDiningSessionResponse;

export type BillStatus =
  | "draft"
  | "issued"
  | "payment_pending"
  | "paid"
  | "cancelled";

export interface BillItem {
  item_name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  selected_options: OrderItemSelectedOption[];
}

export interface BillOrder {
  order_number: string;
  status: string;
  subtotal: string;
  items: BillItem[];
}

export interface BillResponse {
  bill_number: string;
  restaurant_name: string;
  restaurant_slug: string;
  table_number: string;
  table_code: string;
  session_token: string;
  status: BillStatus;
  orders: BillOrder[];
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
  currency: string;
  generated_at: string;
  paid_at: string | null;
  payment_method: "counter_cash" | "counter_upi" | "counter_card" | "online" | null;
  payment_reference: string | null;
  paid_by_staff_id: number | null;
}

export interface PublicDiningSessionBillSummary {
  bill_number: string;
  status: BillStatus;
  total_amount: string;
  currency: string;
  generated_at: string;
  paid_at: string | null;
  payment_method: "counter_cash" | "counter_upi" | "counter_card" | "online" | null;
}

export interface PublicDiningSessionServiceRequest {
  request_type: "waiter" | "water" | "bill" | string;
  status: "pending" | "acknowledged" | "resolved" | "completed" | "cancelled" | string;
  created_at: string;
  resolved_at: string | null;
}

export type IssueBillResponse = BillResponse;
export type CounterPaymentMethod = "counter_cash" | "counter_upi";
export type CounterPaymentResponse = BillResponse;

export interface KitchenOrderItemResponse {
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
  selected_options: OrderItemSelectedOption[];
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
  login: string;
  password: string;
  restaurant_slug: string;
}

export interface RestaurantRegistrationRequest {
  restaurant_name: string;
  restaurant_slug: string;
  contact_email: string;
  phone_number: string;
  city: string;
  owner_full_name: string;
  owner_username: string;
  owner_email: string;
  password: string;
  confirm_password: string;
  accept_terms: boolean;
}

export interface RestaurantRegistrationResponse {
  success: boolean;
  restaurant_slug: string;
  next_path: string;
}

export interface StaffSummaryResponse {
  name: string;
  username: string | null;
  email: string;
  role: string;
  status: string;
  must_change_password: boolean;
  restaurant_name: string;
  restaurant_slug: string;
}

export interface CurrentStaffResponse {
  name: string;
  username: string | null;
  email: string;
  role: string;
  status: string;
  must_change_password: boolean;
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

export interface PublicServiceRequestResponse {
  request_type: string;
  status: "pending" | "resolved" | "cancelled" | string;
  created_at: string;
  resolved_at: string | null;
}

export interface ServiceRequestResponse {
  id: number;
  restaurant_id: number;
  table_id: number;
  order_id: number | null;
  dining_session_id: number | null;
  request_type: string;
  status: "pending" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
  resolved_by_staff_id: number | null;
}

export interface StaffServiceRequestResponse extends ServiceRequestResponse {
  table_number: string | null;
  order_number: string | null;
  dining_session_token: string | null;
  bill_number: string | null;
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
  restaurant_name: string;
  restaurant_slug: string;
  today_order_count: number;
  today_revenue: string;
  average_order_value: string;
  pending_order_count: number;
  accepted_order_count: number;
  preparing_order_count: number;
  ready_order_count: number;
  active_table_count: number;
  open_session_count: number;
  payment_pending_count: number;
  active_service_request_count: number;
  rejected_order_count: number;
  top_selling_items: TopSellingItem[];
  orders_by_hour: OrdersByHour[];
  tables: DashboardTableOverview[];
  attention_items: DashboardAttentionItem[];
  recent_activity: DashboardActivityItem[];
  timezone: string;
}

export interface DashboardTableOverview {
  table_id: number;
  table_number: string;
  status: string;
  session_token: string | null;
  guest_count: number | null;
  order_count: number;
  bill_total: string;
  last_activity_at: string | null;
  pending_request: string | null;
  payment_status: string | null;
}

export interface DashboardAttentionItem {
  type: string;
  label: string;
  table_number: string | null;
  timestamp: string | null;
}

export interface DashboardActivityItem {
  actor: string;
  table_number: string | null;
  action: string;
  timestamp: string;
}

export interface StaffAccountSession {
  id: number;
  device: string | null;
  ip_address: string | null;
  login_at: string;
  last_active_at: string;
  status: string;
}

export interface StaffAccountResponse {
  id: number;
  name: string;
  username: string | null;
  email: string;
  role: "owner" | "admin" | "staff" | "kitchen";
  status: "invited" | "pending" | "active" | "suspended" | "removed";
  is_active: boolean;
  must_change_password: boolean;
  last_active_at: string | null;
  created_at: string;
  added_by_staff_id: number | null;
  active_session_count: number;
  sessions: StaffAccountSession[];
  operations_locked: boolean;
  operations_locked_at: string | null;
  operations_locked_by_id: number | null;
  operations_locked_by_name: string | null;
  operations_lock_reason: string | null;
}

export interface StaffOperationsResponse {
  locked: boolean;
  locked_at: string | null;
  locked_by_id: number | null;
  locked_by_name: string | null;
  reason: string | null;
  operating_status: "open" | "closing" | "closed";
  active_sessions: number;
  unserved_orders: number;
  pending_requests: number;
  bills_waiting_for_payment: number;
  occupied_tables: number;
}

export interface StaffAccountCreateRequest {
  name: string;
  username: string;
  email: string;
  role: "admin" | "staff" | "kitchen";
  temporary_password: string;
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


// ---- Staff Active Sessions ----

export interface StaffSessionListItem {
  session_token: string;
  table_number: string;
  status: "open" | "payment_requested" | "payment_pending";
  opened_at: string;
  last_activity_at: string;
  order_count: number;
  combined_subtotal: string;
  latest_order_status: string | null;
  bill_id: number | null;
  bill_number: string | null;
}

export interface PendingPaymentItem {
  bill_id: number;
  bill_number: string;
  session_id: number;
  session_token: string;
  table_id: number;
  table_number: string;
  table_name: string;
  grand_total: string;
  total_amount: string;
  amount_paid: string;
  remaining_amount: string;
  currency: string;
  requested_at: string;
  sent_at: string | null;
  sent_by_staff_id: number | null;
  sent_by_staff_name: string | null;
  session_opened_at: string;
  status: "payment_pending";
}

export interface StaffSessionDetail extends StaffSessionListItem {
  closed_at: string | null;
}
