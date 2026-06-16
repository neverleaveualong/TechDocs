from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# 단일 Base 클래스 선언
class Base(DeclarativeBase):
    pass

# PostgreSQL 커넥션 엔진
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)

# API 등에서 사용할 DB 세션 의존성 제공자
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # 모델들을 임포트하여 Base.metadata.create_all 이 모든 테이블을 생성할 수 있도록 함
    from app.models.feedback import QueryLog, Feedback
    from app.models.claimlens import ClaimLensPatent, ClaimLensClaim, ClaimLensClaimElement
    from app.models.auto_ingest import AutoIngestCache
    
    Base.metadata.create_all(bind=engine)
