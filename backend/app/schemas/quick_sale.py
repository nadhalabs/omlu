from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator
from app.schemas.order import SelectedOptionRequest
from app.utils.gst import normalize_gstin, normalize_gst_state_code


class QuickSaleItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=50)
    item_note: Optional[str] = Field(default=None, max_length=300)
    selected_options: list[SelectedOptionRequest] = Field(default_factory=list, max_length=30)


class QuickSaleCreate(BaseModel):
    sale_type: Literal["takeaway", "late_entry"]
    items: list[QuickSaleItemCreate] = Field(min_length=1, max_length=100)
    note: Optional[str] = Field(default=None, max_length=1024)
    reason: Optional[str] = Field(default=None, max_length=1024)
    payment_method: Optional[Literal["cash", "upi"]] = None
    customer_tax_type: Optional[Literal["b2c", "b2b"]] = "b2c"
    customer_gstin: Optional[str] = None
    customer_legal_name: Optional[str] = None
    customer_billing_address: Optional[str] = Field(default=None, max_length=1024)
    customer_state_code: Optional[str] = None
    customer_state_name: Optional[str] = None
    place_of_supply_code: Optional[str] = None

    @field_validator("customer_gstin")
    @classmethod
    def validate_customer_gstin(cls, v: Optional[str]) -> Optional[str]:
        return normalize_gstin(v)

    @field_validator("customer_state_code", "place_of_supply_code")
    @classmethod
    def validate_state_code(cls, v: Optional[str]) -> Optional[str]:
        return normalize_gst_state_code(v)

    @field_validator("customer_legal_name", "customer_billing_address", "customer_state_name")
    @classmethod
    def normalize_customer_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None


class QuickSalePayment(BaseModel):
    method: Literal["cash", "upi"]
