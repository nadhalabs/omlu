from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FoodType(str, Enum):
    VEG = "veg"
    NON_VEG = "non_veg"
    EGG = "egg"
    UNKNOWN = "unknown"


class MenuVariant(BaseModel):
    name: str
    price: float


class ExtractedMenuItem(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    price: float | None = None
    food_type: FoodType = FoodType.UNKNOWN
    variants: list[MenuVariant] = Field(default_factory=list)
    item_confidence: float = Field(ge=0, le=1)
    category_confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)


class ExtractedCategory(BaseModel):
    name: str | None = None
    items: list[ExtractedMenuItem]


class MenuExtractionResult(BaseModel):
    categories: list[ExtractedCategory]
    general_warnings: list[str] = Field(default_factory=list)


class DraftItemResponse(BaseModel):
    id: UUID
    category_name: str | None
    item_name: str
    description: str | None
    price: float | None
    food_type: FoodType
    variants: list[MenuVariant]
    warnings: list[str]
    item_confidence: float
    category_confidence: float
    selected: bool
    duplicate: bool = False


class MenuImportResponse(BaseModel):
    id: UUID
    status: str
    general_warnings: list[str]
    items: list[DraftItemResponse]


class ConfirmDraftItem(BaseModel):
    draft_item_id: UUID
    selected: bool = True
    category_name: str | None = None
    item_name: str = Field(min_length=1, max_length=120)
    price: float | None = Field(default=None, ge=0)
    food_type: FoodType = FoodType.UNKNOWN
    variants: list[MenuVariant] = Field(default_factory=list)
    duplicate_action: Literal["skip", "replace", "keep_both"] = "skip"


class ConfirmMenuImport(BaseModel):
    items: list[ConfirmDraftItem]

