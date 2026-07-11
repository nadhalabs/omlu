from pydantic import BaseModel, ConfigDict, field_serializer
from typing import List, Optional
from decimal import Decimal

class PublicRestaurant(BaseModel):
    id: int
    name: str
    slug: str
    logo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PublicTable(BaseModel):
    id: int
    table_number: str
    table_code: str

    model_config = ConfigDict(from_attributes=True)

class PublicMenuItem(BaseModel):
    id: int
    name_en: str
    name_ml: Optional[str] = None
    description_en: Optional[str] = None
    description_ml: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    is_available: bool
    display_order: int

    @field_serializer("price")
    def serialize_price(self, price: Decimal) -> str:
        return f"{price:.2f}"

    model_config = ConfigDict(from_attributes=True)

class PublicMenuCategory(BaseModel):
    id: int
    name_en: str
    name_ml: Optional[str] = None
    display_order: int
    items: List[PublicMenuItem]

    model_config = ConfigDict(from_attributes=True)

class PublicMenuResponse(BaseModel):
    restaurant: PublicRestaurant
    table: PublicTable
    categories: List[PublicMenuCategory]

    model_config = ConfigDict(from_attributes=True)
