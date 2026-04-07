from fastapi import APIRouter

from app.api.patents import router as patents_router
from app.api.ingest import router as ingest_router
from app.api.search import router as search_router
from app.api.stats import router as stats_router
from app.api.feedback import router as feedback_router

api_router = APIRouter()
api_router.include_router(patents_router, prefix="/patents", tags=["patents"])
api_router.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
api_router.include_router(search_router, prefix="/search", tags=["search"])
api_router.include_router(stats_router, prefix="/stats", tags=["stats"])
api_router.include_router(feedback_router, prefix="/feedback", tags=["feedback"])
