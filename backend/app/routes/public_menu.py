from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory
from app.schemas.public_menu import PublicMenuResponse

router = APIRouter()

@router.get(
    "/public/restaurants/{restaurant_slug}/tables/{table_code}/menu",
    response_model=PublicMenuResponse
)
def get_public_menu(
    restaurant_slug: str,
    table_code: str,
    db: Session = Depends(get_db)
):
    # 1. Find restaurant by slug
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == restaurant_slug
    ).first()

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found"
        )
    
    if not restaurant.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant is inactive"
        )

    # 2. Find table by restaurant_id and table_code
    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == table_code
    ).first()

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )
    
    if not table.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table is inactive"
        )

    # 3. Retrieve active categories and available items, sorted accordingly
    # Use selectinload(MenuCategory.items) as requested
    categories = db.query(MenuCategory).options(
        selectinload(MenuCategory.items)
    ).filter(
        MenuCategory.restaurant_id == restaurant.id,
        MenuCategory.is_active == True
    ).order_by(
        MenuCategory.display_order.asc(),
        MenuCategory.id.asc()
    ).all()

    # Filter and sort menu items for each category
    result_categories = []
    for category in categories:
        # Filter: only available items
        available_items = [item for item in category.items if item.is_available]
        # Sort: display_order asc, id asc
        sorted_items = sorted(
            available_items,
            key=lambda x: (x.display_order, x.id)
        )
        
        result_categories.append({
            "id": category.id,
            "name_en": category.name_en,
            "name_ml": category.name_ml,
            "display_order": category.display_order,
            "items": sorted_items
        })

    return {
        "restaurant": restaurant,
        "table": table,
        "categories": result_categories
    }
