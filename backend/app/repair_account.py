"""
CLI command to repair any selected OMLU account (owner, admin, staff, kitchen)
by clearing must_change_password and assigning a new valid credential.

Usage:
    python -m app.repair_account --slug <slug> --username <username> [--credential <password_or_pin>]
"""
import argparse
import getpass
import os
import re
import sys

os.environ.setdefault("ENV", "production")

from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.staff_user import AuditLog, StaffSession, StaffUser
from app.utils.auth import hash_password, normalize_identifier, normalize_restaurant_slug


def main():
    parser = argparse.ArgumentParser(
        description="Repair any selected OMLU account by assigning a new credential and clearing must_change_password."
    )
    parser.add_argument("--slug", required=True, help="Restaurant URL slug (e.g. manga-manzil)")
    parser.add_argument("--username", required=True, help="Personal username or email")
    parser.add_argument("--credential", "--password", "--pin", dest="credential", help="New password (owner/admin) or 6-digit PIN (staff/kitchen)")
    args = parser.parse_args()

    slug = normalize_restaurant_slug(args.slug)
    username = normalize_identifier(args.username)
    credential = args.credential

    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == slug).first()
        if not restaurant:
            print(f"  ✗ Restaurant with slug {slug!r} not found.")
            sys.exit(1)

        user = (
            db.query(StaffUser)
            .filter(
                StaffUser.restaurant_id == restaurant.id,
                (StaffUser.username == username) | (StaffUser.email == username),
            )
            .first()
        )
        if not user:
            print(f"  ✗ Account {username!r} not found in restaurant {slug!r}.")
            sys.exit(1)

        is_pin_role = user.role in {"staff", "kitchen"}

        if not credential:
            prompt_label = "6-digit PIN" if is_pin_role else "password (min 8 chars)"
            credential = getpass.getpass(f"Enter new {prompt_label} for {user.name} ({user.role}): ")
            confirm = getpass.getpass(f"Confirm new {prompt_label}: ")
            if credential != confirm:
                print("  ✗ Credentials do not match.")
                sys.exit(1)

        if is_pin_role:
            if not re.match(r"^\d{6}$", credential):
                print("  ✗ Staff/Kitchen PIN must be exactly 6 digits.")
                sys.exit(1)
        else:
            if len(credential) < 8:
                print("  ✗ Owner/Admin password must be at least 8 characters.")
                sys.exit(1)

        # Set new hashed credential, clear must_change_password, bump security version
        user.password_hash = hash_password(credential)
        user.must_change_password = False
        user.security_version = (user.security_version or 0) + 1

        # Revoke existing sessions
        db.query(StaffSession).filter(StaffSession.staff_user_id == user.id).delete()

        # Audit log
        db.add(
            AuditLog(
                restaurant_id=restaurant.id,
                actor_user_id=user.id,
                actor_role=user.role,
                target_type="staff_user",
                target_id=str(user.id),
                action="account_repaired",
                new_value=f"must_change_password=False;role={user.role};security_version={user.security_version}",
            )
        )
        db.commit()

        print(f"\n✓ Account '{user.username}' ({user.role}) for restaurant '{slug}' repaired successfully!")
        print(f"  must_change_password: False")
        print(f"  Sessions revoked: True")

    except Exception as e:
        db.rollback()
        print(f"  ✗ Repair failed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
