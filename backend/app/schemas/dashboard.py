from pydantic import BaseModel, field_validator
from typing import List, Optional
from decimal import Decimal


class TopSellingItem(BaseModel):
    item_name: str
    total_quantity: int


class OrdersByHour(BaseModel):
    hour: int
    count: int


class DashboardTableOverview(BaseModel):
    table_id: int
    table_number: str
    status: str
    session_token: Optional[str] = None
    guest_count: Optional[int] = None
    order_count: int
    bill_total: str
    last_activity_at: Optional[str] = None
    pending_request: Optional[str] = None
    payment_status: Optional[str] = None


class DashboardAttentionItem(BaseModel):
    type: str
    label: str
    table_number: Optional[str] = None
    timestamp: Optional[str] = None


class DashboardActivityItem(BaseModel):
    actor: str
    table_number: Optional[str] = None
    action: str
    timestamp: str


class DashboardSummaryResponse(BaseModel):
    restaurant_name: str
    restaurant_slug: str
    today_order_count: int
    today_revenue: str  # Decimal formatted as string
    average_order_value: str  # Decimal formatted as string
    pending_order_count: int
    accepted_order_count: int = 0
    preparing_order_count: int = 0
    ready_order_count: int = 0
    active_table_count: int = 0
    open_session_count: int = 0
    payment_pending_count: int = 0
    active_service_request_count: int
    rejected_order_count: int
    top_selling_items: List[TopSellingItem]
    orders_by_hour: List[OrdersByHour]
    tables: List[DashboardTableOverview] = []
    attention_items: List[DashboardAttentionItem] = []
    recent_activity: List[DashboardActivityItem] = []
    timezone: str
