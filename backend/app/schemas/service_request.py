from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ServiceRequestCreate(BaseModel):
    request_type: str
    public_order_token: Optional[str] = None


class ServiceRequestResponse(BaseModel):
    id: int
    restaurant_id: int
    table_id: int
    order_id: Optional[int]
    dining_session_id: Optional[int] = None
    request_type: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime]
    resolved_by_staff_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class StaffServiceRequestResponse(ServiceRequestResponse):
    """Extended response for staff view - includes table and order info."""
    table_number: Optional[str] = None
    order_number: Optional[str] = None
    dining_session_token: Optional[str] = None
    bill_number: Optional[str] = None
    resolver_name: Optional[str] = None
