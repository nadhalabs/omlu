export interface PlatformKPIs {
  total_restaurants: number;
  active_restaurants: number;
  restaurants_online: number;
  restaurants_requiring_attention: number;
  orders_today: number;
  active_orders: number;
  gross_order_value: number;
  collected_revenue: number;
  pending_collection: number;
  completed_quick_sale_revenue: number;
  open_table_sessions: number;
  pending_payments: number;
  realtime_connected_clients: number;
}

export interface OperationalAlert {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  title: string;
  message: string;
  restaurant_id: number;
  restaurant_name: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
}

export interface PlainLanguageInsight {
  category: string;
  severity: "Alert" | "Warning" | "Info" | "Neutral";
  text: string;
  comparison_period: string;
  metric_value: string;
  drilldown_path: string;
}

export interface PlatformOverviewData {
  metadata: {
    refreshed_at: string;
    period_days: number;
    scope: string;
    timezone_normalized: string;
  };
  kpis: PlatformKPIs;
  health_summary: Record<string, number>;
  operational_attention_panel: OperationalAlert[];
  plain_language_insights: PlainLanguageInsight[];
}

export interface FleetRestaurant {
  id: number;
  name: string;
  slug: string;
  city: string;
  is_active: boolean;
  plan: string;
  health_status: "Healthy" | "Attention" | "Degraded" | "Offline" | "Suspended" | "Onboarding";
  health_reasons: string[];
  orders_today: number;
  collected_revenue_today: number;
  open_tables: number;
  pending_payments: number;
  active_staff_count: number;
  last_activity_at: string;
  timezone: string;
}

export interface PendingPaymentItem {
  bill_id: number;
  bill_number: string;
  restaurant_id: number;
  restaurant_name: string;
  total_amount: number;
  payment_code?: string;
  waiting_minutes: number;
  duration_bucket: string;
  created_at: string;
  alert_status: "Critical" | "Warning" | "Normal";
}

export interface SystemHealthData {
  status: "Healthy" | "Degraded" | "Unavailable";
  timestamp: string;
  components: {
    api_server: string;
    postgresql: string;
    redis: string;
    realtime_broker: string;
    push_service: string;
  };
  metrics: {
    active_connections: number;
    average_latency_ms: number;
    error_rate_5xx: number;
  };
  version: {
    app_version: string;
    migration_revision: string;
  };
}

export async function fetchPlatformOverview(days: number = 1, restaurantId?: number): Promise<PlatformOverviewData> {
  const params = new URLSearchParams({ days: days.toString() });
  if (restaurantId) params.append("restaurant_id", restaurantId.toString());

  const res = await fetch(`/api/platform/overview?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch platform overview" }));
    throw new Error(err.detail || "Failed to fetch platform overview");
  }
  return res.json();
}

export async function fetchFleetRestaurants(search?: string, statusFilter?: string): Promise<{ restaurants: FleetRestaurant[]; total: number }> {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (statusFilter) params.append("status_filter", statusFilter);

  const res = await fetch(`/api/platform/restaurants?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch fleet restaurants");
  return res.json();
}

export async function fetchSystemHealth(): Promise<SystemHealthData> {
  const res = await fetch("/api/platform/system-health", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch system health");
  return res.json();
}
