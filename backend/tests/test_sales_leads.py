from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.sales_lead import SalesLead


client = TestClient(app)


def _payload(phone: str = "+91 98765 43210") -> dict:
    return {
        "name": "Anita Joseph",
        "phone": phone,
        "email": "ANITA@EXAMPLE.COM",
        "restaurant_name": "Anita's Kitchen",
        "city": "Kochi",
        "number_of_outlets": 2,
        "selected_plan": "Standard",
        "request_type": "demo",
    }


def _delete_leads(phone: str = "+919876543210") -> None:
    db = SessionLocal()
    try:
        db.query(SalesLead).filter(SalesLead.phone == phone).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_public_sales_lead_is_validated_normalized_and_stored():
    _delete_leads()
    response = client.post("/public/sales-leads", json=_payload())
    assert response.status_code == 201
    assert response.json() == {"success": True}
    assert "status" not in response.text
    assert "id" not in response.text

    db = SessionLocal()
    try:
        lead = db.query(SalesLead).filter(SalesLead.phone == "+919876543210").one()
        assert lead.name == "Anita Joseph"
        assert lead.email == "anita@example.com"
        assert lead.restaurant_name == "Anita's Kitchen"
        assert lead.city == "Kochi"
        assert lead.number_of_outlets == 2
        assert lead.selected_plan == "Standard"
        assert lead.request_type == "demo"
        assert lead.status == "new"
        assert lead.created_at is not None
        assert lead.updated_at is not None
    finally:
        db.close()
        _delete_leads()


def test_sales_lead_optional_fields_may_be_omitted():
    _delete_leads()
    payload = _payload()
    payload.pop("email")
    payload.pop("number_of_outlets")
    response = client.post("/public/sales-leads", json=payload)
    assert response.status_code == 201
    db = SessionLocal()
    try:
        lead = db.query(SalesLead).filter(SalesLead.phone == "+919876543210").one()
        assert lead.email is None
        assert lead.number_of_outlets is None
    finally:
        db.close()
        _delete_leads()


def test_sales_lead_rejects_invalid_fields_and_unknown_commercial_terms():
    invalid_phone = client.post("/public/sales-leads", json={**_payload(), "phone": "123"})
    assert invalid_phone.status_code == 422

    invalid_plan = client.post("/public/sales-leads", json={**_payload(), "selected_plan": "Imaginary"})
    assert invalid_plan.status_code == 422
    assert invalid_plan.json()["detail"] == {"field": "selected_plan", "message": "Choose an available OMLU plan."}

    invalid_request = client.post("/public/sales-leads", json={**_payload(), "request_type": "activate"})
    assert invalid_request.status_code == 422


def test_sales_lead_submission_is_rate_limited_without_exposing_internals():
    _delete_leads()
    for _ in range(5):
        assert client.post("/public/sales-leads", json=_payload()).status_code == 201
    blocked = client.post("/public/sales-leads", json=_payload())
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Too many requests. Please try again later."
    _delete_leads()
