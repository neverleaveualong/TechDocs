from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AutoIngestCache(Base):
    __tablename__ = "auto_ingest_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    query_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    normalized_query: Mapped[str] = mapped_column(String(500), nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    kipris_calls_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    patents_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    patents_saved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rag_vectors_stored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimlens_patents_saved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agent_vectors_stored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
