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
from app.core.vectorstore import delete_all_documents


SEED_COMPANIES = [
    "더존비즈온",
    "삼성전자",
    "에스케이하이닉스",
    "현대자동차",
    "엘지에너지솔루션",
]

START_DATE = "20210101"
END_DATE = "20251231"


async def seed():
    print("기존 데이터 전체 삭제 중...")
    delete_all_documents()

    total_patents = 0
    total_vectors = 0

    for company in SEED_COMPANIES:
        print(f"\n{'='*50}")
        print(f"수집 중: {company} ({START_DATE}~{END_DATE})")
        print(f"{'='*50}")

        result = await ingest_patents(
            applicant=company,
            start_date=START_DATE,
            end_date=END_DATE,
            pages=5,  # 회사당 ~100건
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
