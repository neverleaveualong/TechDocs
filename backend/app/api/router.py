from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.patents import router as patents_router

api_router = APIRouter()
api_router.include_router(patents_router, prefix="/patents", tags=["patents"])

# health는 /api 밖에서 등록 (main.py에서)
