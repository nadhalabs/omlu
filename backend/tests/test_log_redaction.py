import pytest
from app.main import sanitize_path_for_logging

def test_sanitize_path_public_bills():
    raw = "/public/bills/bill_token_secret_xyz123"
    assert sanitize_path_for_logging(raw) == "/public/bills/[REDACTED]"

def test_sanitize_path_public_sessions():
    raw = "/public/sessions/sess_token_secret_456"
    assert sanitize_path_for_logging(raw) == "/public/sessions/[REDACTED]"

def test_sanitize_path_public_session_participant():
    raw = "/public/sessions/sess_token_secret_456/participant"
    assert sanitize_path_for_logging(raw) == "/public/sessions/[REDACTED]/participant"

def test_sanitize_path_public_orders():
    raw = "/public/orders/ord_token_secret_789"
    assert sanitize_path_for_logging(raw) == "/public/orders/[REDACTED]"

def test_sanitize_path_restaurant_bills():
    raw = "/public/restaurants/tasty-bites/bills/receipt_tok_999"
    assert sanitize_path_for_logging(raw) == "/public/restaurants/tasty-bites/bills/[REDACTED]"

def test_sanitize_path_frontend_routes():
    assert sanitize_path_for_logging("/session/secret_token_1") == "/session/[REDACTED]"
    assert sanitize_path_for_logging("/bill/secret_token_2") == "/bill/[REDACTED]"
    assert sanitize_path_for_logging("/order/secret_token_3") == "/order/[REDACTED]"
    assert sanitize_path_for_logging("/complete/secret_token_4") == "/complete/[REDACTED]"

def test_sanitize_path_insensitive_routes_unchanged():
    assert sanitize_path_for_logging("/health/ready") == "/health/ready"
    assert sanitize_path_for_logging("/staff/sessions") == "/staff/sessions"
    assert sanitize_path_for_logging("/api/admin/tables") == "/api/admin/tables"
