import os
import sys
from sqlalchemy import func, or_
from app.config import settings
from app.database import SessionLocal
from app.models.platform_user import PlatformUser
from app.utils.auth import hash_password

UNSAFE_PLACEHOLDER_PASSWORDS = frozenset({
    "your_strong_unique_password",
    "password",
    "changeme",
    "admin123",
    "platformowner123!",
})

def bootstrap_platform_owner() -> int:
    env = getattr(settings, "app_environment", None) or os.environ.get("APP_ENVIRONMENT", "")
    if env != "production":
        print(f"Error: Platform owner bootstrap requires production environment (current: '{env}').")
        return 1

    raw_email = os.environ.get("PLATFORM_OWNER_EMAIL", "")
    raw_username = os.environ.get("PLATFORM_OWNER_USERNAME", "")
    raw_full_name = os.environ.get("PLATFORM_OWNER_FULL_NAME", "")
    raw_password = os.environ.get("PLATFORM_OWNER_PASSWORD", "")

    email = raw_email.strip().lower()
    username = raw_username.strip()
    full_name = raw_full_name.strip()
    password = raw_password

    if not email:
        print("Error: PLATFORM_OWNER_EMAIL environment variable is missing or empty.")
        return 1

    if not username:
        print("Error: PLATFORM_OWNER_USERNAME environment variable is missing or empty.")
        return 1

    if not password:
        print("Error: PLATFORM_OWNER_PASSWORD environment variable is missing or empty.")
        return 1

    if len(password) < 12:
        print("Error: PLATFORM_OWNER_PASSWORD must be at least 12 characters long.")
        return 1

    if password.strip().lower() in UNSAFE_PLACEHOLDER_PASSWORDS:
        print("Error: PLATFORM_OWNER_PASSWORD cannot use an unsafe default or placeholder password.")
        return 1

    db = SessionLocal()
    try:
        existing = db.query(PlatformUser).filter(
            or_(
                func.lower(PlatformUser.email) == email,
                func.lower(PlatformUser.username) == username.lower()
            )
        ).first()

        if existing:
            print("Platform owner already exists; bootstrap skipped.")
            return 0

        new_owner = PlatformUser(
            email=email,
            username=username,
            full_name=full_name or "Platform Owner",
            password_hash=hash_password(password),
            role="platform_owner",
            status="active",
            is_active=True,
            security_version=0,
        )
        db.add(new_owner)
        db.commit()
        print("Created platform owner successfully.")
        return 0
    except Exception as e:
        db.rollback()
        print(f"Database error during platform owner bootstrap: {type(e).__name__}")
        return 1
    finally:
        db.close()

if __name__ == "__main__":
    sys.exit(bootstrap_platform_owner())
