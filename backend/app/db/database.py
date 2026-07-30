from collections.abc import Generator, Iterator
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# 단일 Base 클래스 선언
class Base(DeclarativeBase):
    pass

# PostgreSQL 또는 SQLite 커넥션 엔진
is_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(
    settings.database_url,
    pool_pre_ping=not is_sqlite,
    connect_args={} if is_sqlite else {"connect_timeout": 5},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)

SQLITE_FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS patent_fts USING fts5(
    application_number,
    title,
    abstract,
    applicant_name,
    register_status,
    application_date,
    ipc_number,
    page_content,
    tokenize='unicode61'
);
"""

# API 등에서 사용할 DB 세션 의존성 제공자
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a transaction-scoped session for non-request application work."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_sqlite_fts_table(db_engine) -> None:
    """Create the SQLite FTS table when it does not already exist."""
    from sqlalchemy import text

    with db_engine.begin() as conn:
        conn.execute(text(SQLITE_FTS_SCHEMA))


def init_db():
    # 모델들을 임포트하여 Base.metadata.create_all 이 모든 테이블을 생성할 수 있도록 함
    from app.models.feedback import QueryLog, Feedback
    from app.models.claimlens import ClaimLensPatent, ClaimLensClaim, ClaimLensClaimElement
    from app.models.auto_ingest import AutoIngestCache
    
    Base.metadata.create_all(bind=engine)
    
    # SQLite인 경우 기존 인덱스를 보존하면서 FTS5 테이블을 준비한다.
    if is_sqlite:
        ensure_sqlite_fts_table(engine)
