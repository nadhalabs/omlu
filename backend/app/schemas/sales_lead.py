from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.utils.validation import (
    normalize_spaces,
    structured_validation_error,
    validate_city,
    validate_email,
    validate_owner_name,
    validate_phone_number,
    validate_restaurant_name,
)

SUPPORTED_LEAD_PLANS = {"Lite", "Standard", "Pro", "Custom"}


class SalesLeadRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=1, max_length=50)
    email: str | None = Field(default=None, max_length=254)
    restaurant_name: str = Field(..., min_length=1, max_length=100)
    city: str = Field(..., min_length=1, max_length=80)
    number_of_outlets: int | None = Field(default=None, ge=1, le=1000)
    selected_plan: str = Field(..., min_length=1, max_length=50)
    request_type: Literal["demo", "trial"]

    @model_validator(mode="after")
    def validate_lead(self):
        try:
            self.name = validate_owner_name(self.name, as_value_error=True)
            self.phone = validate_phone_number(self.phone, as_value_error=True)
            self.restaurant_name = validate_restaurant_name(self.restaurant_name, as_value_error=True)
            self.city = validate_city(self.city, as_value_error=True)
            self.email = (
                validate_email(self.email, "email", "Enter a valid email address.", as_value_error=True)
                if self.email and self.email.strip()
                else None
            )
            self.selected_plan = normalize_spaces(self.selected_plan)
            if self.selected_plan not in SUPPORTED_LEAD_PLANS:
                raise ValueError("selected_plan|Choose an available OMLU plan.")
        except ValueError as error:
            if str(error).startswith("owner_full_name|"):
                error = ValueError(str(error).replace("owner_full_name|", "name|", 1))
            raise structured_validation_error(error) from error
        return self


class SalesLeadResponse(BaseModel):
    success: bool = True
