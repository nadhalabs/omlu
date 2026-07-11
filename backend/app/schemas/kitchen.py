from pydantic import BaseModel, ConfigDict, Field, field_serializer
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from app.schemas.order import OrderStatusHistoryResponse

class KitchenOrderItemResponse(BaseModel):
    item_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    item_note: Optional[str] = None

    @field_serializer("unit_price")
    def serialize_unit_price(self, price: Decimal) -> str:
        return f"{price:.2f}"

    @field_serializer("total_price")
    def serialize_total_price(self, price: Decimal) -> str:
        return f"{price:.2f}"

    model_config = ConfigDict(from_attributes=True)

class KitchenOrderResponse(BaseModel):
    order_number: str
    public_token: str
    table_number: str
    status: str
    subtotal: Decimal
    customer_note: Optional[str] = None
    created_at: datetime
    status_history: List[OrderStatusHistoryResponse]
    items: List[KitchenOrderItemResponse]

    @field_serializer("subtotal")
    def serialize_subtotal(self, subtotal: Decimal) -> str:
        return f"{subtotal:.2f}"

    model_config = ConfigDict(from_attributes=True)

class KitchenStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(accepted|rejected|preparing|ready|served)$")
