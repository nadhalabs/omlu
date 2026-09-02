import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.cinema import CinemaScreen, CinemaSeat, CinemaSeatSession
from app.models.restaurant import Restaurant

CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{0,29}$")


def normalize_code(value: str, field: str = "code") -> str:
    code = value.strip().upper()
    if not CODE_RE.fullmatch(code):
        raise HTTPException(status_code=422, detail=f"Invalid {field}")
    return code


def require_cinema(restaurant: Restaurant) -> Restaurant:
    if not restaurant or not restaurant.is_active or restaurant.venue_type != "cinema":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cinema not found")
    return restaurant


def row_label(index: int) -> str:
    value = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        value = chr(65 + remainder) + value
    return value


def apply_layout(db: Session, screen: CinemaScreen, rows: int, seats_per_row: int, aisles_after: list[int]) -> None:
    existing = {(seat.row_label, seat.seat_number): seat for seat in screen.seats}
    retained = set()
    for row_index in range(rows):
        label = row_label(row_index)
        for seat_number in range(1, seats_per_row + 1):
            key = (label, seat_number)
            retained.add(key)
            seat = existing.get(key)
            if seat is None:
                seat = CinemaSeat(
                    restaurant_id=screen.restaurant_id, cinema_screen_id=screen.id,
                    row_label=label, seat_number=seat_number, public_code=f"{label}{seat_number}",
                    position_index=seat_number - 1,
                    layout_x=(seat_number - 1) * 64,
                    layout_y=row_index * 56,
                )
                db.add(seat)
            if seat.id is None:
                seat.position_index = seat_number - 1
            seat.aisle_after = seat_number in aisles_after
    # Historical identities survive reductions; only deactivate seats outside the shape.
    for key, seat in existing.items():
        if key not in retained:
            seat.is_active = False


def resolve_public_seat(db: Session, slug: str, screen_code: str, seat_code: str):
    restaurant = db.query(Restaurant).filter(Restaurant.slug == slug).first()
    require_cinema(restaurant)
    screen = db.query(CinemaScreen).options(selectinload(CinemaScreen.seats)).filter(
        CinemaScreen.restaurant_id == restaurant.id,
        CinemaScreen.code == normalize_code(screen_code, "screen code"),
        CinemaScreen.is_active.is_(True),
    ).first()
    if not screen:
        raise HTTPException(404, "Cinema screen not found")
    seat = next((value for value in screen.seats if value.public_code == normalize_code(seat_code, "seat code") and value.is_active), None)
    if not seat:
        raise HTTPException(404, "Cinema seat not found")
    return restaurant, screen, seat


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_seat_session(db: Session, restaurant, screen, seat):
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    authority = CinemaSeatSession(
        restaurant_id=restaurant.id, cinema_screen_id=screen.id, cinema_seat_id=seat.id,
        token_hash=token_hash(token), created_at=now, last_activity_at=now, expires_at=now + timedelta(hours=8),
    )
    db.add(authority)
    db.flush()
    return authority, token


def load_authority(db: Session, token: str) -> CinemaSeatSession:
    now = datetime.now(timezone.utc)
    authority = db.query(CinemaSeatSession).options(selectinload(CinemaSeatSession.seat), selectinload(CinemaSeatSession.screen)).filter(
        CinemaSeatSession.token_hash == token_hash(token)
    ).first()
    expires_at = authority.expires_at if authority and authority.expires_at.tzinfo else (authority.expires_at.replace(tzinfo=timezone.utc) if authority else now)
    if not authority or authority.revoked_at or expires_at <= now:
        raise HTTPException(status_code=401, detail="Cinema seat authority is invalid or expired")
    if not authority.seat.is_active or not authority.screen.is_active or authority.seat.cinema_screen_id != authority.screen.id:
        raise HTTPException(status_code=403, detail="Cinema seat is no longer available")
    authority.last_activity_at = now
    return authority
