from pydantic import BaseModel, Field, model_validator

from app.utils.validation import (
    structured_validation_error,
    validate_city,
    validate_email,
    validate_owner_name,
    validate_password,
    validate_personal_username,
    validate_phone_number,
    validate_restaurant_name,
    validate_restaurant_username,
    validate_terms,
)


class RestaurantRegistrationRequest(BaseModel):
    restaurant_name: str = Field(..., min_length=1, max_length=255)
    restaurant_slug: str = Field(..., min_length=1, max_length=255)
    contact_email: str = Field(..., min_length=1, max_length=255)
    phone_number: str = Field(..., min_length=1, max_length=50)
    city: str = Field(..., min_length=1, max_length=255)
    owner_full_name: str = Field(..., min_length=1, max_length=255)
    owner_username: str = Field(..., min_length=1, max_length=255)
    owner_email: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=256)
    confirm_password: str = Field(..., min_length=1, max_length=256)
    accept_terms: bool

    @model_validator(mode="after")
    def validate_registration(self):
        try:
            self.restaurant_name = validate_restaurant_name(self.restaurant_name)
            self.restaurant_slug = validate_restaurant_username(self.restaurant_slug)
            self.contact_email = validate_email(
                self.contact_email,
                "contact_email",
                "Enter a valid contact email address.",
            )
            self.phone_number = validate_phone_number(self.phone_number)
            self.city = validate_city(self.city)
            self.owner_full_name = validate_owner_name(self.owner_full_name)
            self.owner_username = validate_personal_username(self.owner_username)
            self.owner_email = validate_email(
                self.owner_email,
                "owner_email",
                "Enter a valid owner email address.",
            )
            self.password = validate_password(
                self.password,
                restaurant_username=self.restaurant_slug,
                personal_username=self.owner_username,
            )
            if self.password != self.confirm_password:
                raise ValueError("confirm_password|Passwords do not match.")
            validate_terms(self.accept_terms)
        except ValueError as error:
            raise structured_validation_error(error) from error
        return self


class RestaurantRegistrationResponse(BaseModel):
    success: bool
    restaurant_slug: str
    next_path: str = "/admin/setup"
