from pydantic import BaseModel, Field

class StaffLoginRequest(BaseModel):
    login: str = Field(..., description="Personal username or email of the staff user")
    password: str = Field(..., description="Password of the staff user")
    restaurant_slug: str = Field(..., description="Restaurant username or slug")

class StaffSummaryResponse(BaseModel):
    name: str
    username: str | None = None
    email: str
    role: str
    status: str
    must_change_password: bool = False
    restaurant_name: str
    restaurant_slug: str

class StaffLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    staff: StaffSummaryResponse


class StaffPasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=256)


class StaffPasswordChangeResponse(StaffLoginResponse):
    pass

class CurrentStaffResponse(BaseModel):
    name: str
    username: str | None = None
    email: str
    role: str
    status: str
    must_change_password: bool = False
    restaurant_name: str
    restaurant_slug: str
