"""Blacklist database model."""

from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Blacklist(Base):
    """Represents a release title that should be blocked from grabs."""

    __tablename__ = "blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    release_title: Mapped[str] = mapped_column(String, nullable=False)
    arr_name: Mapped[str | None] = mapped_column(String, nullable=True)      # NULL = global (all ARRs)
    indexer: Mapped[str | None] = mapped_column(String, nullable=True)
    reason: Mapped[str] = mapped_column(String, nullable=False)              # e.g., malicious_file, stalled, manual
    source: Mapped[str | None] = mapped_column(String, nullable=True)        # watchdog, file_scanner, user, arr_webhook
    blocked_at: Mapped[float] = mapped_column(Float, nullable=False)
    expires_at: Mapped[float | None] = mapped_column(Float, nullable=True)   # NULL = permanent
    grab_id: Mapped[int | None] = mapped_column(Integer, nullable=True)      # optional reference to grabs.id