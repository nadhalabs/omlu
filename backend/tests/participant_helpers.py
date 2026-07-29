import uuid
import re
import threading

from fastapi.testclient import TestClient


class ParticipantTestClient(TestClient):
    """Compatibility client that performs the production secure-start step for legacy customer tests."""

    _table_order = re.compile(r"^/public/restaurants/([^/]+)/tables/([^/]+)/orders$")
    _table_session = re.compile(r"^/public/restaurants/([^/]+)/tables/([^/]+)/session$")
    _session_action = re.compile(r"^/public/sessions/([^/?]+)(?:/.*)?$")

    def __init__(self, app, **kwargs):
        super().__init__(app, **kwargs)
        self._participant_by_table: dict[tuple[str, str], tuple[str, str]] = {}
        self._participant_by_session: dict[str, str] = {}
        self._participant_by_order: dict[str, str] = {}
        self._authority_by_table: dict[tuple[str, str], dict] = {}
        self._authority_lock = threading.Lock()

    def register_authority(self, authority: dict, restaurant_slug: str | None = None, table_code: str | None = None):
        session_token = authority["session"]["public_id"]
        participant_token = authority["participant_token"]
        self._participant_by_session[session_token] = participant_token
        if restaurant_slug and table_code:
            self._participant_by_table[(restaurant_slug, table_code)] = (session_token, participant_token)
            self._authority_by_table[(restaurant_slug, table_code)] = authority

    def join_new_participant(self, restaurant_slug: str, table_code: str):
        authority = self._authority_by_table[(restaurant_slug, table_code)]
        joined = join_active_table_as_participant(
            self, restaurant_slug, table_code, authority["join_code"]
        )
        self.register_authority(joined, restaurant_slug, table_code)
        return joined

    def forget_table_authority(self, restaurant_slug: str, table_code: str):
        self._participant_by_table.pop((restaurant_slug, table_code), None)
        self._authority_by_table.pop((restaurant_slug, table_code), None)

    def clear_participant_authorities(self):
        self._participant_by_table.clear()
        self._participant_by_session.clear()
        self._participant_by_order.clear()
        self._authority_by_table.clear()

    def _ensure_table_authority(self, slug: str, table_code: str):
        key = (slug, table_code)
        with self._authority_lock:
            existing = self._participant_by_table.get(key)
            if existing:
                return existing, None
            started = super().request(
                "POST",
                f"/public/restaurants/{slug}/tables/{table_code}/sessions",
                headers={"X-Device-ID": f"legacy-test-{uuid.uuid4().hex}"},
            )
            if started.status_code != 201:
                return None, started
            authority = started.json()
            self.register_authority(authority, slug, table_code)
            return self._participant_by_table[key], None

    def request(self, method, url, **kwargs):
        path = str(url)
        headers = dict(kwargs.pop("headers", {}) or {})
        table_order = self._table_order.match(path)
        if "X-Participant-Token" not in headers:
            table_session = self._table_session.match(path)
            if table_order or table_session:
                match = table_order or table_session
                authority, failure = self._ensure_table_authority(match.group(1), match.group(2))
                if failure is not None:
                    return failure
                headers["X-Participant-Token"] = authority[1]
            else:
                session_action = self._session_action.match(path)
                if session_action:
                    token = self._participant_by_session.get(session_action.group(1))
                    if token:
                        headers["X-Participant-Token"] = token
        order_match = re.match(r"^/public/orders/([^/?]+)$", path)
        if order_match and "X-Participant-Token" not in headers:
            token = self._participant_by_order.get(order_match.group(1))
            if token:
                headers["X-Participant-Token"] = token
        response = super().request(method, url, headers=headers, **kwargs)
        if table_order and response.status_code == 201:
            body = response.json()
            if body.get("public_token") and headers.get("X-Participant-Token"):
                self._participant_by_order[body["public_token"]] = headers["X-Participant-Token"]
        return response


def participant_headers(token: str, **extra: str) -> dict[str, str]:
    return {"X-Participant-Token": token, **extra}


def start_table_session_with_participant(client, restaurant_slug: str, table_code: str, *, device_id: str | None = None):
    response = client.post(
        f"/public/restaurants/{restaurant_slug}/tables/{table_code}/sessions",
        headers={"X-Device-ID": device_id or f"test-{uuid.uuid4().hex}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def join_active_table_as_participant(
    client,
    restaurant_slug: str,
    table_code: str,
    join_code: str,
    *,
    device_id: str | None = None,
):
    response = client.post(
        f"/public/restaurants/{restaurant_slug}/tables/{table_code}/join",
        json={"code": join_code, "device_id": device_id or f"test-{uuid.uuid4().hex}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def authorize_existing_session(
    client,
    restaurant_slug: str,
    table_code: str,
    session_token: str,
    staff_headers: dict[str, str],
):
    authority = client.get(
        f"/staff/table-sessions/{session_token}/participants",
        headers=staff_headers,
    )
    assert authority.status_code == 200, authority.text
    return join_active_table_as_participant(
        client, restaurant_slug, table_code, authority.json()["join_code"]
    )


def create_customer_order_as_participant(
    client,
    session_token: str,
    participant_token: str,
    payload: dict,
    *,
    idempotency_key: str | None = None,
):
    return client.post(
        f"/public/sessions/{session_token}/orders",
        headers=participant_headers(
            participant_token,
            **{"Idempotency-Key": idempotency_key or f"test-{uuid.uuid4().hex}"},
        ),
        json=payload,
    )


def request_service_as_participant(
    client,
    restaurant_slug: str,
    table_code: str,
    participant_token: str,
    payload: dict,
):
    return client.post(
        f"/public/restaurants/{restaurant_slug}/tables/{table_code}/service-requests",
        headers=participant_headers(participant_token),
        json=payload,
    )


def request_bill_as_participant(client, session_token: str, participant_token: str):
    return client.post(
        f"/public/sessions/{session_token}/bill-request",
        headers=participant_headers(participant_token),
    )


def connect_session_realtime_as_participant(client, session_token: str, participant_token: str):
    return client.websocket_connect(
        f"/ws/public/sessions/{session_token}?participant_token={participant_token}"
    )
