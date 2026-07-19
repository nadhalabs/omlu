from decimal import Decimal
from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password

def seed_database():
    db = SessionLocal()
    try:
        # Check if demo restaurant already exists
        restaurant = db.query(Restaurant).filter(
            Restaurant.slug == "nadha-demo-cafe"
        ).first()

        if not restaurant:
            print("Creating demo restaurant...")
            restaurant = Restaurant(
                name="Nadha Demo Cafe",
                slug="nadha-demo-cafe",
                logo_url=None,
                is_active=True
            )
            db.add(restaurant)
            db.flush()  # to get restaurant.id

            print("Creating tables...")
            tables = [
                RestaurantTable(restaurant_id=restaurant.id, table_number="1", table_code="T1-DEMO", is_active=True),
                RestaurantTable(restaurant_id=restaurant.id, table_number="2", table_code="T2-DEMO", is_active=True),
                RestaurantTable(restaurant_id=restaurant.id, table_number="3", table_code="T3-DEMO", is_active=True),
                RestaurantTable(restaurant_id=restaurant.id, table_number="4", table_code="T4-DEMO", is_active=True),
                RestaurantTable(restaurant_id=restaurant.id, table_number="5", table_code="T5-DEMO", is_active=True),
            ]
            db.add_all(tables)

            print("Creating menu categories...")
            cat_starters = MenuCategory(
                restaurant_id=restaurant.id,
                name_en="Starters",
                name_ml="സ്റ്റാർട്ടേഴ്സ്",
                display_order=1,
                is_active=True
            )
            cat_mains = MenuCategory(
                restaurant_id=restaurant.id,
                name_en="Main Course",
                name_ml="പ്രധാന വിഭവങ്ങൾ",
                display_order=2,
                is_active=True
            )
            cat_drinks = MenuCategory(
                restaurant_id=restaurant.id,
                name_en="Drinks",
                name_ml="പാനീയങ്ങൾ",
                display_order=3,
                is_active=True
            )
            db.add_all([cat_starters, cat_mains, cat_drinks])
            db.flush()

            print("Creating menu items...")
            menu_items = [
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_starters.id,
                    name_en="Chicken 65",
                    name_ml="ചിക്കൻ 65",
                    description_en="Spicy deep-fried chicken starter",
                    description_ml="മസാലകൾ ചേർത്ത് വറുത്ത കോഴിയിറച്ചി",
                    price=Decimal("160.00"),
                    image_url=None,
                    is_available=True,
                    display_order=1
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_starters.id,
                    name_en="Veg Cutlet",
                    name_ml="വെജ് കട്ലറ്റ്",
                    description_en="Crispy vegetable cutlets",
                    description_ml="മൊരിഞ്ഞ പച്ചക്കറി കട്ലറ്റ്",
                    price=Decimal("80.00"),
                    image_url=None,
                    is_available=True,
                    display_order=2
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_starters.id,
                    name_en="French Fries",
                    name_ml="ഫ്രഞ്ച് ഫ്രൈസ്",
                    description_en="Crispy golden potato fries",
                    description_ml="മൊരിഞ്ഞ ഉരുളക്കിഴങ്ങ് ചിപ്സ്",
                    price=Decimal("100.00"),
                    image_url=None,
                    is_available=True,
                    display_order=3
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_mains.id,
                    name_en="Chicken Biriyani",
                    name_ml="ചിക്കൻ ബിരിയാണി",
                    description_en="Kerala-style chicken biriyani",
                    description_ml="കേരള സ്റ്റൈൽ ചിക്കൻ ബിരിയാണി",
                    price=Decimal("180.00"),
                    image_url=None,
                    is_available=True,
                    display_order=1
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_mains.id,
                    name_en="Beef Biriyani",
                    name_ml="ബീഫ് ബിരിയാണി",
                    description_en="Spicy Malabar style beef biriyani",
                    description_ml="നല്ല മസാല ചേർത്ത മലബാർ ബീഫ് ബിരിയാണി",
                    price=Decimal("190.00"),
                    image_url=None,
                    is_available=True,
                    display_order=2
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_mains.id,
                    name_en="Veg Fried Rice",
                    name_ml="വെജ് ഫ്രൈഡ് റൈസ്",
                    description_en="Healthy vegetable fried rice",
                    description_ml="പച്ചക്കറികൾ ചേർത്ത ഫ്രൈഡ് റൈസ്",
                    price=Decimal("130.00"),
                    image_url=None,
                    is_available=True,
                    display_order=3
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_mains.id,
                    name_en="Porotta and Chicken Curry",
                    name_ml="പൊറോട്ടയും ചിക്കൻ കറിയും",
                    description_en="Flaky porotta served with chicken curry",
                    description_ml="കേരള സ്റ്റൈൽ കോഴിക്കറിയും പൊറോട്ടയും",
                    price=Decimal("150.00"),
                    image_url=None,
                    is_available=True,
                    display_order=4
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_drinks.id,
                    name_en="Lime Juice",
                    name_ml="നാരങ്ങ വെള്ളം",
                    description_en="Freshly squeezed lime juice",
                    description_ml="നല്ല ഫ്രഷ് നാരങ്ങ വെള്ളം",
                    price=Decimal("40.00"),
                    image_url=None,
                    is_available=True,
                    display_order=1
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_drinks.id,
                    name_en="Fresh Lime Soda",
                    name_ml="ഫ്രഷ് ലൈം സോഡ",
                    description_en="Carbonated sweet lime soda",
                    description_ml="ഫ്രഷ് ലൈം സോഡാ മധുരമുള്ളത്",
                    price=Decimal("60.00"),
                    image_url=None,
                    is_available=True,
                    display_order=2
                ),
                MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=cat_drinks.id,
                    name_en="Tea",
                    name_ml="ചായ",
                    description_en="Traditional hot tea",
                    description_ml="ചൂടുള്ള നല്ല ചായ",
                    price=Decimal("20.00"),
                    image_url=None,
                    is_available=True,
                    display_order=3
                ),
            ]
            db.add_all(menu_items)
            db.flush()

        # Bring older demo databases up to the complete pilot dataset as well.
        existing_table_numbers = {
            row[0] for row in db.query(RestaurantTable.table_number).filter(
                RestaurantTable.restaurant_id == restaurant.id
            ).all()
        }
        for number in range(1, 13):
            table_number = str(number)
            if table_number not in existing_table_numbers:
                db.add(RestaurantTable(
                    restaurant_id=restaurant.id,
                    table_number=table_number,
                    table_code=f"T{number}-DEMO",
                    is_active=True,
                ))

        dessert_category = db.query(MenuCategory).filter(
            MenuCategory.restaurant_id == restaurant.id,
            MenuCategory.name_en == "Desserts",
        ).first()
        if not dessert_category:
            dessert_category = MenuCategory(
                restaurant_id=restaurant.id,
                name_en="Desserts",
                name_ml="മധുരപലഹാരങ്ങൾ",
                display_order=4,
                is_active=True,
            )
            db.add(dessert_category)
            db.flush()

        existing_item_names = {
            row[0] for row in db.query(MenuItem.name_en).filter(
                MenuItem.restaurant_id == restaurant.id
            ).all()
        }
        additional_items = [
            ("Paneer Tikka", "പനീർ ടിക്ക", "Char-grilled spiced paneer", "മസാല ചേർത്ത ഗ്രിൽഡ് പനീർ", "180.00"),
            ("Gobi Manchurian", "ഗോബി മഞ്ചൂരിയൻ", "Crispy cauliflower in tangy sauce", "മസാല സോസിലുള്ള കോളിഫ്ലവർ", "140.00"),
            ("Fish Fry", "മീൻ ഫ്രൈ", "Kerala-style spiced fish fry", "കേരള സ്റ്റൈൽ മീൻ ഫ്രൈ", "220.00"),
            ("Egg Fried Rice", "എഗ് ഫ്രൈഡ് റൈസ്", "Wok-tossed rice with egg", "മുട്ട ചേർത്ത ഫ്രൈഡ് റൈസ്", "145.00"),
            ("Chicken Noodles", "ചിക്കൻ നൂഡിൽസ്", "Wok-tossed noodles with chicken", "ചിക്കൻ ചേർത്ത നൂഡിൽസ്", "170.00"),
            ("Kerala Meals", "കേരള സദ്യ", "Rice meal with seasonal curries", "ചോറും കറികളും", "160.00"),
            ("Cold Coffee", "കോൾഡ് കോഫി", "Chilled creamy coffee", "തണുത്ത ക്രീമി കോഫി", "90.00"),
            ("Mango Lassi", "മാംഗോ ലസ്സി", "Yoghurt drink with mango", "മാങ്ങ ചേർത്ത ലസ്സി", "85.00"),
            ("Gulab Jamun", "ഗുലാബ് ജാമുൻ", "Warm milk dumplings in syrup", "പഞ്ചസാര പാനിയിലെ മധുരപലഹാരം", "70.00"),
            ("Ice Cream Sundae", "ഐസ്‌ക്രീം സൺഡേ", "Vanilla sundae with chocolate sauce", "ചോക്ലേറ്റ് സോസോടുകൂടിയ ഐസ്‌ക്രീം", "110.00"),
        ]
        for order, item in enumerate(additional_items, start=1):
            name_en, name_ml, description_en, description_ml, price = item
            if name_en not in existing_item_names:
                db.add(MenuItem(
                    restaurant_id=restaurant.id,
                    category_id=dessert_category.id,
                    name_en=name_en,
                    name_ml=name_ml,
                    description_en=description_en,
                    description_ml=description_ml,
                    price=Decimal(price),
                    image_url=None,
                    is_available=True,
                    display_order=order,
                ))

        # Seed staff users (Idempotent check per email inside nadha-demo-cafe)
        owner_email = "owner@nadhaserve.local"
        kitchen_email = "kitchen@nadhaserve.local"

        owner_user = db.query(StaffUser).filter(
            StaffUser.restaurant_id == restaurant.id,
            StaffUser.email == owner_email
        ).first()

        if not owner_user:
            print("Creating demo owner staff user...")
            db.add(StaffUser(
                restaurant_id=restaurant.id,
                name="Demo Owner",
                email=owner_email,
                password_hash=hash_password("owner123"),
                role="owner",
                is_active=True
            ))

        kitchen_user = db.query(StaffUser).filter(
            StaffUser.restaurant_id == restaurant.id,
            StaffUser.email == kitchen_email
        ).first()

        if not kitchen_user:
            print("Creating demo kitchen staff user...")
            db.add(StaffUser(
                restaurant_id=restaurant.id,
                name="Demo Kitchen Staff",
                email=kitchen_email,
                password_hash=hash_password("kitchen123"),
                role="kitchen",
                is_active=True
            ))

        demo_staff = [
            ("Demo Admin", "admin@nadhaserve.local", "admin123", "admin"),
            ("Demo Waiter", "waiter@nadhaserve.local", "waiter123", "staff"),
            ("Demo Cashier", "cashier@nadhaserve.local", "cashier123", "staff"),
        ]
        for name, email, password, role in demo_staff:
            existing_user = db.query(StaffUser).filter(
                StaffUser.restaurant_id == restaurant.id,
                StaffUser.email == email,
            ).first()
            if not existing_user:
                print(f"Creating demo {name.lower()} user...")
                db.add(StaffUser(
                    restaurant_id=restaurant.id,
                    name=name,
                    email=email,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                ))
            elif existing_user.role != role:
                existing_user.role = role
                existing_user.security_version = (existing_user.security_version or 0) + 1

        db.commit()
        print("Demo database seeding complete!")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
