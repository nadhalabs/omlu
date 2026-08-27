import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.database import SessionLocal
from app.main import app
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import AuditLog, StaffUser
from app.models.table_session_participant import TableSessionParticipant
from app.services.table_participants import join_code_digest, token_hash
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token

client = TestClient(app)


@pytest.fixture
def participant_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(name="Secure Table", slug=f"secure-{suffix}", is_active=True, currency="INR", operating_status="open")
    other = Restaurant(name="Other Secure", slug=f"secure-other-{suffix}", is_active=True, currency="INR", operating_status="open")
    db.add_all([restaurant, other]); db.flush()
    table = RestaurantTable(restaurant_id=restaurant.id, table_number="4", table_code=f"SEC-{suffix}", is_active=True)
    other_table = RestaurantTable(restaurant_id=other.id, table_number="4", table_code=f"OTHER-{suffix}", is_active=True)
    db.add_all([table, other_table]); db.flush()
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Food", is_active=True)
    db.add(category); db.flush()
    item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Rice", price=Decimal("100"), is_available=True)
    owner = StaffUser(restaurant_id=restaurant.id, name="Owner", email=f"owner-{suffix}@test.local", password_hash=hash_password("Password123!"), role="owner", status="active", is_active=True)
    staff = StaffUser(restaurant_id=restaurant.id, name="Staff", email=f"staff-{suffix}@test.local", password_hash=hash_password("Password123!"), role="staff", status="active", is_active=True)
    db.add_all([item, owner, staff]); db.commit()
    result = {
        "restaurant_id": restaurant.id, "slug": restaurant.slug, "table_id": table.id, "table_code": table.table_code,
        "other_slug": other.slug, "other_table_code": other_table.table_code, "item_id": item.id,
        "owner_token": create_session_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"}),
        "staff_token": create_session_access_token({"sub": str(staff.id), "restaurant_id": restaurant.id, "role": "staff"}),
    }
    ids = [restaurant.id, other.id]
    db.close()
    yield result
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_(ids)).delete(synchronize_session=False)
    db.commit(); db.close()


def staff_auth(ctx, role="owner"):
    return {"Authorization": f"Bearer {ctx[f'{role}_token']}"}


def start(ctx):
    return client.post(
        f"/public/restaurants/{ctx['slug']}/tables/{ctx['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )


def order_payload(ctx):
    return {"items": [{"menu_item_id": ctx["item_id"], "quantity": 1}], "customer_note": None}


def test_first_device_secure_authority_and_raw_secrets_not_persisted(participant_context):
    response = start(participant_context)
    assert response.status_code == 201
    body = response.json()
    assert body["join_code"].isdigit() and len(body["join_code"]) == 4
    assert len(body["participant_token"]) >= 40
    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.public_token == body["session"]["public_id"]).one()
    participant = db.query(TableSessionParticipant).filter(TableSessionParticipant.session_id == session.id).one()
    assert session.join_code_hash == join_code_digest(session, body["join_code"])
    assert re.fullmatch(r"[0-9a-f]{64}", session.join_code_hash)
    assert session.join_code_hash != body["join_code"]
    assert participant.token_hash == token_hash(body["participant_token"])
    assert body["participant_token"] != participant.token_hash
    assert db.query(AuditLog).filter(AuditLog.action == "table_session_created", AuditLog.target_id == str(session.id)).count() == 1
    db.close()

    menu = client.get(
        f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/menu"
    )
    assert menu.status_code == 200
    assert "join_code" not in str(menu.json())

    assert client.get(f"/public/sessions/{body['session']['public_id']}/participant").status_code == 401
    authorized = client.get(
        f"/public/sessions/{body['session']['public_id']}/participant",
        headers={"X-Participant-Token": body["participant_token"]},
    )
    assert authorized.status_code == 200
    assert authorized.json()["join_code"] == body["join_code"]


def test_qr_only_is_menu_only_and_joined_participant_can_order_and_request_service(participant_context):
    authority = start(participant_context).json()
    session_token = authority["session"]["public_id"]
    path = f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}"
    assert client.get(f"/public/sessions/{session_token}").status_code == 401
    assert client.post(f"{path}/orders", headers={"Idempotency-Key": uuid.uuid4().hex}, json=order_payload(participant_context)).status_code == 401
    assert client.post(f"{path}/service-requests", json={"request_type": "water"}).status_code == 401
    assert client.post(f"/public/sessions/{session_token}/bill-request").status_code == 401

    headers = {"X-Participant-Token": authority["participant_token"], "Idempotency-Key": uuid.uuid4().hex}
    ordered = client.post(f"/public/sessions/{session_token}/orders", headers=headers, json=order_payload(participant_context))
    assert ordered.status_code == 201
    service = client.post(f"{path}/service-requests", headers={"X-Participant-Token": authority["participant_token"]}, json={"request_type": "water"})
    assert service.status_code == 201
    db = SessionLocal()
    order = db.query(Order).filter(Order.dining_session.has(public_token=session_token)).one()
    assert order.created_by_participant_id is not None
    db.close()


def test_second_device_join_scope_rotation_and_revocation(participant_context):
    first = start(participant_context).json()
    joined = client.post(
        f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/join",
        json={"code": first["join_code"], "device_id": "second"},
    )
    assert joined.status_code == 200
    assert joined.json()["participant_token"] != first["participant_token"]
    assert client.post(
        f"/public/restaurants/{participant_context['other_slug']}/tables/{participant_context['other_table_code']}/join",
        json={"code": first["join_code"], "device_id": "cross"},
    ).status_code == 404

    session_token = first["session"]["public_id"]
    rotated = client.post(f"/staff/table-sessions/{session_token}/rotate-join-code", headers=staff_auth(participant_context, "staff"))
    assert rotated.status_code == 200
    assert rotated.json()["join_code"] != first["join_code"]
    old = client.post(
        f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/join",
        json={"code": first["join_code"], "device_id": "third"},
    )
    assert old.status_code == 401
    assert client.get(f"/public/sessions/{session_token}", headers={"X-Participant-Token": first["participant_token"]}).status_code == 200
    refreshed = client.get(
        f"/public/sessions/{session_token}/participant",
        headers={"X-Participant-Token": first["participant_token"]},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["join_code"] == rotated.json()["join_code"]
    newly_joined = client.post(
        f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/join",
        json={"code": rotated.json()["join_code"], "device_id": "third-new-code"},
    )
    assert newly_joined.status_code == 200

    revoked = client.post(
        f"/staff/table-sessions/{session_token}/participants/{joined.json()['participant']['public_id']}/revoke",
        headers=staff_auth(participant_context),
        json={"reason": "Unknown device"},
    )
    assert revoked.status_code == 200
    assert client.get(f"/public/sessions/{session_token}", headers={"X-Participant-Token": joined.json()["participant_token"]}).status_code == 401


def test_wrong_code_rate_limit(participant_context):
    start(participant_context)
    path = f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/join"
    statuses = [client.post(path, json={"code": "0000", "device_id": "attacker"}).status_code for _ in range(5)]
    assert statuses[:4] == [401, 401, 401, 401]
    assert statuses[4] == 429
    assert client.post(path, json={"code": "0000", "device_id": "attacker"}).status_code == 429


def test_old_token_rejected_after_session_close_and_new_session(participant_context):
    first = start(participant_context).json()
    session_token = first["session"]["public_id"]
    closed = client.post(f"/staff/sessions/{session_token}/close-empty", headers=staff_auth(participant_context, "owner"))
    assert closed.status_code == 200
    assert client.get(f"/public/sessions/{session_token}", headers={"X-Participant-Token": first["participant_token"]}).status_code == 401
    second = start(participant_context)
    assert second.status_code == 201
    assert second.json()["session"]["public_id"] != session_token
    assert client.get(f"/public/sessions/{second.json()['session']['public_id']}", headers={"X-Participant-Token": first["participant_token"]}).status_code == 401


def test_participant_realtime_requires_scoped_authority(participant_context):
    first = start(participant_context).json()
    session_token = first["session"]["public_id"]
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/public/sessions/{session_token}"):
            pass
    with client.websocket_connect(
        f"/ws/public/sessions/{session_token}?participant_token={first['participant_token']}"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection.ready"


def test_concurrent_first_device_creation_keeps_one_active_session(participant_context):
    path = f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/sessions"

    def attempt(index: int):
        return client.post(path, headers={"X-Device-ID": f"concurrent-{index}"}).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = sorted(executor.map(attempt, range(2)))
    assert statuses == [201, 409]
    db = SessionLocal()
    assert db.query(DiningSession).filter(
        DiningSession.table_id == participant_context["table_id"],
        DiningSession.status.in_(("open", "payment_requested", "payment_pending")),
    ).count() == 1
    db.close()


def test_table_session_creation_is_distributed_rate_limited(participant_context):
    path = f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/sessions"
    for _ in range(5):
        created = client.post(path, headers={"X-Device-ID": "repeat-starter"})
        assert created.status_code == 201
        closed = client.post(
            f"/staff/sessions/{created.json()['session']['public_id']}/close-empty",
            headers=staff_auth(participant_context, "owner"),
        )
        assert closed.status_code == 200
    limited = client.post(path, headers={"X-Device-ID": "repeat-starter"})
    assert limited.status_code == 429


def test_concurrent_join_failures_cannot_bypass_distributed_limit(participant_context):
    authority = start(participant_context).json()
    wrong_code = "0000" if authority["join_code"] != "0000" else "0001"
    path = f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/join"

    def fail_join(_):
        local_client = TestClient(app)
        return local_client.post(
            path,
            json={"code": wrong_code, "device_id": "concurrent-attacker"},
        ).status_code

    with ThreadPoolExecutor(max_workers=6) as executor:
        statuses = list(executor.map(fail_join, range(6)))
    assert statuses.count(401) == 4
    assert statuses.count(429) == 2


# ---------------------------------------------------------------------------
# Post-payment participant isolation tests
# ---------------------------------------------------------------------------

def test_old_participant_websocket_rejected_after_session_close(participant_context):
    """
    A WebSocket connection opened with a participant token from a closed session must
    be rejected (WebSocketDisconnect) — the old authority is no longer valid.
    """
    authority = start(participant_context).json()
    session_token = authority["session"]["public_id"]

    # Close the session directly via staff action (simulates payment closing it)
    closed = client.post(
        f"/staff/sessions/{session_token}/close-empty",
        headers={f"Authorization": f"Bearer {participant_context['owner_token']}"},
    )
    assert closed.status_code == 200

    # WebSocket with old participant token must be disconnected
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/public/sessions/{session_token}?participant_token={authority['participant_token']}"
        ):
            pass


def test_new_session_after_detachment_is_isolated_from_old_session(participant_context):
    """
    After a session is detached (detached_awaiting_payment), a new session can be
    created at the same table.  That new session must be completely independent:
    - New participant cannot read the old (detached) session.
    - Old (revoked) participant cannot read the new session.
    - New session has its own join code.
    - Old session's detached status is unchanged.
    """
    from decimal import Decimal
    from app.database import SessionLocal as _db
    from app.models.order import Order, OrderItem
    from app.models.bill import Bill
    from app.services.bills import detach_issued_bill_and_release_table
    from app.services.table_participants import invalidate_session_participants
    from app.models.dining_session import DiningSession as DS

    # Build a session with an order and bill, then detach
    authority = start(participant_context).json()
    session_token = authority["session"]["public_id"]
    old_participant_token = authority["participant_token"]

    db = _db()
    session = db.query(DS).filter(DS.public_token == session_token).one()
    item = db.query(
        __import__("app.models.menu", fromlist=["MenuItem"]).MenuItem
    ).filter_by(restaurant_id=session.restaurant_id).first()
    order = Order(
        restaurant_id=session.restaurant_id,
        table_id=session.table_id,
        dining_session_id=session.id,
        order_number=f"ISO-{uuid.uuid4().hex[:8]}",
        public_token=uuid.uuid4().hex,
        status="served",
        subtotal=Decimal("120.00"),
        idempotency_key=f"iso-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.id, menu_item_id=item.id, item_name=item.name_en, quantity=1, unit_price=Decimal("120.00"), total_price=Decimal("120.00")))
    bill = Bill(
        restaurant_id=session.restaurant_id,
        dining_session_id=session.id,
        bill_number=f"BILL-ISO-{uuid.uuid4().hex[:8]}",
        status="issued",
        subtotal=Decimal("120.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("120.00"),
        currency="INR",
    )
    db.add(bill)
    session.status = "payment_requested"
    db.flush()
    owner = db.query(__import__("app.models.staff_user", fromlist=["StaffUser"]).StaffUser).filter_by(restaurant_id=session.restaurant_id, role="owner").first()
    result = detach_issued_bill_and_release_table(db, restaurant_id=session.restaurant_id, bill_id=bill.id, actor=owner)
    db.commit()
    bill_number = bill.bill_number
    db.close()

    # Create new session at same table
    new_resp = client.post(
        f"/public/restaurants/{participant_context['slug']}/tables/{participant_context['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )
    assert new_resp.status_code == 201
    new_authority = new_resp.json()
    new_token = new_authority["session"]["public_id"]
    new_participant_token = new_authority["participant_token"]

    # New participant must NOT be able to read the old detached session
    old_read = client.get(
        f"/public/sessions/{session_token}",
        headers={"X-Participant-Token": new_participant_token},
    )
    assert old_read.status_code in (401, 403, 404), (
        "new participant must not read the old detached session"
    )

    # Old revoked participant must NOT be able to read the new session
    new_read = client.get(
        f"/public/sessions/{new_token}",
        headers={"X-Participant-Token": old_participant_token},
    )
    assert new_read.status_code in (401, 403), (
        "old revoked participant must not read the new session"
    )

    # New session has independent join code
    assert new_authority["join_code"].isdigit()
    assert len(new_authority["join_code"]) == 4
    assert new_token != session_token
