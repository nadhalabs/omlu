from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StaffAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=3, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    role: str
    temporary_password: Optional[str] = Field(default=None, min_length=6, max_length=256)
    pin: Optional[str] = Field(default=None, max_length=6)
    confirm_pin: Optional[str] = Field(default=None, max_length=6)


class StaffAccountUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None


class StaffLockRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=1024)
    confirm_active_operations: bool = False


class RestaurantStatusRequest(BaseModel):
    status: str


class StaffPasswordReset(BaseModel):
    temporary_password: str = Field(..., min_length=6, max_length=256)


class StaffSessionResponse(BaseModel):
    id: int
    device: Optional[str]
    ip_address: Optional[str]
    login_at: datetime
    last_active_at: datetime
    status: str


class StaffAccountResponse(BaseModel):
    id: int
    name: str
    username: Optional[str]
    email: Optional[str]
    role: str
    status: str
    is_active: bool
    must_change_password: bool
    last_active_at: Optional[datetime]
    created_at: datetime
    added_by_staff_id: Optional[int]
    active_session_count: int
    sessions: List[StaffSessionResponse] = []
    operations_locked: bool = False
    operations_locked_at: Optional[datetime] = None
    operations_locked_by_id: Optional[int] = None
    operations_locked_by_name: Optional[str] = None
    operations_lock_reason: Optional[str] = None


class StaffOperationsResponse(BaseModel):
    locked: bool
    locked_at: Optional[datetime] = None
    locked_by_id: Optional[int] = None
    locked_by_name: Optional[str] = None
    reason: Optional[str] = None
    operating_status: str
    active_sessions: int = 0
    unserved_orders: int = 0
    pending_requests: int = 0
    bills_waiting_for_payment: int = 0
    occupied_tables: int = 0
