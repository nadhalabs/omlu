from typing import Literal, Optional
from pydantic import BaseModel, Field


class QuickSaleItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=99)


class QuickSaleCreate(BaseModel):
    sale_type: Literal["takeaway", "late_entry"]
    items: list[QuickSaleItemCreate] = Field(min_length=1, max_length=100)
    note: Optional[str] = Field(default=None, max_length=1024)
    reason: Optional[str] = Field(default=None, max_length=1024)
    payment_method: Optional[Literal["cash", "upi"]] = None
    idempotency_key: str = Field(min_length=8, max_length=255)


class QuickSalePayment(BaseModel):
    method: Literal["cash", "upi"]
