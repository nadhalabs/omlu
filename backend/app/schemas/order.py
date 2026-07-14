from pydantic import BaseModel, ConfigDict, Field, field_serializer
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

class SelectedOptionRequest(BaseModel):
    group_id: int
    option_id: int
    quantity: int = Field(default=1, ge=1, le=20)

class OrderItemRequest(BaseModel):
    menu_item_id: int
    quantity: int = Field(..., ge=1, le=50)
    item_note: Optional[str] = Field(None, max_length=300)
    selected_options: List[SelectedOptionRequest] = Field(default_factory=list, max_length=30)

class PublicOrderCreateRequest(BaseModel):
    items: List[OrderItemRequest] = Field(..., min_length=1, max_length=50)
    customer_note: Optional[str] = Field(None, max_length=500)

class OrderItemSelectedOptionResponse(BaseModel):
    option_name: str
    group_name: str
    option_type: str
    price_delta: Decimal
    quantity: int

    @field_serializer("price_delta")
    def serialize_price_delta(self, price: Decimal) -> str:
        return f"{price:.2f}"

    model_config = ConfigDict(from_attributes=True)


class PublicOrderResponseItem(BaseModel):
    menu_item_id: Optional[int] = None
    item_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    item_note: Optional[str] = None
    selected_options: List[OrderItemSelectedOptionResponse] = Field(default_factory=list)

    @field_serializer("unit_price")
    def serialize_unit_price(self, price: Decimal) -> str:
        return f"{price:.2f}"

    @field_serializer("total_price")
    def serialize_total_price(self, price: Decimal) -> str:
        return f"{price:.2f}"

    model_config = ConfigDict(from_attributes=True)

class OrderStatusHistoryResponse(BaseModel):
    old_status: Optional[str] = None
    new_status: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PublicOrderResponse(BaseModel):
    order_number: str
    public_token: str
    status: str
    subtotal: Decimal
    table_number: str
    table_code: Optional[str] = None          # Added for service request routing
    restaurant_name: Optional[str] = None
    restaurant_slug: Optional[str] = None     # Added for service request routing
    created_at: datetime
    customer_note: Optional[str] = None
    items: List[PublicOrderResponseItem]
    status_history: List[OrderStatusHistoryResponse]
    service_requests_enabled: Optional[bool] = True  # Pass through restaurant setting
    dining_session_token: Optional[str] = None
    session_subtotal: Optional[Decimal] = None
    session_order_count: Optional[int] = None
    can_order_more: Optional[bool] = None

    @field_serializer("subtotal")
    def serialize_subtotal(self, subtotal: Decimal) -> str:
        return f"{subtotal:.2f}"

    @field_serializer("session_subtotal")
    def serialize_session_subtotal(self, subtotal: Optional[Decimal]) -> Optional[str]:
        if subtotal is None:
            return None
        return f"{subtotal:.2f}"

    model_config = ConfigDict(from_attributes=True)
