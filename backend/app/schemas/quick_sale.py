from typing import Literal, Optional
from pydantic import BaseModel, Field
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


class QuickSalePayment(BaseModel):
    method: Literal["cash", "upi"]
