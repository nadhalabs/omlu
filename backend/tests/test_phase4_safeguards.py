import pytest
from pathlib import Path
from pydantic import ValidationError

from app.config import Settings
from app.main import app
from tests.participant_helpers import ParticipantTestClient


client = ParticipantTestClient(app)


def production_settings(**overrides):
    values = {
        "app_environment": "production",
        "database_url": "postgresql://omlu:test@db.internal/omlu",
        "frontend_url": "https://admin.omlu.example",
        "public_frontend_url": "https://omlu.example",
        "frontend_urls": "https://admin.omlu.example,https://omlu.example",
        "kitchen_api_key": "kitchen-" + "k" * 32,
        "jwt_secret_key": "jwt-" + "j" * 32,
        "participant_hmac_secret": "participant-" + "p" * 32,
        "redis_url": "rediss://cache.internal:6379/0",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_settings_accept_explicit_safe_infrastructure():
    settings = production_settings()

    assert settings.app_environment == "production"
    assert settings.database_url.startswith("postgresql://")
    assert settings.redis_url.startswith("rediss://")


def test_render_blueprint_provisions_required_participant_secret():
    blueprint = (Path(__file__).resolve().parents[2] / "render.yaml").read_text()

    assert "- key: PARTICIPANT_HMAC_SECRET\n        generateValue: true" in blueprint


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("database_url", "sqlite:///unsafe.db"),
        ("jwt_secret_key", "changeme"),
        ("kitchen_api_key", "secret"),
        ("participant_hmac_secret", None),
        ("redis_url", None),
        ("frontend_url", "http://admin.omlu.example"),
    ],
)
def test_production_settings_reject_unsafe_or_missing_values(field, value):
    with pytest.raises(ValidationError):
        production_settings(**{field: value})


def test_health_and_readiness_report_named_components():
    live = client.get("/health")
    ready = client.get("/health/ready")

    assert live.status_code == 200
    assert live.json() == {"status": "healthy", "checks": {"api": "healthy"}}
    assert ready.status_code == 200
    assert set(ready.json()["checks"]) >= {
        "api",
        "postgresql",
        "redis",
        "realtime",
    }
