from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Download(Base):
    __tablename__ = "downloads"

    hash: Mapped[str] = mapped_column(String, primary_key=True)    # torrent hash from qBittorrent
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    grab_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("grabs.id"), unique=True, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String, nullable=True)
    added_to_client_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    import_completed_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    save_path: Mapped[str | None] = mapped_column(String, nullable=True)
    total_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    dangerous_files: Mapped[int] = mapped_column(Integer, default=0)  # 0=unchecked, 1=clean, 2=blocked
    stall_strikes: Mapped[int] = mapped_column(Integer, default=0)
    last_check: Mapped[float | None] = mapped_column(Float, nullable=True)
    deleted_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    manual_override: Mapped[bool] = mapped_column(Boolean, default=False)
    replaced_by_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    replaces_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    upgraded_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    availability_zero_since: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_below_threshold_since: Mapped[float | None] = mapped_column(Float, nullable=True)
    ignored: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)