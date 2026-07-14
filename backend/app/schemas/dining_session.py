from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_serializer

from app.schemas.order import PublicOrderResponseItem


class DiningSessionSummary(BaseModel):
    public_token: str
    restaurant_name: str
    restaurant_slug: str
    table_number: str
    table_code: str
    status: str
    opened_at: datetime
    subtotal: Decimal
    order_count: int

    @field_serializer("subtotal")
    def serialize_subtotal(self, subtotal: Decimal) -> str:
        return f"{subtotal:.2f}"

    model_config = ConfigDict(from_attributes=True)


class DiningSessionOrderSummary(BaseModel):
    order_number: str
    public_token: str
    status: str
    subtotal: Decimal
    created_at: datetime
    customer_note: Optional[str] = None
    items: List[PublicOrderResponseItem]

    @field_serializer("subtotal")
    def serialize_subtotal(self, subtotal: Decimal) -> str:
        return f"{subtotal:.2f}"

    model_config = ConfigDict(from_attributes=True)


class PublicDiningSessionBillSummary(BaseModel):
    bill_number: str
    status: str
    total_amount: Decimal
    currency: str
    generated_at: datetime
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None

    @field_serializer("total_amount")
    def serialize_total_amount(self, total_amount: Decimal) -> str:
        return f"{total_amount:.2f}"

    model_config = ConfigDict(from_attributes=True)


class PublicDiningSessionServiceRequest(BaseModel):
    request_type: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PublicDiningSessionResponse(BaseModel):
    public_token: str
    status: str
    restaurant_name: str
    restaurant_slug: str
    table_number: str
    table_code: str
    opened_at: datetime
    orders: List[DiningSessionOrderSummary]
    combined_subtotal: Decimal
    order_count: int
    service_requests_enabled: bool
    can_order_more: bool
    bill: Optional[PublicDiningSessionBillSummary] = None
    service_requests: List[PublicDiningSessionServiceRequest] = []

    @field_serializer("combined_subtotal")
    def serialize_combined_subtotal(self, subtotal: Decimal) -> str:
        return f"{subtotal:.2f}"

    model_config = ConfigDict(from_attributes=True)
