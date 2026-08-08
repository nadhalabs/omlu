from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from app.schemas.order import OrderItemSelectedOptionResponse
from app.utils.gst import normalize_gstin


CounterPaymentMethod = Literal["counter_cash", "counter_upi"]


class CustomerGSTDetailsRequest(BaseModel):
    customer_gstin: Optional[str] = Field(max_length=15)
    customer_legal_name: Optional[str] = Field(max_length=255)

    @field_validator("customer_gstin")
    @classmethod
    def validate_customer_gstin(cls, value: Optional[str]) -> Optional[str]:
        return normalize_gstin(value)

    @field_validator("customer_legal_name")
    @classmethod
    def normalize_legal_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CounterPaymentRequest(BaseModel):
    method: CounterPaymentMethod


class BillingReasonRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Reason is required.")
        return normalized


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


class ReceiptItemResponse(BaseModel):
    name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    options: List[str] = Field(default_factory=list)

    @field_serializer("unit_price", "line_total")
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}"


class ReceiptPayloadResponse(BaseModel):
    bill_number: str
    invoice_number: Optional[str] = None
    receipt_title: str
    status: Literal["issued", "payment_pending", "paid"]
    restaurant_name: str
    legal_business_name: str
    address: str
    gstin: Optional[str] = None
    state_name: Optional[str] = None
    state_code: Optional[str] = None
    table_number: str
    staff_name: str
    created_at: datetime
    paid_at: Optional[datetime] = None
    items: List[ReceiptItemResponse]
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    grand_total: Decimal
    currency: str
    gst_enabled: bool
    tax_mode: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Literal["PAID", "UNPAID"]
    is_official_invoice: Literal[True]

    @field_serializer(
        "subtotal", "discount_amount", "taxable_amount", "cgst_amount",
        "sgst_amount", "igst_amount", "tax_amount", "grand_total",
    )
    def serialize_receipt_money(self, value: Decimal) -> str:
        return f"{value:.2f}"


class BillResponse(BaseModel):
    bill_number: str
    receipt_token: Optional[str] = None
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
    customer_tax_type: str = "b2c"
    customer_gstin_snapshot: Optional[str] = None
    customer_legal_name_snapshot: Optional[str] = None
    customer_state_code_snapshot: Optional[str] = None
    customer_state_name_snapshot: Optional[str] = None
    place_of_supply_code_snapshot: Optional[str] = None
    session_status: str
    payment_requested_at: Optional[datetime] = None
    detached_at: Optional[datetime] = None
    payment_code: Optional[str] = None
    payment_code_expires_at: Optional[datetime] = None
    # Explicit bill-ready contract. Legacy fields above remain for existing
    # receipt clients while these names make the detachment response unambiguous.
    amount_due: Optional[Decimal] = None
    original_table: Optional[str] = None
    issued_at: Optional[datetime] = None
    detached_session_status: Optional[str] = None
    receipt_access: Optional[str] = None

    @field_serializer(
        "subtotal", "tax_amount", "discount_amount", "total_amount",
        "taxable_amount", "gst_rate", "cgst_amount", "sgst_amount", "igst_amount", "amount_due",
    )
    def serialize_money(self, value: Decimal) -> str:
        return f"{value:.2f}" if value is not None else None

    model_config = ConfigDict(from_attributes=True)
