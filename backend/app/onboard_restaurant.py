"""
OMLU Restaurant Onboarding Script.

Usage:
    python -m app.onboard_restaurant [options]

Options:
    --name          Restaurant display name
    --slug          URL slug (lowercase, no spaces, e.g. demo-cafe)
    --owner-name    Owner's full name
    --owner-username Owner's personal username
    --owner-email   Owner's login email
    --tables        Number of tables to create (default: 5)

If any option is omitted, the script will prompt interactively.

Password is prompted via a secure hidden prompt. It is printed ONCE to the operator
and never logged or stored in plain text.

The entire operation is wrapped in a single database transaction.
On failure, all changes are rolled back cleanly.
"""
import argparse
import getpass
import re
import secrets
import sys
import string

# Ensure app environment is available
import os
os.environ.setdefault("ENV", "production")

from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import AuditLog, StaffUser
from app.utils.auth import hash_password, normalize_email, normalize_identifier, normalize_restaurant_slug


def generate_table_code(table_number: str) -> str:
    token = secrets.token_urlsafe(6)
    return f"T{table_number}-{token}"


def validate_slug(slug: str) -> bool:
    return bool(re.match(r'^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$', slug))


def validate_username(username: str) -> bool:
    return bool(re.match(r'^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$', username))


def validate_email(email: str) -> bool:
    return bool(re.match(r'^[^@]+@[^@]+\.[^@]+$', email))


def prompt_if_missing(value, prompt_text: str, validator=None, secret=False):
    """Return value if provided, else prompt the user."""
    while not value:
        if secret:
            value = getpass.getpass(f"{prompt_text}: ")
        else:
            value = input(f"{prompt_text}: ").strip()
        if validator and value and not validator(value):
            print(f"  ✗ Invalid input, please try again.")
            value = None
    return value


def main():
    parser = argparse.ArgumentParser(
        description="Onboard a new restaurant into OMLU"
    )
    parser.add_argument("--name", help="Restaurant display name")
    parser.add_argument("--slug", help="Restaurant URL slug (e.g. demo-cafe)")
    parser.add_argument("--owner-name", help="Owner's full name")
    parser.add_argument("--owner-username", help="Owner's personal username")
    parser.add_argument("--owner-email", help="Owner's login email")
    parser.add_argument("--tables", type=int, default=0, help="Number of tables to create (default: prompted)")
    args = parser.parse_args()

    print("\n=== OMLU Restaurant Onboarding ===\n")

    # Collect all inputs
    name = prompt_if_missing(args.name, "Restaurant name (e.g. Demo Cafe)")
    slug = normalize_restaurant_slug(prompt_if_missing(
        args.slug,
        "Restaurant username/slug (lowercase, hyphens or underscores, e.g. demo-cafe)",
        validator=validate_slug
    ))
    owner_name = prompt_if_missing(args.owner_name, "Owner full name")
    owner_username = normalize_identifier(prompt_if_missing(
        args.owner_username,
        "Owner personal username",
        validator=validate_username,
    ))
    owner_email = normalize_email(prompt_if_missing(
        args.owner_email,
        "Owner email address",
        validator=validate_email
    ))

    num_tables = args.tables
    while num_tables < 1:
        try:
            num_tables = int(input("Number of tables to create (1-50): ").strip())
            if not 1 <= num_tables <= 50:
                print("  ✗ Must be between 1 and 50.")
                num_tables = 0
        except ValueError:
            print("  ✗ Please enter a valid number.")
            num_tables = 0

    # Password: secure hidden prompt, print once only
    print("\n  Enter owner password (min 8 characters):")
    password = None
    while not password:
        if sys.stdin.isatty():
            p1 = getpass.getpass("  Password: ")
        else:
            # Fallback for piped inputs in non-interactive shells
            p1 = sys.stdin.readline().rstrip('\r\n')
            if not p1:
                # If EOF reached
                print("  ✗ Password input EOF reached.")
                sys.exit(1)
        if len(p1) < 8:
            print("  ✗ Password must be at least 8 characters.")
            continue

        if sys.stdin.isatty():
            p2 = getpass.getpass("  Confirm password: ")
        else:
            p2 = sys.stdin.readline().rstrip('\r\n')
            if not p2:
                print("  ✗ Confirm password input EOF reached.")
                sys.exit(1)
        if p1 != p2:
            print("  ✗ Passwords do not match.")
            continue
        password = p1


    print(f"\n  Creating restaurant: {name!r} (slug: {slug!r})")
    print(f"  Owner: {owner_name} ({owner_username}, {owner_email})")
    print(f"  Tables to create: {num_tables}")

    db = SessionLocal()
    try:
        # All-or-nothing: wrap in a single transaction
        try:
            existing = db.query(Restaurant).filter(Restaurant.slug == slug).first()
            if existing:
                raise ValueError(f"A restaurant with slug {slug!r} already exists.")

            # Create restaurant
            restaurant = Restaurant(
                name=name,
                slug=slug,
                is_active=True,
                timezone="Asia/Kolkata",
                currency="INR",
                order_prefix="NS",
                service_requests_enabled=True
            )
            db.add(restaurant)
            db.flush()  # Assigns restaurant.id

            # Hash password before storage; never log or print the hash
            password_hash = hash_password(password)

            # Create owner account
            owner = StaffUser(
                restaurant_id=restaurant.id,
                name=owner_name,
                username=owner_username,
                email=owner_email,
                password_hash=password_hash,
                role="owner",
                status="active",
                is_active=True,
                must_change_password=True,
            )
            db.add(owner)
            db.flush()

            db.add(AuditLog(
                restaurant_id=restaurant.id,
                actor_user_id=owner.id,
                actor_role="owner",
                target_type="restaurant",
                target_id=str(restaurant.id),
                action="restaurant_bootstrapped",
                new_value=f"restaurant={slug};owner={owner_username}",
            ))

            # Create tables with secure unique codes
            tables_created = []
            used_codes = set()
            for i in range(1, num_tables + 1):
                table_number = str(i)
                # Generate unique code with collision retry
                code = None
                for _ in range(5):
                    candidate = generate_table_code(table_number)
                    if candidate not in used_codes:
                        code = candidate
                        used_codes.add(code)
                        break
                if not code:
                    raise RuntimeError(f"Could not generate unique code for table {i}")

                table = RestaurantTable(
                    restaurant_id=restaurant.id,
                    table_number=table_number,
                    table_code=code,
                    is_active=True
                )
                db.add(table)
                tables_created.append((table_number, code))

            db.commit()

        except Exception as e:
            db.rollback()
            print(f"\n✗ ERROR: Onboarding failed. All changes rolled back.")
            print(f"  Reason: {e}")
            sys.exit(1)

        # Success: display results
        public_frontend_url = "http://localhost:3000"
        try:
            from app.config import settings
            public_frontend_url = settings.public_frontend_url.rstrip("/")
        except Exception:
            pass

        print(f"\n{'='*50}")
        print(f"  ✓ Restaurant created successfully!")
        print(f"{'='*50}")
        print(f"\n  Restaurant:  {name}")
        print(f"  Slug:        {slug}")
        print(f"  Staff login: {public_frontend_url}/staff/login")
        print(f"\n  Owner account:")
        print(f"    Email:     {owner_email}")
        print(f"    Password:  {'*' * len(password)}  (shown below ONCE)")
        print(f"\n  ⚠  SAVE THIS PASSWORD NOW - it will not be shown again:")
        print(f"     {password}")
        print(f"\n  Tables created: {num_tables}")
        for table_number, code in tables_created:
            menu_url = f"{public_frontend_url}/menu/{slug}/{code}"
            print(f"    Table {table_number:>3}: {menu_url}")
        print(f"\n  Admin panel: {public_frontend_url}/admin")
        print(f"{'='*50}\n")

    finally:
        db.close()


if __name__ == "__main__":
    main()
