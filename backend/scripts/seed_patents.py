"""초기 데이터 시딩 스크립트

사용법:
  cd backend
  source .venv/Scripts/activate
  python -m scripts.seed_patents
"""
import asyncio
import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.pipeline import ingest_patents


SEED_COMPANIES = [
    "삼성전자",
    "LG에너지솔루션",
    "현대자동차",
    "SK하이닉스",
    "카카오",
    "네이버",
    "더존비즈온",
]


async def seed():
    total_patents = 0
    total_vectors = 0

    for company in SEED_COMPANIES:
        print(f"\n{'='*50}")
        print(f"수집 중: {company}")
        print(f"{'='*50}")

        result = await ingest_patents(
            applicant=company,
            pages=2,  # 회사당 ~40건
        )

        patents = result.get("patents_collected", 0)
        vectors = result.get("vectors_stored", 0)
        total_patents += patents
        total_vectors += vectors

        print(f"특허 {patents}건 수집 → 벡터 {vectors}건 저장")

    print(f"\n{'='*50}")
    print(f"시딩 완료! 총 특허: {total_patents}건, 총 벡터: {total_vectors}건")
    print(f"{'='*50}")


if __name__ == "__main__":
    asyncio.run(seed())
