from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

# Use the pg8000 driver explicitly — SQLAlchemy defaults a bare
# "postgresql://" URL to psycopg2. We use pg8000 instead of psycopg2/psycopg
# because it's pure Python (no compiled C extension), so it has no wheel-
# availability problem on Vercel's build image, which tracks new CPython
# releases (e.g. 3.14) faster than C-extension packages publish wheels for.
_database_url = settings.database_url
if _database_url.startswith("postgresql://"):
    _database_url = _database_url.replace("postgresql://", "postgresql+pg8000://", 1)

engine = create_engine(_database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
