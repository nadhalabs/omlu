from fastapi import FastAPI
from fastapi.testclient import TestClient
from heimdal_sdk import Heimdal

from app.main import app, heimdal


def test_missing_configuration_is_disabled_and_health_still_works():
    assert Heimdal.from_env(environ={}).config.enabled is False

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "checks": {"api": "healthy"}}


def test_repeated_attachment_does_not_duplicate_instrumentation():
    sdk = Heimdal.from_env(
        environ={
            "HEIMDAL_DSN": (
                "http://credential@127.0.0.1:9"
                "?project=00000000-0000-0000-0000-000000000001"
                "&environment=00000000-0000-0000-0000-000000000002"
                "&service=00000000-0000-0000-0000-000000000003"
            ),
        }
    )
    test_app = FastAPI()

    @test_app.get("/normal")
    def normal_response():
        return {"status": "served"}

    sdk.instrument_fastapi(test_app)
    after_first = len(test_app.user_middleware)
    sdk.instrument_fastapi(test_app)

    assert after_first == 1
    assert len(test_app.user_middleware) == after_first

    with TestClient(test_app) as client:
        response = client.get("/normal")

    assert response.status_code == 200
    assert response.json() == {"status": "served"}
