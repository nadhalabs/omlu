import os
import pytest
from sqlalchemy.orm import Session
from app.models.platform_user import PlatformUser
from app.utils.auth import verify_password
from app.config import settings
from app.create_platform_owner import bootstrap_platform_owner

@pytest.fixture
def prod_env(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "production")
    monkeypatch.setenv("APP_ENVIRONMENT", "production")

@pytest.fixture
def valid_owner_vars(monkeypatch):
    monkeypatch.setenv("PLATFORM_OWNER_EMAIL", "nadhalabs@gmail.com")
    monkeypatch.setenv("PLATFORM_OWNER_USERNAME", "nadhalabs")
    monkeypatch.setenv("PLATFORM_OWNER_FULL_NAME", "Nadha Labs")
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "SuperSecureProdPassword123!")

def test_bootstrap_creates_owner_when_valid(prod_env, valid_owner_vars, db_session: Session):
    existing = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").first()
    if existing:
        db_session.delete(existing)
        db_session.commit()

    code = bootstrap_platform_owner()
    assert code == 0

    user = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").first()
    assert user is not None
    assert user.username == "nadhalabs"
    assert user.full_name == "Nadha Labs"
    assert user.role == "platform_owner"
    assert user.status == "active"
    assert user.is_active is True
    assert user.password_hash != "SuperSecureProdPassword123!"
    assert verify_password("SuperSecureProdPassword123!", user.password_hash)

def test_bootstrap_idempotent_no_duplicate(prod_env, valid_owner_vars, db_session: Session):
    code1 = bootstrap_platform_owner()
    assert code1 == 0

    count1 = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").count()
    assert count1 == 1

    code2 = bootstrap_platform_owner()
    assert code2 == 0

    count2 = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").count()
    assert count2 == 1

def test_bootstrap_does_not_overwrite_existing_user(prod_env, valid_owner_vars, monkeypatch, db_session: Session):
    code1 = bootstrap_platform_owner()
    assert code1 == 0

    original_user = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").first()
    original_hash = original_user.password_hash

    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "NewDifferentSecretPassword123!")
    code2 = bootstrap_platform_owner()
    assert code2 == 0

    db_session.expire_all()
    updated_user = db_session.query(PlatformUser).filter(PlatformUser.email == "nadhalabs@gmail.com").first()
    assert updated_user.password_hash == original_hash

def test_bootstrap_missing_password(prod_env, valid_owner_vars, monkeypatch):
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "")
    code = bootstrap_platform_owner()
    assert code == 1

def test_bootstrap_short_password(prod_env, valid_owner_vars, monkeypatch):
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "Short123!")
    code = bootstrap_platform_owner()
    assert code == 1

def test_bootstrap_placeholder_password(prod_env, valid_owner_vars, monkeypatch):
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "PlatformOwner123!")
    code = bootstrap_platform_owner()
    assert code == 1

def test_bootstrap_refuses_outside_production(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "development")
    monkeypatch.setenv("APP_ENVIRONMENT", "development")
    monkeypatch.setenv("PLATFORM_OWNER_EMAIL", "nadhalabs@gmail.com")
    monkeypatch.setenv("PLATFORM_OWNER_USERNAME", "nadhalabs")
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", "SuperSecureProdPassword123!")

    code = bootstrap_platform_owner()
    assert code == 1

def test_bootstrap_no_password_in_captured_output(prod_env, monkeypatch, capsys):
    secret_pass = "SuperSecretPrivatePassword999!"
    monkeypatch.setenv("PLATFORM_OWNER_EMAIL", "output_test@omlu.app")
    monkeypatch.setenv("PLATFORM_OWNER_USERNAME", "output_test")
    monkeypatch.setenv("PLATFORM_OWNER_PASSWORD", secret_pass)

    code = bootstrap_platform_owner()
    assert code == 0

    captured = capsys.readouterr()
    assert secret_pass not in captured.out
    assert secret_pass not in captured.err
