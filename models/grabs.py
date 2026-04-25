from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Grab(Base):
    __tablename__ = "grabs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    release_title: Mapped[str] = mapped_column(String, nullable=False)
    arr_name: Mapped[str] = mapped_column(String, nullable=False)   # sonarr, radarr, lidarr
    grabbed_at: Mapped[float] = mapped_column(Float, nullable=False)  # Unix timestamp
    media_id: Mapped[str | None] = mapped_column(String, nullable=True)                  # episodeId, movieId, albumId
    media_type: Mapped[str | None] = mapped_column(String, nullable=True)                # episode, movie, album
    indexer: Mapped[str | None] = mapped_column(String, nullable=True)
    quality: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)                     # bytes
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)                 # JSON for debugging
    client_id: Mapped[str | None] = mapped_column(String, nullable=True)  # support for multiple ARR of the same type
    arr_id: Mapped[str | None] = mapped_column(String, nullable=True)