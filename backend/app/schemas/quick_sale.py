from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator
from app.schemas.order import SelectedOptionRequest


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
    customer_state_code: Optional[str] = None
    customer_state_name: Optional[str] = None
    place_of_supply_code: Optional[str] = None

    @field_validator("customer_gstin")
    @classmethod
    def validate_customer_gstin(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        normalized = v.strip().upper()
        import re
        if not re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]", normalized):
            raise ValueError("GSTIN must be a valid 15-character GST identification number.")
        return normalized

    @field_validator("customer_state_code", "place_of_supply_code")
    @classmethod
    def validate_state_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        normalized = v.strip()
        import re
        if not re.fullmatch(r"\d{2}", normalized) or not 1 <= int(normalized) <= 38:
            raise ValueError("State code must be a two-digit Indian GST state code.")
        return normalized


class QuickSalePayment(BaseModel):
    method: Literal["cash", "upi"]
