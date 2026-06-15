"""Feedback API - user ratings and stats using PostgreSQL ORM"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.db.database import get_db
from app.models.feedback import QueryLog, Feedback
from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    query_log_id: int = Field(..., description="query log ID")
    rating: int = Field(..., description="1=helpful, -1=not helpful")
    comment: Optional[str] = Field(None, description="optional comment")


class FeedbackStats(BaseModel):
    total_queries: int
    total_feedbacks: int
    positive_rate: float
    recent_negative_queries: list


router = APIRouter()


@router.post("")
async def create_feedback(fb: FeedbackCreate, db: Session = Depends(get_db)):
    # 1. 쿼리 로그 존재 확인
    query_log = db.query(QueryLog).filter(QueryLog.id == fb.query_log_id).first()
    if not query_log:
        raise HTTPException(status_code=404, detail="Query log not found")

    # 2. 피드백 생성 및 저장
    feedback = Feedback(
        query_log_id=fb.query_log_id,
        rating=fb.rating,
        comment=fb.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return {
        "id": feedback.id,
        "query_log_id": feedback.query_log_id,
        "rating": feedback.rating,
        "comment": feedback.comment,
        "created_at": feedback.created_at.isoformat() if feedback.created_at else None
    }


@router.get("/stats")
async def get_feedback_stats(db: Session = Depends(get_db)):
    total_queries = db.query(func.count(QueryLog.id)).scalar() or 0
    total_feedbacks = db.query(func.count(Feedback.id)).scalar() or 0

    pos = db.query(func.count(Feedback.id)).filter(Feedback.rating == 1).scalar() or 0
    positive_rate = round(pos / total_feedbacks, 3) if total_feedbacks > 0 else 0.0

    # 평점이 -1인 부정 피드백 및 해당 쿼리 목록 조회
    neg_rows = (
        db.query(Feedback, QueryLog)
        .join(QueryLog, Feedback.query_log_id == QueryLog.id)
        .filter(Feedback.rating == -1)
        .order_by(desc(Feedback.created_at))
        .limit(10)
        .all()
    )

    recent_negative = []
    for fb, ql in neg_rows:
        recent_negative.append({
            "id": ql.id,
            "query": ql.query,
            "answer": ql.answer,
            "feedback_at": fb.created_at.isoformat() if fb.created_at else None
        })

    return {
        "total_queries": total_queries,
        "total_feedbacks": total_feedbacks,
        "positive_rate": positive_rate,
        "recent_negative_queries": recent_negative,
    }
