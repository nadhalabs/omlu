from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class StaffLoginRequest(BaseModel):
    email: str = Field(..., description="Email of the staff user")
    password: str = Field(..., description="Password of the staff user")
    restaurant_slug: str = Field(..., description="Slug of the restaurant")

class StaffSummaryResponse(BaseModel):
    name: str
    email: str
    role: str
    restaurant_name: str
    restaurant_slug: str

class StaffLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    staff: StaffSummaryResponse

class CurrentStaffResponse(BaseModel):
    name: str
    email: str
    role: str
    restaurant_name: str
    restaurant_slug: str
