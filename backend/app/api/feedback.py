"""Feedback API - user ratings and stats"""

from fastapi import APIRouter, HTTPException
from typing import Optional

from app.db.database import get_connection
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
async def create_feedback(fb: FeedbackCreate):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM query_logs WHERE id = ?", (fb.query_log_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Query log not found")

        cursor = conn.execute(
            "INSERT INTO feedbacks (query_log_id, rating, comment) VALUES (?, ?, ?)",
            (fb.query_log_id, fb.rating, fb.comment),
        )
        conn.commit()

        result = conn.execute(
            "SELECT * FROM feedbacks WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(result)
    finally:
        conn.close()


@router.get("/stats")
async def get_feedback_stats():
    conn = get_connection()
    try:
        total_queries = conn.execute("SELECT COUNT(*) FROM query_logs").fetchone()[0]
        total_feedbacks = conn.execute("SELECT COUNT(*) FROM feedbacks").fetchone()[0]

        pos = conn.execute(
            "SELECT COUNT(*) FROM feedbacks WHERE rating = 1"
        ).fetchone()[0]
        positive_rate = round(pos / total_feedbacks, 3) if total_feedbacks > 0 else 0.0

        neg_rows = conn.execute("""
            SELECT q.id, q.query, q.answer, f.created_at as feedback_at
            FROM feedbacks f
            JOIN query_logs q ON f.query_log_id = q.id
            WHERE f.rating = -1
            ORDER BY f.created_at DESC
            LIMIT 10
        """).fetchall()
        recent_negative = [dict(r) for r in neg_rows]

        return {
            "total_queries": total_queries,
            "total_feedbacks": total_feedbacks,
            "positive_rate": positive_rate,
            "recent_negative_queries": recent_negative,
        }
    finally:
        conn.close()
