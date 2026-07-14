from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


class MenuOptionResponse(BaseModel):
    id: int
    group_id: int
    name: str
    price_delta: Decimal
    available: bool
    display_order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_serializer("price_delta")
    def serialize_price_delta(self, value: Any) -> str:
        return f"{value:.2f}"

    model_config = ConfigDict(from_attributes=True)


class MenuOptionGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(..., pattern="^(variant|addon)$")
    required: bool = False
    minimum_selections: int = Field(default=0, ge=0)
    maximum_selections: int = Field(default=1, ge=0)
    display_order: int = Field(default=0, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def validate_selection_window(self):
        if self.maximum_selections < self.minimum_selections:
            raise ValueError("maximum_selections must be greater than or equal to minimum_selections")
        if self.type == "variant" and self.maximum_selections > 1:
            raise ValueError("Variant groups can allow only one selection")
        if self.required and self.minimum_selections == 0:
            self.minimum_selections = 1
        return self


class MenuOptionGroupCreate(MenuOptionGroupBase):
    pass


class MenuOptionGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[str] = Field(None, pattern="^(variant|addon)$")
    required: Optional[bool] = None
    minimum_selections: Optional[int] = Field(None, ge=0)
    maximum_selections: Optional[int] = Field(None, ge=0)
    display_order: Optional[int] = Field(None, ge=0)
    active: Optional[bool] = None


class MenuOptionGroupResponse(MenuOptionGroupBase):
    id: int
    restaurant_id: int
    options: List[MenuOptionResponse] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MenuOptionCreate(BaseModel):
    group_id: int
    name: str = Field(..., min_length=1, max_length=255)
    price_delta: Decimal = Field(default=Decimal("0.00"), ge=0)
    available: bool = True
    display_order: int = Field(default=0, ge=0)


class MenuOptionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    price_delta: Optional[Decimal] = Field(None, ge=0)
    available: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)


class MenuOptionAvailabilityUpdate(BaseModel):
    available: bool


class MenuItemOptionGroupAttach(BaseModel):
    option_group_id: int
    display_order: int = Field(default=0, ge=0)
    active: bool = True


class MenuItemOptionGroupResponse(BaseModel):
    id: int
    menu_item_id: int
    option_group_id: int
    display_order: int
    active: bool
    group: MenuOptionGroupResponse

    model_config = ConfigDict(from_attributes=True)
