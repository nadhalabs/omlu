from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class FoodType(str, Enum):
    VEG = "veg"
    NON_VEG = "non_veg"
    EGG = "egg"
    UNKNOWN = "unknown"


class MenuVariant(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(ge=0)


class ExtractedMenuOption(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    final_price: float | None = Field(default=None, ge=0)
    price_delta: float | None = Field(default=None, ge=0)
    kitchen_display_name: str | None = Field(default=None, max_length=120)
    confidence: float = Field(default=1.0, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_option_pricing(self):
        if self.final_price is not None and self.price_delta is not None:
            raise ValueError("Option cannot specify both final_price and price_delta")
        if self.final_price is None and self.price_delta is None:
            raise ValueError("Option must specify either final_price or price_delta")
        return self


class ExtractedMenuOptionGroup(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["variant", "addon"]
    required: bool = True
    minimum_selections: int = Field(default=1, ge=0)
    maximum_selections: int = Field(default=1, ge=1)
    options: list[ExtractedMenuOption] = Field(default_factory=list)
    confidence: float = Field(default=1.0, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_group_structure(self):
        if not self.options:
            raise ValueError("Option group must contain at least one option")

        if self.type == "variant":
            if not self.required:
                raise ValueError("Variant option groups must be required")
            if self.minimum_selections != 1:
                raise ValueError("Variant option groups must have minimum_selections=1")
            if self.maximum_selections != 1:
                raise ValueError("Variant option groups must have maximum_selections=1")
            for opt in self.options:
                if opt.final_price is None:
                    raise ValueError(f"Variant option '{opt.name}' must specify final_price")
                if opt.price_delta is not None:
                    raise ValueError(f"Variant option '{opt.name}' cannot specify price_delta")
        elif self.type == "addon":
            if self.minimum_selections < 0:
                raise ValueError("minimum_selections cannot be negative")
            if self.maximum_selections < self.minimum_selections:
                raise ValueError("maximum_selections cannot be less than minimum_selections")
            if self.maximum_selections > len(self.options):
                raise ValueError(f"maximum_selections ({self.maximum_selections}) cannot exceed number of options ({len(self.options)})")
            for opt in self.options:
                if opt.price_delta is None:
                    raise ValueError(f"Add-on option '{opt.name}' must specify price_delta")
                if opt.final_price is not None:
                    raise ValueError(f"Add-on option '{opt.name}' cannot specify final_price")
        return self


class ExtractedMenuItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    category: str | None = None
    price: float | None = Field(default=None, ge=0)
    food_type: FoodType = FoodType.UNKNOWN
    option_groups: list[ExtractedMenuOptionGroup] = Field(default_factory=list)
    variants: list[MenuVariant] = Field(default_factory=list)  # Legacy compatibility support
    item_confidence: float = Field(default=1.0, ge=0, le=1)
    category_confidence: float = Field(default=1.0, ge=0, le=1)
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
    option_groups: list[ExtractedMenuOptionGroup] = Field(default_factory=list)
    variants: list[MenuVariant] = Field(default_factory=list)
    warnings: list[str]
    item_confidence: float
    category_confidence: float
    selected: bool
    duplicate: bool = False
    duplicate_action: Literal["skip", "replace", "keep_both"] = "skip"


class MenuImportResponse(BaseModel):
    id: UUID
    status: str
    general_warnings: list[str]
    items: list[DraftItemResponse]


class ConfirmMenuOption(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    final_price: float | None = Field(default=None, ge=0)
    price_delta: float | None = Field(default=None, ge=0)
    kitchen_display_name: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def validate_option_pricing(self):
        if self.final_price is not None and self.price_delta is not None:
            raise ValueError("Option cannot specify both final_price and price_delta")
        if self.final_price is None and self.price_delta is None:
            raise ValueError("Option must specify either final_price or price_delta")
        return self


class ConfirmMenuOptionGroup(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["variant", "addon"]
    required: bool = True
    minimum_selections: int = Field(default=1, ge=0)
    maximum_selections: int = Field(default=1, ge=1)
    options: list[ConfirmMenuOption] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_group_structure(self):
        if not self.options:
            raise ValueError("Option group must contain at least one option")

        if self.type == "variant":
            if not self.required:
                raise ValueError("Variant option groups must be required")
            if self.minimum_selections != 1:
                raise ValueError("Variant option groups must have minimum_selections=1")
            if self.maximum_selections != 1:
                raise ValueError("Variant option groups must have maximum_selections=1")
            for opt in self.options:
                if opt.final_price is None:
                    raise ValueError(f"Variant option '{opt.name}' must specify final_price")
                if opt.price_delta is not None:
                    raise ValueError(f"Variant option '{opt.name}' cannot specify price_delta")
        elif self.type == "addon":
            if self.minimum_selections < 0:
                raise ValueError("minimum_selections cannot be negative")
            if self.maximum_selections < self.minimum_selections:
                raise ValueError("maximum_selections cannot be less than minimum_selections")
            if self.maximum_selections > len(self.options):
                raise ValueError(f"maximum_selections ({self.maximum_selections}) cannot exceed number of options ({len(self.options)})")
            for opt in self.options:
                if opt.price_delta is None:
                    raise ValueError(f"Add-on option '{opt.name}' must specify price_delta")
                if opt.final_price is not None:
                    raise ValueError(f"Add-on option '{opt.name}' cannot specify final_price")
        return self


class ConfirmDraftItem(BaseModel):
    draft_item_id: UUID
    selected: bool = True
    category_name: str | None = None
    item_name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1024)
    price: float | None = Field(default=None, ge=0)
    food_type: FoodType = FoodType.UNKNOWN
    option_groups: list[ConfirmMenuOptionGroup] = Field(default_factory=list)
    variants: list[MenuVariant] = Field(default_factory=list)  # Legacy compatibility support
    duplicate_action: Literal["skip", "replace", "keep_both"] = "skip"


class ConfirmMenuImport(BaseModel):
    items: list[ConfirmDraftItem]
