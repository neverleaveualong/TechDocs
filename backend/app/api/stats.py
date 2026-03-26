from fastapi import APIRouter, HTTPException
from pinecone import Pinecone

from app.config import settings

router = APIRouter()


@router.get("/")
async def get_stats():
    """Pinecone 인덱스 통계 + 회사별 수집 현황 (메타데이터 기반)"""
    try:
        pc = Pinecone(api_key=settings.pinecone_api_key)
        index = pc.Index(settings.pinecone_index_name)
        stats = index.describe_index_stats()

        total_vectors = stats.get("total_vector_count", 0)
        dimension = stats.get("dimension", 0)

        # 벡터 ID 목록 → 메타데이터 fetch → 회사별 집계
        companies = {}
        if total_vectors > 0:
            # 모든 벡터 ID 수집 (페이지네이션)
            all_ids = []
            for ids_chunk in index.list():
                all_ids.extend(ids_chunk)

            # 100개씩 배치로 메타데이터 fetch
            for i in range(0, len(all_ids), 100):
                batch_ids = all_ids[i:i + 100]
                fetched = index.fetch(ids=batch_ids)
                for vec in fetched.get("vectors", {}).values():
                    meta = vec.get("metadata", {})
                    applicant = meta.get("applicant_name", "알 수 없음")
                    app_num = meta.get("application_number", "")

                    if applicant not in companies:
                        companies[applicant] = {
                            "applicant": applicant,
                            "patents": set(),
                            "vectors": 0,
                        }
                    companies[applicant]["vectors"] += 1
                    if app_num:
                        companies[applicant]["patents"].add(app_num)

        # set → count 변환 후 벡터 수 내림차순 정렬
        company_list = [
            {
                "applicant": c["applicant"],
                "patent_count": len(c["patents"]),
                "vector_count": c["vectors"],
            }
            for c in companies.values()
        ]
        company_list.sort(key=lambda x: x["vector_count"], reverse=True)

        return {
            "total_vectors": total_vectors,
            "dimension": dimension,
            "index_name": settings.pinecone_index_name,
            "companies": company_list,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")
