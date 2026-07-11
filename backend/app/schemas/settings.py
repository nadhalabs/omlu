import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


class RestaurantSettingsResponse(BaseModel):
    timezone: str
    currency: str
    order_prefix: str
    service_requests_enabled: bool

    model_config = ConfigDict(from_attributes=True)


class RestaurantSettingsUpdate(BaseModel):
    timezone: Optional[str] = None
    currency: Optional[str] = None
    order_prefix: Optional[str] = None
    service_requests_enabled: Optional[bool] = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        import zoneinfo
        try:
            zoneinfo.ZoneInfo(v)
        except (zoneinfo.ZoneInfoNotFoundError, KeyError):
            raise ValueError(f"Unknown timezone: {v!r}. Use a valid IANA timezone name like 'Asia/Kolkata'.")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # For MVP: only INR is supported
        allowed = {"INR"}
        if v.upper() not in allowed:
            raise ValueError(f"Currency must be one of: {', '.join(sorted(allowed))}")
        return v.upper()

    @field_validator("order_prefix")
    @classmethod
    def validate_order_prefix(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # 2–6 uppercase alphanumeric characters only, no spaces or punctuation
        if not re.match(r'^[A-Z0-9]{2,6}$', v.upper()):
            raise ValueError(
                "Order prefix must be 2–6 characters, uppercase letters and numbers only (e.g. NS, CAFE, R1)."
            )
        return v.upper()
