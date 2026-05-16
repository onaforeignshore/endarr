"""Database session management and initialisation."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker

DATA_DIR = os.getenv("ENDARR_DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "endarr.db")
os.makedirs(DATA_DIR, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()


def init_db() -> None:
    """Create all database tables if they don't already exist."""
    from . import grabs, downloads, torrent_files, blacklist  # noqa
    Base.metadata.create_all(bind=engine)


def get_db():
    """Yield a database session for request handlers.

    Yields:
        A SQLAlchemy session. The session is automatically closed when the
        request context ends.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()