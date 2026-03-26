from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.api.router import api_router
from app.api.health import router as health_router
from app.core.rate_limit import limiter

app = FastAPI(
    title="TechDocs API",
    description="RAG 기반 특허 문서 AI 검색 API",
    version="1.0.0",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "요청 한도 초과. 잠시 후 다시 시도해주세요."},
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
