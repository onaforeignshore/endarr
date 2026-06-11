"""Pending import model for out-of-order download events."""

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class PendingImport(Base):
    """Stores download events that arrived before the torrent was seen in the client."""

    __tablename__ = "pending_imports"

    hash: Mapped[str] = mapped_column(String, primary_key=True)
    import_completed_at: Mapped[float] = mapped_column(Float, nullable=False)
    arr_name: Mapped[str | None] = mapped_column(String, nullable=True)
    media_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)