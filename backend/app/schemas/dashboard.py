from pydantic import BaseModel, field_validator
from typing import List, Optional
from decimal import Decimal


class TopSellingItem(BaseModel):
    item_name: str
    total_quantity: int


class OrdersByHour(BaseModel):
    hour: int
    count: int


class DashboardSummaryResponse(BaseModel):
    today_order_count: int
    today_revenue: str  # Decimal formatted as string
    average_order_value: str  # Decimal formatted as string
    pending_order_count: int
    active_service_request_count: int
    rejected_order_count: int
    top_selling_items: List[TopSellingItem]
    orders_by_hour: List[OrdersByHour]
    timezone: str
