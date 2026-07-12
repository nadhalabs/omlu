import re
from fastapi import HTTPException, status


RESTAURANT_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9]|[-_](?![-_])){1,38}[a-z0-9]$")
PERSONAL_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9]|[._-](?![._-])){1,28}[a-z0-9]$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RESTAURANT_NAME_RE = re.compile(r"^[A-Za-z0-9 '&.-]+$")
CITY_RE = re.compile(r"^[A-Za-z '\-]+$")
OWNER_NAME_RE = re.compile(r"^[A-Za-z '.\-]+$")


def field_error(field: str, message: str, code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> None:
    raise HTTPException(status_code=code, detail={"field": field, "message": message})


def field_value_error(field: str, message: str) -> None:
    raise ValueError(f"{field}|{message}")


def structured_validation_error(error: ValueError) -> HTTPException:
    field, separator, message = str(error).partition("|")
    if separator and field and message:
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": field, "message": message},
        )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"field": "form", "message": str(error)},
    )


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def validate_restaurant_name(value: str, *, as_value_error: bool = False) -> str:
    name = normalize_spaces(value)
    if (
        len(name) < 2
        or len(name) > 100
        or not RESTAURANT_NAME_RE.match(name)
        or not re.search(r"[A-Za-z]", name)
    ):
        if as_value_error:
            field_value_error("restaurant_name", "Enter a valid restaurant name.")
        field_error("restaurant_name", "Enter a valid restaurant name.")
    return name


def validate_restaurant_username(value: str, *, as_value_error: bool = False) -> str:
    username = value.strip().lower()
    if len(username) < 3 or len(username) > 40 or not RESTAURANT_USERNAME_RE.match(username):
        if as_value_error:
            field_value_error("restaurant_username", "Use only lowercase letters, numbers, hyphens, or underscores.")
        field_error("restaurant_username", "Use only lowercase letters, numbers, hyphens, or underscores.")
    return username


def validate_email(value: str, field: str, message: str, *, as_value_error: bool = False) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        if as_value_error:
            field_value_error(field, message)
        field_error(field, message)
    return email


def validate_phone_number(value: str, *, as_value_error: bool = False) -> str:
    raw = value.strip()
    if not raw or re.search(r"[A-Za-z]", raw) or re.search(r"[^0-9+\s]", raw):
        if as_value_error:
            field_value_error("phone_number", "Enter a valid 10-digit phone number.")
        field_error("phone_number", "Enter a valid 10-digit phone number.")
    compact = raw.replace(" ", "")
    if compact.startswith("+91"):
        digits = compact[3:]
    elif compact.startswith("91") and len(compact) == 12:
        digits = compact[2:]
    else:
        digits = compact
    if not re.fullmatch(r"[6-9][0-9]{9}", digits):
        if as_value_error:
            field_value_error("phone_number", "Enter a valid 10-digit phone number.")
        field_error("phone_number", "Enter a valid 10-digit phone number.")
    return f"+91{digits}"


def validate_city(value: str, *, as_value_error: bool = False) -> str:
    city = normalize_spaces(value)
    if len(city) < 2 or len(city) > 80 or not CITY_RE.match(city) or not re.search(r"[A-Za-z]", city):
        if as_value_error:
            field_value_error("city", "Enter a valid city name.")
        field_error("city", "Enter a valid city name.")
    return city


def validate_owner_name(value: str, *, as_value_error: bool = False) -> str:
    name = normalize_spaces(value)
    if len(name) < 2 or len(name) > 100 or not OWNER_NAME_RE.match(name) or not re.search(r"[A-Za-z]", name):
        if as_value_error:
            field_value_error("owner_full_name", "Enter the owner's full name.")
        field_error("owner_full_name", "Enter the owner's full name.")
    return name


def validate_personal_username(value: str, *, field: str = "owner_username", as_value_error: bool = False) -> str:
    username = value.strip().lower()
    if len(username) < 3 or len(username) > 30 or not PERSONAL_USERNAME_RE.match(username):
        if as_value_error:
            field_value_error(field, "Use 3-30 lowercase letters, numbers, periods, underscores, or hyphens.")
        field_error(field, "Use 3-30 lowercase letters, numbers, periods, underscores, or hyphens.")
    return username


def validate_password(
    password: str,
    *,
    field: str = "password",
    restaurant_username: str | None = None,
    personal_username: str | None = None,
) -> str:
    if (
        len(password) < 8
        or len(password) > 128
        or not password.strip()
        or not any(ch.isupper() for ch in password)
        or not any(ch.islower() for ch in password)
        or not any(ch.isdigit() for ch in password)
        or not any(not ch.isalnum() and not ch.isspace() for ch in password)
    ):
        field_error(field, "Password must include uppercase, lowercase, number, and symbol.")
    lowered = password.lower()
    if restaurant_username and lowered == restaurant_username.lower():
        field_error(field, "Password must not match the restaurant username.")
    if personal_username and lowered == personal_username.lower():
        field_error(field, "Password must not match the personal username.")
    return password


def validate_terms(accepted: bool) -> None:
    if not accepted:
        field_error("accept_terms", "You must accept the terms to create the restaurant.")
