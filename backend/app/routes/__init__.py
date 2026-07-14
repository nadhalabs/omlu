from app.routes.public_menu import router as public_menu_router
from app.routes.orders import router as orders_router
from app.routes.kitchen import router as kitchen_router
from app.routes.auth import router as auth_router
from app.routes.admin import router as admin_router
from app.routes.service_request import router as service_request_router
from app.routes.dashboard import router as dashboard_router
from app.routes.settings import router as settings_router
from app.routes.health import router as health_router
from app.routes.bills import router as bills_router
from app.routes.sessions import router as sessions_router
from app.routes.staff_management import router as staff_management_router
from app.routes.registration import router as registration_router
from app.routes.history import router as history_router
from app.routes.menu_options import router as menu_options_router
from app.routes.realtime import router as realtime_router
from app.routes.staff_tables import router as staff_tables_router
from app.routes.push import router as push_router

__all__ = [
    "public_menu_router",
    "orders_router",
    "kitchen_router",
    "auth_router",
    "admin_router",
    "service_request_router",
    "dashboard_router",
    "settings_router",
    "health_router",
    "bills_router",
    "sessions_router",
    "staff_management_router",
    "registration_router",
    "history_router",
    "menu_options_router",
    "realtime_router",
    "staff_tables_router",
    "push_router",
]
