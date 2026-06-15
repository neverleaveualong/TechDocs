from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class ClaimLensBase(DeclarativeBase):
    pass


claimlens_engine = create_engine(settings.claimlens_database_url, pool_pre_ping=True)
ClaimLensSessionLocal = sessionmaker(
    bind=claimlens_engine,
    autoflush=False,
    autocommit=False,
)


def get_claimlens_db() -> Generator[Session, None, None]:
    db = ClaimLensSessionLocal()
    try:
        yield db
    finally:
        db.close()
