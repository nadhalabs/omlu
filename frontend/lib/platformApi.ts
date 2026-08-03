export interface PlatformKPIs {
  total_restaurants: number;
  total_restaurants_monitored: number;
  active_restaurants: number;
  restaurants_healthy: number;
  restaurants_requiring_attention: number;
  stuck_sessions_count: number;
  duplicate_active_sessions_count: number;
  billing_initiation_rate_pct: number | null;
  billing_completion_rate_pct: number | null;
  post_payment_closure_rate_pct: number | null;
  workflow_inconsistencies_count: number;
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

export interface RealtimeSnapshot {
  active_websocket_connections: number;
  redis_available: boolean;
  mode: "live_websocket" | "polling_fallback";
}

export interface FunnelStage {
  stage: string;
  count: number;
  conversion_pct: number;
}

export interface IssuesByCategory {
  category: string;
  count: number;
}

export interface AgeBucket {
  bucket: string;
  count: number;
}

export interface ReliabilityPoint {
  date: string;
  initiation_rate_pct: number | null;
  completion_rate_pct: number | null;
  closure_rate_pct: number | null;
  reliability_status: string;
}

export interface AttentionMatrixItem {
  restaurant_id: number;
  restaurant_name: string;
  health_status: string;
  reasons: string[];
  stuck_sessions_count: number;
  pending_payments_count: number;
}

export interface OperationalVisualizations {
  session_lifecycle_funnel: FunnelStage[];
  workflow_issues_by_category: IssuesByCategory[];
  session_age_distribution: AgeBucket[];
  pending_workflow_ageing: AgeBucket[];
  billing_reliability_time_series: ReliabilityPoint[];
  restaurant_operational_attention_matrix: AttentionMatrixItem[];
}

export interface MonitoringCoverage {
  available_now: string[];
  not_instrumented: string[];
}

export interface StuckSessionIssue {
  session_id: number;
  restaurant_id: number;
  restaurant_name: string;
  table_name: string;
  primary_classification: string;
  human_label: string;
  confidence: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  message: string;
  opened_at: string;
  diagnostic_flags: string[];
}

export interface DuplicateSessionViolation {
  table_id: number;
  table_number: string;
  restaurant_id: number;
  restaurant_name: string;
  active_sessions_count: number;
  session_ids: number[];
  severity: string;
  message: string;
}

export interface PlatformOverviewData {
  metadata: {
    refreshed_at: string;
    period_days: number;
    scope: string;
    timezone_normalized: string;
  };
  platform_status: string;
  kpis: PlatformKPIs;
  current_realtime_snapshot: RealtimeSnapshot;
  health_summary: Record<string, number>;
  operational_attention_panel: StuckSessionIssue[];
  duplicate_active_sessions_panel: DuplicateSessionViolation[];
  visualizations: OperationalVisualizations;
  monitoring_coverage: MonitoringCoverage;
  plain_language_insights?: PlainLanguageInsight[];
}

export interface FleetRestaurant {
  id: number;
  name: string;
  slug: string;
  city: string;
  is_active: boolean;
  plan: string;
  health_status: "Healthy" | "Attention Required" | "Critical Inconsistency" | "No Recent Operational Activity" | "Suspended" | "Onboarding / Incomplete Setup";
  health_reasons: string[];
  orders_today: number;
  collected_revenue_today?: number;
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
  total_amount?: number;
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
  version: {
    app_version: string;
    migration_revision: string;
  };
}

export interface RecoveryActionResult {
  status: string;
  table_available: boolean;
  participants_revoked?: number;
  message?: string;
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

export async function finalizePaidSession(sessionId: number, reason: string): Promise<RecoveryActionResult> {
  const res = await fetch("/api/platform/recovery/finalize-paid-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Recovery action failed" }));
    throw new Error(err.detail || "Recovery action failed");
  }
  return res.json();
}

export async function staleSessionClose(sessionId: number, reason: string): Promise<RecoveryActionResult> {
  const res = await fetch("/api/platform/recovery/stale-session-close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Recovery action failed" }));
    throw new Error(err.detail || "Recovery action failed");
  }
  return res.json();
}
