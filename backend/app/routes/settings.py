from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.settings import RestaurantSettingsResponse, RestaurantSettingsUpdate
from app.utils.auth import RoleChecker, get_current_staff_user
from app.models.staff_user import StaffUser
from app.models.restaurant import Restaurant

router = APIRouter(prefix="/admin/settings")

_owner_only = RoleChecker(["owner"])
_owner_or_manager = RoleChecker(["owner", "admin"])


@router.get("", response_model=RestaurantSettingsResponse)
def get_restaurant_settings(
    current_user: StaffUser = Depends(_owner_or_manager),
    db: Session = Depends(get_db)
):
    """Owner/admin can view restaurant settings."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.id == current_user.restaurant_id
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@router.patch("", response_model=RestaurantSettingsResponse)
def update_restaurant_settings(
    update_data: RestaurantSettingsUpdate,
    current_user: StaffUser = Depends(_owner_only),
    db: Session = Depends(get_db)
):
    """Owner only: update restaurant settings. Manager may only view."""
    restaurant = db.query(Restaurant).filter(
        Restaurant.id == current_user.restaurant_id
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Apply partial updates (only fields provided by the caller)
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(restaurant, field, value)

    db.commit()
    db.refresh(restaurant)
    return restaurant
