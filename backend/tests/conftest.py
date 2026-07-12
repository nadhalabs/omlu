import pytest

from app.routes.auth import reset_login_rate_limit
from app.routes.orders import reset_order_rate_limit
from app.routes.registration import reset_registration_rate_limit
from app.routes.service_request import reset_service_request_rate_limit


@pytest.fixture(autouse=True)
def reset_rate_limits():
    reset_service_request_rate_limit()
    reset_order_rate_limit()
    reset_login_rate_limit()
    reset_registration_rate_limit()
    yield
    reset_service_request_rate_limit()
    reset_order_rate_limit()
    reset_login_rate_limit()
    reset_registration_rate_limit()
