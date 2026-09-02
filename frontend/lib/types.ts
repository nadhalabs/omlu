export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  google_review_url: string | null;
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
  kitchen_display_name: string | null;
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
  id: number;
  menu_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
  selected_options: OrderItemSelectedOption[];
  cancellation_status: "active" | "cancelled";
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancellation_actor_type: "customer" | "staff" | null;
}

export interface OrderItemSelectedOption {
  option_name: string;
  kitchen_display_name?: string | null;
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
  | "detached_awaiting_payment"
  | "paid"
  | "closed"
  | "cancelled";

export interface DiningSessionOrderItem {
  id: number;
  menu_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
  selected_options: OrderItemSelectedOption[];
  cancellation_status: "active" | "cancelled";
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancellation_actor_type: "customer" | "staff" | null;
}

export interface DiningSessionOrder {
  kitchen_mode_snapshot: "kds" | "direct_print";
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
  kitchen_mode: "kds" | "direct_print";
  public_token: string;
  status: DiningSessionStatus;
  restaurant_name: string;
  restaurant_slug: string;
  venue_type: "restaurant" | "cinema";
  table_number: string;
  table_code: string;
  opened_at: string;
  payment_requested_at: string | null;
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

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  options: string[];
}

export interface ReceiptPayload {
  bill_number: string;
  invoice_number: string | null;
  receipt_title: string;
  status: "issued" | "payment_pending" | "paid";
  restaurant_name: string;
  legal_business_name: string;
  address: string;
  gstin: string | null;
  state_name: string | null;
  state_code: string | null;
  customer_gstin: string | null;
  customer_legal_name: string | null;
  customer_billing_address: string | null;
  customer_state_name: string | null;
  customer_state_code: string | null;
  table_number: string;
  staff_name: string;
  created_at: string;
  paid_at: string | null;
  items: ReceiptItem[];
  subtotal: string;
  discount_amount: string;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  tax_amount: string;
  grand_total: string;
  currency: string;
  gst_enabled: boolean;
  tax_mode: "inclusive" | "exclusive" | null;
  payment_method: string | null;
  payment_status: "PAID" | "UNPAID";
  is_official_invoice: true;
  digital_bill_url: string;
}

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
  document_title: "BILL" | "TAX INVOICE";
  receipt_token: string | null;
  restaurant_name: string;
  restaurant_slug: string;
  google_review_url: string | null;
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
  generated_by_role: "owner" | "admin" | "staff" | "kitchen" | null;
  sent_to_counter_by_role: "owner" | "admin" | "staff" | "kitchen" | null;
  gst_enabled: boolean;
  invoice_number: string | null;
  invoice_date: string | null;
  taxable_amount: string | null;
  gst_rate: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  tax_mode: "inclusive" | "exclusive" | null;
  gstin: string | null;
  legal_business_name: string | null;
  registered_billing_address: string | null;
  state_name: string | null;
  state_code: string | null;
  customer_tax_type: "b2c" | "b2b";
  customer_gstin_snapshot: string | null;
  customer_legal_name_snapshot: string | null;
  customer_billing_address_snapshot: string | null;
  customer_state_code_snapshot: string | null;
  customer_state_name_snapshot: string | null;
  place_of_supply_code_snapshot: string | null;
  session_status: DiningSessionStatus;
  payment_requested_at: string | null;
  detached_at: string | null;
  payment_code: string | null;
  payment_code_expires_at: string | null;
  amount_due: string | null;
  original_table: string | null;
  issued_at: string | null;
  detached_session_status: DiningSessionStatus | null;
  receipt_access: string | null;
}

/**
 * The token-authorized public receipt endpoint intentionally omits dining-session
 * and table identifiers. Keep that runtime contract distinct from BillResponse so
 * receipt data cannot accidentally be used as if it contained a session key.
 */
export type PublicReceiptBillResponse = Omit<
  BillResponse,
  | "restaurant_slug"
  | "table_code"
  | "session_token"
  | "paid_by_staff_id"
  | "generated_by_role"
  | "sent_to_counter_by_role"
  | "session_status"
  | "payment_requested_at"
  | "detached_at"
  | "payment_code"
  | "payment_code_expires_at"
  | "original_table"
  | "detached_session_status"
  | "receipt_access"
> & Partial<Pick<
  BillResponse,
  | "restaurant_slug"
  | "table_code"
  | "session_token"
  | "paid_by_staff_id"
  | "generated_by_role"
  | "sent_to_counter_by_role"
  | "session_status"
  | "payment_requested_at"
  | "detached_at"
  | "payment_code"
  | "payment_code_expires_at"
  | "original_table"
  | "detached_session_status"
  | "receipt_access"
>>;

export interface ShortOrderSummary {
  order_count: number;
  item_count: number;
  items: string[];
}

export interface DetachedPendingBill {
  bill_number: string;
  restaurant_name: string;
  original_table: string;
  original_table_id: number;
  session_id: number;
  bill_status: "payment_pending";
  session_status: "detached_awaiting_payment";
  amount_due: string;
  currency: string;
  issued_at: string;
  detached_at: string;
  payment_code_expires_at: string;
}

export interface IssueAndReleaseResponse extends DetachedPendingBill {
  payment_code: string;
}

export interface PaymentCodeLookupResponse extends DetachedPendingBill {
  waiting_seconds: number;
  order_summary: ShortOrderSummary;
  can_confirm_payment: boolean;
}

export interface PublicDiningSessionBillSummary {
  bill_number: string;
  status: BillStatus;
  total_amount: string;
  currency: string;
  generated_at: string;
  paid_at: string | null;
  payment_method: "counter_cash" | "counter_upi" | "counter_card" | "online" | null;
  receipt_token: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: string;
  discount_amount: string;
  taxable_amount: string;
  gst_rate: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  tax_amount: string;
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
  id?: number | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  item_note: string | null;
  selected_options: OrderItemSelectedOption[];
  cancellation_status?: "active" | "cancelled";
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancellation_actor_type?: "customer" | "staff" | null;
}

export interface KitchenOrderResponse {
  order_number: string;
  public_token: string;
  table_number: string;
  source?: string | null;
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
  google_review_url?: string | null;
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
  email: string | null;
  role: string;
  status: string;
  must_change_password: boolean;
  restaurant_name: string;
  restaurant_slug: string;
}

export interface CurrentStaffResponse {
  name: string;
  username: string | null;
  email: string | null;
  role: string;
  status: string;
  must_change_password: boolean;
  restaurant_name: string;
  restaurant_slug: string;
  venue_type: "restaurant" | "cinema";
  scope: {
    restaurant_id: number;
    actor_id: number;
    role: string;
    authority_epoch: string;
  };
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

export type MenuFoodType = "veg" | "non_veg" | "egg" | "unknown";

export interface MenuOptionDraft {
  name: string;
  final_price?: number | null;
  price_delta?: number | null;
  kitchen_display_name?: string | null;
  confidence?: number;
  warnings?: string[];
}

export interface MenuOptionGroupDraft {
  name: string;
  type: "variant" | "addon";
  required: boolean;
  minimum_selections: number;
  maximum_selections: number;
  options: MenuOptionDraft[];
  confidence?: number;
  warnings?: string[];
}

export interface MenuImportDraftItem {
  id: string;
  category_name: string | null;
  extracted_category_name: string | null;
  category_id: number | null;
  category_source: "existing" | "new" | "unresolved";
  item_name: string;
  description: string | null;
  price: number | null;
  food_type: MenuFoodType;
  option_groups: MenuOptionGroupDraft[];
  variants: { name: string; price: number }[];
  warnings: string[];
  item_confidence: number;
  category_confidence: number;
  selected: boolean;
  duplicate: boolean;
  duplicate_action?: "skip" | "replace" | "keep_both";
}

export interface MenuImportResponse {
  id: string;
  status: string;
  general_warnings: string[];
  items: MenuImportDraftItem[];
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
  request_type: "waiter" | "water";
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
  orders: number;
}

export interface DashboardSummaryResponse {
  restaurant_name: string;
  restaurant_slug: string;
  today_order_count: number;
  today_revenue: string;
  collected_revenue: string;
  pending_collection: string;
  completed_quick_sale_revenue: string;
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
  id: string;
  actor: string;
  table_number: string | null;
  action: string;
  status: string;
  count: number;
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
  email: string | null;
  role: "owner" | "admin" | "staff" | "kitchen";
  status: "invited" | "pending" | "active" | "suspended" | "removed";
  is_active: boolean;
  must_change_password: boolean;
  last_active_at: string | null;
  created_at: string;
  added_by_staff_id: number | null;
  added_by_display_name?: string | null;
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
  email?: string;
  role: "admin" | "staff" | "kitchen";
  temporary_password?: string;
  pin?: string;
  confirm_pin?: string;
}


// ---- Phase 9: Restaurant Settings ----

export interface RestaurantSettingsResponse {
  kitchen_mode: "kds" | "direct_print";
  timezone: string;
  currency: string;
  order_prefix: string;
  service_requests_enabled: boolean;
  gst_enabled: boolean;
  gstin: string | null;
  legal_business_name: string | null;
  registered_billing_address: string | null;
  gst_state_name: string | null;
  gst_state_code: string | null;
  default_gst_rate: string;
  tax_mode: "inclusive" | "exclusive";
  invoice_prefix: string;
  google_review_url: string | null;
}

export interface RestaurantSettingsUpdate {
  kitchen_mode?: "kds" | "direct_print";
  timezone?: string;
  currency?: string;
  order_prefix?: string;
  service_requests_enabled?: boolean;
  gst_enabled?: boolean;
  gstin?: string | null;
  legal_business_name?: string | null;
  registered_billing_address?: string | null;
  gst_state_name?: string | null;
  gst_state_code?: string | null;
  default_gst_rate?: string;
  tax_mode?: "inclusive" | "exclusive";
  invoice_prefix?: string;
  google_review_url?: string | null;
}


// ---- Staff Active Sessions ----

export interface StaffSessionListItem {
  session_token: string;
  table_number: string;
  status: "open" | "payment_requested" | "payment_pending";
  opened_at: string;
  last_activity_at: string;
  order_count: number;
  billable_order_count: number;
  combined_subtotal: string;
  latest_order_status: string | null;
  bill_id: number | null;
  bill_number: string | null;
  bill_status: BillStatus | null;
  bill_total: string | null;
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
  status: "draft" | "issued" | "payment_pending";
  session_status: DiningSessionStatus;
  detached_at: string | null;
  payment_code: string | null;
  payment_code_expires_at: string | null;
  order_summary: ShortOrderSummary;
  stage: "bill_requested" | "bill_issued" | "detached_awaiting_payment" | "ready_for_payment" | "payment_pending";
}

export interface BillingCounterItem {
  bill_id: number;
  bill_number: string;
  session_token: string;
  table_id: number;
  table_number: string;
  requested_at: string;
  item_count: number;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  status: "draft" | "issued" | "payment_pending" | "paid";
  invoice_number: string | null;
  payment_method: string | null;
  paid_at: string | null;
  receipt_token: string | null;
  gst_enabled: boolean;
  has_customer_gst_details: boolean;
  customer_gstin: string | null;
  customer_legal_name: string | null;
  customer_billing_address: string | null;
  customer_state_name: string | null;
  customer_state_code: string | null;
}

export interface BillingCounterQueues {
  requested: BillingCounterItem[];
  awaiting_payment: BillingCounterItem[];
  paid_recently: BillingCounterItem[];
}

export interface StaffSessionDetail extends StaffSessionListItem {
  closed_at: string | null;
}
