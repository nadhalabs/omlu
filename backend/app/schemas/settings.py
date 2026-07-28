import re
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class RestaurantSettingsResponse(BaseModel):
    timezone: str
    currency: str
    order_prefix: str
    service_requests_enabled: bool
    gst_enabled: bool
    gstin: Optional[str] = None
    legal_business_name: Optional[str] = None
    registered_billing_address: Optional[str] = None
    gst_state_name: Optional[str] = None
    gst_state_code: Optional[str] = None
    default_gst_rate: Decimal
    tax_mode: str
    invoice_prefix: str

    model_config = ConfigDict(from_attributes=True)


class RestaurantSettingsUpdate(BaseModel):
    timezone: Optional[str] = None
    currency: Optional[str] = None
    order_prefix: Optional[str] = None
    service_requests_enabled: Optional[bool] = None
    gst_enabled: Optional[bool] = None
    gstin: Optional[str] = None
    legal_business_name: Optional[str] = None
    registered_billing_address: Optional[str] = None
    gst_state_name: Optional[str] = None
    gst_state_code: Optional[str] = None
    default_gst_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    tax_mode: Optional[str] = None
    invoice_prefix: Optional[str] = None

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

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        normalized = v.strip().upper()
        if not re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]", normalized):
            raise ValueError("GSTIN must be a valid 15-character GST identification number.")
        return normalized

    @field_validator("gst_state_code")
    @classmethod
    def validate_state_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        normalized = v.strip()
        if not re.fullmatch(r"\d{2}", normalized) or not 1 <= int(normalized) <= 38:
            raise ValueError("State code must be a two-digit Indian GST state code.")
        return normalized

    @field_validator("tax_mode")
    @classmethod
    def validate_tax_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip().lower()
        if normalized not in {"inclusive", "exclusive"}:
            raise ValueError("Tax mode must be inclusive or exclusive.")
        return normalized

    @field_validator("invoice_prefix")
    @classmethod
    def validate_invoice_prefix(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{1,10}", normalized):
            raise ValueError("Invoice prefix must be 1–10 uppercase letters or numbers.")
        return normalized

    @field_validator("legal_business_name", "registered_billing_address", "gst_state_name")
    @classmethod
    def normalize_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        normalized = v.strip()
        return normalized or None
