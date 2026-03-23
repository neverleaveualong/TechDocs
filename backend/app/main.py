from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import api_router
from app.api.health import router as health_router

app = FastAPI(
    title="TechDocs API",
    description="RAG 기반 특허 문서 AI 검색 API",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(api_router, prefix="/api")
