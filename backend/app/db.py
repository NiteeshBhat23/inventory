from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

# Use psycopg2 explicitly — SQLAlchemy defaults a bare "postgresql://" URL to
# psycopg2 anyway, but naming it keeps the driver choice obvious.
#
# Driver choice: psycopg2 is a C extension and is roughly an order of magnitude
# faster per round trip than the pure-Python pg8000 this used to run on. The
# original reason for pg8000 was wheel availability on Vercel's build image —
# that is handled now by pinning Python to 3.12 in /.python-version, which is
# both Vercel's default and the newest CPython that psycopg2-binary publishes
# manylinux wheels for. psycopg3 is NOT an option here: Vercel's Python runtime
# still cannot load its binary implementation.
#
# psycopg2 also happens to be the safe driver for Supabase's Supavisor pooler
# in transaction mode (port 6543, the port this app connects on): it does not
# use server-side prepared statements by default, so there is no statement to
# go missing when the pooler hands the next transaction a different backend.
_database_url = settings.database_url
if _database_url.startswith("postgresql://"):
    _database_url = _database_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Pooling is tuned for Vercel Fluid compute, which scales to one rather than to
# zero and keeps a warm instance alive between requests. That makes a real pool
# worth having: opening a fresh pooled connection costs ~1.35s (TCP + TLS +
# Supavisor auth), while reusing a warm one costs nothing. The classic
# "NullPool on serverless" advice targets scale-to-zero platforms where the
# process dies between requests and a pooled connection is pure overhead.
#
# The pool is deliberately tiny — one Fluid instance serves a handful of
# concurrent requests, and the free-tier Supavisor pool is only 15 connections
# wide, so there is no reason to hold more than a couple.
engine = create_engine(
    _database_url,
    pool_size=2,
    max_overflow=3,
    # Supavisor drops idle client connections; recycle well before that so a
    # request never picks up a socket the pooler has already closed.
    pool_recycle=280,
    # Cheap liveness check that turns a would-be 500 on a stale socket into a
    # transparent reconnect.
    pool_pre_ping=True,
    # Don't block a request for more than a few seconds waiting on the pool.
    pool_timeout=10,
    connect_args={
        "connect_timeout": 10,
        # Label connections so they are identifiable in Supabase's dashboard.
        "application_name": "profitpulse-api",
    },
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
