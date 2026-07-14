from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_serializer
from app.schemas.order import OrderItemSelectedOptionResponse


CounterPaymentMethod = Literal["counter_cash", "counter_upi", "counter_card"]


class CounterPaymentRequest(BaseModel):
    method: CounterPaymentMethod


class BillItemResponse(BaseModel):
    item_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    selected_options: List[OrderItemSelectedOptionResponse] = []

    @field_serializer("unit_price", "line_total")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"

    model_config = ConfigDict(from_attributes=True)


class BillOrderResponse(BaseModel):
    order_number: str
    status: str
    subtotal: Decimal
    items: List[BillItemResponse]

    @field_serializer("subtotal")
    def serialize_subtotal(self, value: Decimal) -> str:
        return f"{value:.2f}"

    model_config = ConfigDict(from_attributes=True)


class BillResponse(BaseModel):
    bill_number: str
    restaurant_name: str
    table_number: str
    session_token: str
    status: str
    orders: List[BillOrderResponse]
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    currency: str
    generated_at: datetime
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    paid_by_staff_id: Optional[int] = None

    @field_serializer("subtotal", "tax_amount", "discount_amount", "total_amount")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"

    model_config = ConfigDict(from_attributes=True)
