from pydantic import BaseModel, Field, field_validator, model_validator
import re


USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _is_strong_password(password: str) -> bool:
    return (
        len(password) >= 10
        and any(ch.islower() for ch in password)
        and any(ch.isupper() for ch in password)
        and any(ch.isdigit() for ch in password)
        and any(not ch.isalnum() for ch in password)
    )


class RestaurantRegistrationRequest(BaseModel):
    restaurant_name: str = Field(..., min_length=2, max_length=255)
    restaurant_slug: str = Field(..., min_length=3, max_length=64)
    contact_email: str = Field(..., min_length=5, max_length=255)
    phone_number: str = Field(..., min_length=5, max_length=50)
    city: str = Field(..., min_length=2, max_length=100)
    owner_full_name: str = Field(..., min_length=2, max_length=255)
    owner_username: str = Field(..., min_length=3, max_length=64)
    owner_email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=10, max_length=256)
    confirm_password: str = Field(..., min_length=10, max_length=256)
    accept_terms: bool

    @field_validator(
        "restaurant_name",
        "restaurant_slug",
        "phone_number",
        "city",
        "owner_full_name",
        "owner_username",
        "contact_email",
        "owner_email",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("contact_email", "owner_email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise ValueError("Enter a valid email address")
        return normalized

    @field_validator("restaurant_slug", "owner_username")
    @classmethod
    def validate_username_shape(cls, value: str) -> str:
        if value != value.lower() or not USERNAME_PATTERN.match(value):
            raise ValueError("Use lowercase letters, numbers, hyphens, or underscores only")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not _is_strong_password(value):
            raise ValueError("Password must be at least 10 characters and include uppercase, lowercase, number, and symbol")
        return value

    @model_validator(mode="after")
    def validate_confirmation_and_terms(self):
        if self.password != self.confirm_password:
            raise ValueError("Confirm password must match password")
        if not self.accept_terms:
            raise ValueError("Terms must be accepted")
        return self


class RestaurantRegistrationResponse(BaseModel):
    success: bool
    restaurant_slug: str
    next_path: str = "/admin/setup"
