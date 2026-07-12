from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StaffAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=3, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    role: str
    temporary_password: str = Field(..., min_length=8, max_length=256)


class StaffAccountUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None


class StaffPasswordReset(BaseModel):
    temporary_password: str = Field(..., min_length=8, max_length=256)


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
    email: str
    role: str
    status: str
    is_active: bool
    must_change_password: bool
    last_active_at: Optional[datetime]
    created_at: datetime
    added_by_staff_id: Optional[int]
    active_session_count: int
    sessions: List[StaffSessionResponse] = []
