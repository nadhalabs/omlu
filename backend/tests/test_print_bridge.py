from decimal import Decimal
import uuid
from datetime import datetime, timedelta, timezone
import pytest

from app.main import app
from app.database import SessionLocal
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.restaurant_table import RestaurantTable
from app.models.print_bridge import PrintBridgeInstallation, PrintBridgePairingChallenge
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.services.print_bridge_service import (
    get_public_key_pem,
    hash_pairing_code,
    issue_action_token,
    validate_bill_for_printing,
    verify_print_bridge_token,
)
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token
from tests.participant_helpers import ParticipantTestClient

client = ParticipantTestClient(app)

@pytest.fixture(scope="module")
def setup_bridge_test_data():
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.slug == "bridge-test-rest").delete()
    db.commit()

    restaurant = Restaurant(name="Bridge Test Rest", slug="bridge-test-rest", is_active=True)
    db.add(restaurant)
    db.commit()

    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Bridge Owner",
        username="bridge_owner",
        password_hash=hash_password("ownerpass"),
        role="owner",
        is_active=True,
    )
    db.add(owner)
    db.commit()

    token = create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"})
    headers = {"Authorization": f"Bearer {token}"}

    data = {
        "restaurant": restaurant,
        "owner": owner,
        "headers": headers,
    }
    yield data

    db.query(StaffUser).filter(StaffUser.username == "bridge_owner").delete()
    db.query(Restaurant).filter(Restaurant.slug == "bridge-test-rest").delete()
    db.commit()
    db.close()


def test_print_bridge_public_key_endpoint(setup_bridge_test_data):
    headers = setup_bridge_test_data["headers"]
    res = client.get("/api/admin/print-bridge/public-key", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["kid"] == "omlu-print-bridge-key-v1"
    assert data["algorithm"] == "Ed25519"
    assert "-----BEGIN PUBLIC KEY-----" in data["public_key_pem"]


def test_pairing_challenge_creation_and_expiration(setup_bridge_test_data):
    headers = setup_bridge_test_data["headers"]
    inst_id = f"inst_exp_{uuid.uuid4().hex[:6]}"

    # 1. Create challenge
    res = client.post(
        "/api/admin/print-bridge/pairing-challenge",
        headers=headers,
        json={"installation_id": inst_id},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "challenge_created"
    code = data["pairing_code"]
    assert len(code) == 6

    # 2. Confirm pairing with correct code
    confirm_res = client.post(
        "/api/admin/print-bridge/confirm-pairing",
        headers=headers,
        json={"installation_id": inst_id, "pairing_code": code},
    )
    assert confirm_res.status_code == 200
    confirm_data = confirm_res.json()
    assert confirm_data["status"] == "success"
    assert confirm_data["exchange_token"].startswith("exch_")

    # 3. Single use: second attempt fails because challenge was consumed
    reuse_res = client.post(
        "/api/admin/print-bridge/confirm-pairing",
        headers=headers,
        json={"installation_id": inst_id, "pairing_code": code},
    )
    assert reuse_res.status_code == 400
    assert "INVALID_PAIRING_CHALLENGE" in reuse_res.json()["detail"]


def test_pairing_challenge_attempt_limit(setup_bridge_test_data):
    headers = setup_bridge_test_data["headers"]
    inst_id = f"inst_limit_{uuid.uuid4().hex[:6]}"

    # 1. Create challenge
    res = client.post(
        "/api/admin/print-bridge/pairing-challenge",
        headers=headers,
        json={"installation_id": inst_id},
    )
    assert res.status_code == 200

    # 2. Fail 3 times with wrong code
    for i in range(1, 4):
        err_res = client.post(
            "/api/admin/print-bridge/confirm-pairing",
            headers=headers,
            json={"installation_id": inst_id, "pairing_code": "000000"},
        )
        assert err_res.status_code == 400
        assert f"Attempt {i}/3" in err_res.json()["detail"]

    # 4th attempt fails as invalid challenge
    fourth_res = client.post(
        "/api/admin/print-bridge/confirm-pairing",
        headers=headers,
        json={"installation_id": inst_id, "pairing_code": "000000"},
    )
    assert fourth_res.status_code == 400
    assert "INVALID_PAIRING_CHALLENGE" in fourth_res.json()["detail"]


def test_exchange_token_redemption():
    # 1. Redeem invalid exchange token
    bad_res = client.post(
        "/api/admin/print-bridge/exchange",
        json={"exchange_token": "exch_fake_123"},
    )
    assert bad_res.status_code == 400
    assert "INVALID_EXCHANGE_TOKEN" in bad_res.json()["detail"]


def test_bill_validation_for_printing(db_session, setup_bridge_test_data):
    tenant_id = setup_bridge_test_data["restaurant"].id

    # Helper to create table and session
    def make_session():
        tbl = RestaurantTable(
            restaurant_id=tenant_id,
            table_number=f"T-{uuid.uuid4().hex[:6]}",
            table_code=f"C-{uuid.uuid4().hex[:6]}",
        )
        db_session.add(tbl)
        db_session.commit()

        s = DiningSession(
            restaurant_id=tenant_id,
            table_id=tbl.id,
            public_token=f"pub_{uuid.uuid4().hex[:12]}",
            status="open",
        )
        db_session.add(s)
        db_session.commit()
        return s

    # 1. Draft bill rejected
    draft_bill = Bill(
        bill_number=f"BILL-DRAFT-{uuid.uuid4().hex[:4]}",
        restaurant_id=tenant_id,
        dining_session_id=make_session().id,
        status="draft",
        subtotal=Decimal("100.0"),
        total_amount=Decimal("100.0"),
    )
    db_session.add(draft_bill)
    db_session.commit()

    with pytest.raises(ValueError, match="DRAFT_BILL_REJECTED"):
        validate_bill_for_printing(db_session, draft_bill.bill_number, str(tenant_id), "bill:print")

    # 2. Non-existent bill rejected
    with pytest.raises(ValueError, match="BILL_NOT_FOUND"):
        validate_bill_for_printing(db_session, "BILL-NONEXISTENT", str(tenant_id), "bill:print")

    # 3. Issued bill allowed for bill:print
    issued_bill = Bill(
        bill_number=f"BILL-ISSUED-{uuid.uuid4().hex[:4]}",
        restaurant_id=tenant_id,
        dining_session_id=make_session().id,
        status="issued",
        subtotal=Decimal("250.0"),
        total_amount=Decimal("250.0"),
    )
    db_session.add(issued_bill)
    db_session.commit()

    validated = validate_bill_for_printing(db_session, issued_bill.bill_number, str(tenant_id), "bill:print")
    assert validated.bill_number == issued_bill.bill_number

    # 4. Paid bill allowed for receipt:reprint
    paid_bill = Bill(
        bill_number=f"BILL-PAID-{uuid.uuid4().hex[:4]}",
        restaurant_id=tenant_id,
        dining_session_id=make_session().id,
        status="paid",
        subtotal=Decimal("300.0"),
        total_amount=Decimal("300.0"),
    )
    db_session.add(paid_bill)
    db_session.commit()

    validated_reprint = validate_bill_for_printing(db_session, paid_bill.bill_number, str(tenant_id), "receipt:reprint")
    assert validated_reprint.bill_number == paid_bill.bill_number


def test_ed25519_token_verification_and_repairing(db_session, setup_bridge_test_data):
    tenant_id = str(setup_bridge_test_data["restaurant"].id)
    inst_id = f"inst_v_{uuid.uuid4().hex[:6]}"

    # Create installation
    inst = PrintBridgeInstallation(
        id=str(uuid.uuid4()),
        installation_id=inst_id,
        tenant_id=tenant_id,
        hashed_credential="hash",
        status="paired",
        paired_by_user_id="user_1",
        credential_version=1,
    )
    db_session.add(inst)
    db_session.commit()

    # Issue token for credential version 1
    token1 = issue_action_token(
        user_id="user_1",
        tenant_id=tenant_id,
        installation_id=inst_id,
        action="printer:test",
        credential_version=1,
    )

    claims = verify_print_bridge_token(
        db=db_session,
        token=token1,
        expected_action="printer:test",
        expected_tenant_id=tenant_id,
        expected_installation_id=inst_id,
    )
    assert claims["action"] == "printer:test"

    # Re-pairing increments credential_version to 2
    inst.credential_version = 2
    db_session.commit()

    # Create fresh token2 with old credential_version = 1 to test version mismatch without JTI replay failure
    token2 = issue_action_token(
        user_id="user_1",
        tenant_id=tenant_id,
        installation_id=inst_id,
        action="printer:test",
        credential_version=1,
    )

    # Token with credential version 1 is now rejected!
    with pytest.raises(ValueError, match="CREDENTIAL_VERSION_MISMATCH"):
        verify_print_bridge_token(
            db=db_session,
            token=token2,
            expected_action="printer:test",
            expected_tenant_id=tenant_id,
            expected_installation_id=inst_id,
        )


def test_revoked_installation_token_rejected(db_session, setup_bridge_test_data):
    tenant_id = str(setup_bridge_test_data["restaurant"].id)
    inst_id = f"inst_rev_{uuid.uuid4().hex[:6]}"

    inst = PrintBridgeInstallation(
        id=str(uuid.uuid4()),
        installation_id=inst_id,
        tenant_id=tenant_id,
        hashed_credential="hash",
        status="revoked",
        paired_by_user_id="user_1",
        credential_version=1,
        revoked_at=datetime.now(timezone.utc),
    )
    db_session.add(inst)
    db_session.commit()

    token = issue_action_token(
        user_id="user_1",
        tenant_id=tenant_id,
        installation_id=inst_id,
        action="printer:configure",
        credential_version=1,
    )

    with pytest.raises(ValueError, match="INSTALLATION_NOT_PAIRED|INSTALLATION_REVOKED"):
        verify_print_bridge_token(
            db=db_session,
            token=token,
            expected_action="printer:configure",
            expected_tenant_id=tenant_id,
            expected_installation_id=inst_id,
        )
