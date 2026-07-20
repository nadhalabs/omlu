import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_serializer


class StaffSessionListItem(BaseModel):
    session_token: str
    table_number: str
    status: str
    opened_at: datetime.datetime
    last_activity_at: datetime.datetime
    order_count: int
    combined_subtotal: Decimal
    latest_order_status: Optional[str] = None
    bill_id: Optional[int] = None
    bill_number: Optional[str] = None

    @field_serializer("combined_subtotal")
    def serialize_subtotal(self, v: Decimal) -> str:
        return f"{v:.2f}"

    model_config = ConfigDict(from_attributes=True)


class StaffSessionDetail(BaseModel):
    session_token: str
    table_number: str
    status: str
    opened_at: datetime.datetime
    last_activity_at: datetime.datetime
    closed_at: Optional[datetime.datetime] = None
    order_count: int
    combined_subtotal: Decimal
    latest_order_status: Optional[str] = None
    bill_id: Optional[int] = None
    bill_number: Optional[str] = None

    @field_serializer("combined_subtotal")
    def serialize_subtotal(self, v: Decimal) -> str:
        return f"{v:.2f}"

    model_config = ConfigDict(from_attributes=True)
