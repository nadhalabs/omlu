from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from app.schemas.order import OrderItemSelectedOptionResponse


CounterPaymentMethod = Literal["counter_cash", "counter_upi"]


class CounterPaymentRequest(BaseModel):
    method: CounterPaymentMethod


class IssueAndReleaseRequest(BaseModel):
    confirm_table_is_free: bool


class PaymentCodeLookupRequest(BaseModel):
    payment_code: str = Field(min_length=6, max_length=32)

    @field_validator("payment_code")
    @classmethod
    def normalize_and_validate_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        allowed = set("2346789ABCDEFGHJKLMNPQRTUVWXYZ")
        if len(normalized) != 6 or any(character not in allowed for character in normalized):
            raise ValueError("Payment code must be six valid characters.")
        return normalized


class ShortOrderSummary(BaseModel):
    order_count: int
    item_count: int
    items: List[str]


class DetachedPendingBillResponse(BaseModel):
    bill_number: str
    restaurant_name: str
    original_table: str
    original_table_id: int
    session_id: int
    bill_status: str
    session_status: str
    amount_due: Decimal
    currency: str
    issued_at: datetime
    detached_at: datetime
    payment_code_expires_at: datetime

    @field_serializer("amount_due")
    def serialize_amount(self, value: Decimal) -> str:
        return f"{value:.2f}"


class IssueAndReleaseResponse(DetachedPendingBillResponse):
    payment_code: str


class PaymentCodeLookupResponse(DetachedPendingBillResponse):
    waiting_seconds: int
    order_summary: ShortOrderSummary
    can_confirm_payment: bool


class RateLimitErrorResponse(BaseModel):
    detail: str
    retry_after_seconds: int
    request_id: Optional[str] = None


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
    receipt_token: str
    restaurant_name: str
    restaurant_slug: str
    table_number: str
    table_code: str
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
    generated_by_role: Optional[str] = None
    sent_to_counter_by_role: Optional[str] = None
    gst_enabled: bool = False
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    taxable_amount: Optional[Decimal] = None
    gst_rate: Optional[Decimal] = None
    cgst_amount: Optional[Decimal] = None
    sgst_amount: Optional[Decimal] = None
    igst_amount: Optional[Decimal] = None
    tax_mode: Optional[str] = None
    gstin: Optional[str] = None
    legal_business_name: Optional[str] = None
    registered_billing_address: Optional[str] = None
    state_name: Optional[str] = None
    state_code: Optional[str] = None

    @field_serializer(
        "subtotal", "tax_amount", "discount_amount", "total_amount",
        "taxable_amount", "gst_rate", "cgst_amount", "sgst_amount", "igst_amount",
    )
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}" if value is not None else None

    model_config = ConfigDict(from_attributes=True)
