from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.order import PublicOrderCreateRequest


class ScreenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=30)
    rows: int = Field(default=1, ge=1, le=30)
    seats_per_row: int = Field(default=1, ge=1, le=50)
    aisles_after: List[int] = Field(default_factory=list)


class ScreenUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=30)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class LayoutUpdate(BaseModel):
    rows: int = Field(ge=1, le=30)
    seats_per_row: int = Field(ge=1, le=50)
    aisles_after: List[int] = Field(default_factory=list)


class SeatUpdate(BaseModel):
    public_code: Optional[str] = Field(None, min_length=1, max_length=30)
    is_active: Optional[bool] = None
    is_accessible: Optional[bool] = None
    aisle_after: Optional[bool] = None


class SeatResponse(BaseModel):
    id: int
    row_label: str
    seat_number: int
    public_code: str
    position_index: int
    aisle_after: bool
    is_active: bool
    is_accessible: bool
    model_config = ConfigDict(from_attributes=True)


class ScreenResponse(BaseModel):
    id: int
    name: str
    code: str
    sort_order: int
    is_active: bool
    seats: List[SeatResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class PublicSeatResponse(BaseModel):
    cinema_name: str
    cinema_slug: str
    screen: ScreenResponse
    seat: SeatResponse
    authority_token: Optional[str] = None
    authority_expires_at: Optional[datetime] = None


class CinemaOrderCreate(PublicOrderCreateRequest):
    pass


class CinemaOrderResponse(BaseModel):
    id: int
    order_number: str
    public_token: str
    status: str
    subtotal: Decimal
    screen_id: int
    screen_name: str
    screen_code: str
    seat_id: int
    seat_code: str
    created_at: datetime
    customer_note: Optional[str] = None
    items: list[dict]


class StatusUpdate(BaseModel):
    status: str

