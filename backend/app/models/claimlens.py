from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ClaimLensPatent(Base):

    __tablename__ = "patents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_number: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text)
    applicant_name: Mapped[str | None] = mapped_column(String(300))
    register_status: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    claims: Mapped[list["ClaimLensClaim"]] = relationship(back_populates="patent")


class ClaimLensClaim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patent_id: Mapped[int] = mapped_column(ForeignKey("patents.id"), nullable=False)
    claim_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    is_independent: Mapped[bool | None] = mapped_column(Boolean)
    parser_confidence: Mapped[float | None] = mapped_column(Float)
    parser_status: Mapped[str | None] = mapped_column(String(50))

    patent: Mapped[ClaimLensPatent] = relationship(back_populates="claims")
    elements: Mapped[list["ClaimLensClaimElement"]] = relationship(back_populates="claim")


class ClaimLensClaimElement(Base):

    __tablename__ = "claim_elements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"), nullable=False)
    element_order: Mapped[int] = mapped_column(Integer, nullable=False)
    element_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_span: Mapped[str | None] = mapped_column(Text)
    parser_confidence: Mapped[float | None] = mapped_column(Float)
    parser_status: Mapped[str | None] = mapped_column(String(50))

    claim: Mapped[ClaimLensClaim] = relationship(back_populates="elements")
