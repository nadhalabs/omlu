from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings


def _normalize_db_url(url: str) -> str:
    """Normalize postgres:// to postgresql:// for SQLAlchemy compatibility with Railway."""
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


_db_url = _normalize_db_url(settings.database_url)

engine = create_engine(
    _db_url,
    pool_pre_ping=True,   # Detect stale connections before use
    pool_recycle=300,     # Recycle connections every 5 minutes
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
