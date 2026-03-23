from fastapi import APIRouter

from app.api.patents import router as patents_router
from app.api.ingest import router as ingest_router

api_router = APIRouter()
api_router.include_router(patents_router, prefix="/patents", tags=["patents"])
api_router.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
