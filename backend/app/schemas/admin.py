from pydantic import BaseModel, Field, field_validator, field_serializer, ConfigDict
from typing import Optional, Any
from decimal import Decimal

# --- Categories ---

class CategoryCreate(BaseModel):
    name_en: str = Field(..., min_length=1, max_length=120)
    name_ml: Optional[str] = Field(None, max_length=120)
    display_order: int = Field(default=0, ge=0)
    is_active: bool = True

class CategoryUpdate(BaseModel):
    name_en: Optional[str] = Field(None, min_length=1, max_length=120)
    name_ml: Optional[str] = Field(None, max_length=120)
    display_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None

class CategoryResponse(BaseModel):
    id: int
    name_en: str
    name_ml: Optional[str]
    display_order: int
    is_active: bool
    item_count: int

    model_config = ConfigDict(from_attributes=True)


# --- Menu Items ---

class MenuItemCreate(BaseModel):
    category_id: int
    name_en: str = Field(..., min_length=1, max_length=120)
    name_ml: Optional[str] = Field(None, max_length=120)
    description_en: Optional[str] = Field(None, max_length=1024)
    description_ml: Optional[str] = Field(None, max_length=1024)
    price: Decimal = Field(..., ge=0)
    image_url: Optional[str] = Field(None, max_length=1024)
    is_available: bool = True
    display_order: int = Field(default=0, ge=0)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v_strip = v.strip()
        if v_strip == "":
            return None
        if not (v_strip.startswith("http://") or v_strip.startswith("https://")):
            raise ValueError("Image URL must start with http:// or https://")
        return v_strip

class MenuItemUpdate(BaseModel):
    category_id: Optional[int] = None
    name_en: Optional[str] = Field(None, min_length=1, max_length=120)
    name_ml: Optional[str] = Field(None, max_length=120)
    description_en: Optional[str] = Field(None, max_length=1024)
    description_ml: Optional[str] = Field(None, max_length=1024)
    price: Optional[Decimal] = Field(None, ge=0)
    image_url: Optional[str] = Field(None, max_length=1024)
    is_available: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v_strip = v.strip()
        if v_strip == "":
            return ""  # Empty string to represent clearing image_url
        if not (v_strip.startswith("http://") or v_strip.startswith("https://")):
            raise ValueError("Image URL must start with http:// or https://")
        return v_strip

class MenuItemResponse(BaseModel):
    id: int
    category_id: int
    category_name: str
    name_en: str
    name_ml: Optional[str]
    description_en: Optional[str]
    description_ml: Optional[str]
    price: Decimal
    image_url: Optional[str]
    is_available: bool
    display_order: int

    @field_serializer("price")
    def serialize_price(self, v: Any) -> str:
        return f"{v:.2f}"

    model_config = ConfigDict(from_attributes=True)

class MenuItemAvailabilityUpdate(BaseModel):
    is_available: bool


# --- Tables ---

class TableCreate(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=50)

    @field_validator("table_number")
    @classmethod
    def validate_table_number(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Table number cannot be blank")
        return v.strip()

class TableUpdate(BaseModel):
    table_number: Optional[str] = Field(None, min_length=1, max_length=50)
    is_active: Optional[bool] = None

    @field_validator("table_number")
    @classmethod
    def validate_table_number(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Table number cannot be blank")
        return v.strip()

class TableResponse(BaseModel):
    id: int
    table_number: str
    table_code: str
    is_active: bool
    public_menu_url: str
    qr_code_url: str

    model_config = ConfigDict(from_attributes=True)
