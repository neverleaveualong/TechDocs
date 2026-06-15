import logging
from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.text_splitter import get_text_splitter
from app.core.vectorstore import add_documents
from app.config import settings

# ClaimLens 통합 용도 임포트
from app.db.database import SessionLocal
from app.models.claimlens import ClaimLensPatent, ClaimLensClaim, ClaimLensClaimElement
from app.core.claimlens.claim_parser import parse_claims, normalize_application_number
from app.core.claimlens.vector_search import ClaimLensVectorIndex, ClaimVectorDocument

logger = logging.getLogger(__name__)


async def ingest_patents(
    applicant: str,
    start_date: str = "",
    end_date: str = "",
    pages: int = 5,
) -> dict:
    """통합 인제스트 파이프라인
    
    1. KIPRIS API에서 특허 검색 및 기본 정보 수집
    2. RAG용 LangChain Document 변환 -> 청킹 -> Pinecone(rag_namespace) 적재
    3. 각 특허의 상세 청구항 수집 및 파싱 -> PostgreSQL(patents, claims, claim_elements) 적재
    4. 파싱된 청구항(독립항) 및 구성요소를 임베딩 -> Pinecone(agent_namespace) 적재
    """
    all_patents = []

    # 1. KIPRIS에서 특허 수집
    for page in range(1, pages + 1):
        patents, _ = await kipris_client.search_patents(
            applicant=applicant,
            start_date=start_date,
            end_date=end_date,
            page=page,
        )
        all_patents.extend(patents)

    if not all_patents:
        return {
            "status": "no_data",
            "patents_collected": 0,
            "chunks_created": 0,
            "vectors_stored": 0,
            "claimlens_patents_saved": 0,
        }

    # 2. RAG용 적재 (techdocs-rag namespace)
    documents = patents_to_documents(all_patents)
    text_splitter = get_text_splitter()
    chunks = text_splitter.split_documents(documents)
    rag_count = add_documents(chunks, namespace=settings.rag_namespace)

    # 3. ClaimLens 구조화 정보 적재 (PostgreSQL DB + claimlens-agent namespace)
    claimlens_saved_count = 0
    agent_vector_count = 0
    vector_index = ClaimLensVectorIndex()

    with SessionLocal() as db:
        for p_item in all_patents:
            app_num = p_item.application_number
            if not app_num:
                continue

            try:
                # 3-1. 청구항 정보 비동기 수집
                raw_claims = await kipris_client.get_claims(app_num)
                parsed_claims = parse_claims(raw_claims)
                
                # 3-2. PostgreSQL 특허 마스터 upsert
                norm_app_num = normalize_application_number(app_num)
                patent = (
                    db.query(ClaimLensPatent)
                    .filter(ClaimLensPatent.application_number == app_num)
                    .first()
                )
                if not patent:
                    patent = ClaimLensPatent(
                        application_number=app_num,
                        title=p_item.invention_title,
                        abstract=p_item.abstract,
                        applicant_name=p_item.applicant_name,
                        register_status=p_item.register_status,
                    )
                    db.add(patent)
                    db.flush()
                else:
                    patent.title = p_item.invention_title
                    patent.abstract = p_item.abstract
                    patent.applicant_name = p_item.applicant_name
                    patent.register_status = p_item.register_status
                    db.flush()

                # 기존 청구항 및 구성요소 삭제 (재인제스트 시 중복 방지)
                existing_claims = db.query(ClaimLensClaim).filter(ClaimLensClaim.patent_id == patent.id).all()
                for ec in existing_claims:
                    db.query(ClaimLensClaimElement).filter(ClaimLensClaimElement.claim_id == ec.id).delete()
                db.query(ClaimLensClaim).filter(ClaimLensClaim.patent_id == patent.id).delete()
                db.flush()

                # 3-3. 청구항 & 엘리먼트 DB 적재
                agent_docs: list[ClaimVectorDocument] = []
                
                # 특허 요약 정보도 Agent 벡터에 포함
                if patent.abstract:
                    agent_docs.append(
                        ClaimVectorDocument(
                            id=f"patent:{patent.id}:abstract",
                            text=patent.abstract,
                            metadata={
                                "text_type": "patent_abstract",
                                "patent_id": patent.id,
                                "application_number": patent.application_number,
                                "title": patent.title,
                            }
                        )
                    )

                for parsed in parsed_claims:
                    db_claim = ClaimLensClaim(
                        patent_id=patent.id,
                        claim_number=parsed.claim_number,
                        raw_text=parsed.raw_text,
                        normalized_text=parsed.normalized_text,
                        status=parsed.status,
                        is_independent=parsed.is_independent,
                        parser_confidence=parsed.parser_confidence,
                        parser_status=parsed.parser_status,
                    )
                    db.add(db_claim)
                    db.flush()

                    # 독립항 본문 통째로 임베딩 리스트에 추가
                    if db_claim.status == "active" and db_claim.is_independent:
                        agent_docs.append(
                            ClaimVectorDocument(
                                id=f"claim:{db_claim.id}",
                                text=db_claim.normalized_text,
                                metadata={
                                    "text_type": "independent_claim",
                                    "patent_id": patent.id,
                                    "claim_id": db_claim.id,
                                    "application_number": patent.application_number,
                                    "title": patent.title,
                                    "claim_number": db_claim.claim_number,
                                    "parser_confidence": db_claim.parser_confidence or 0.0,
                                    "parser_status": db_claim.parser_status or "",
                                }
                            )
                        )

                    # 각 구성요소(Claim Element) DB 적재 및 임베딩 리스트 추가
                    for index, elem in enumerate(parsed.elements, start=1):
                        db_elem = ClaimLensClaimElement(
                            claim_id=db_claim.id,
                            element_order=index,
                            element_text=elem.text,
                            source_span=elem.source_span,
                            parser_confidence=elem.parser_confidence,
                            parser_status=elem.parser_status,
                        )
                        db.add(db_elem)
                        db.flush()

                        if db_claim.status == "active":
                            agent_docs.append(
                                ClaimVectorDocument(
                                    id=f"claim_element:{db_elem.id}",
                                    text=db_elem.element_text,
                                    metadata={
                                        "text_type": "claim_element",
                                        "patent_id": patent.id,
                                        "claim_id": db_claim.id,
                                        "claim_element_id": db_elem.id,
                                        "application_number": patent.application_number,
                                        "title": patent.title,
                                        "claim_number": db_claim.claim_number,
                                        "element_order": db_elem.element_order,
                                        "parser_confidence": db_elem.parser_confidence or 0.0,
                                        "parser_status": db_elem.parser_status or "",
                                    }
                                )
                            )

                # 3-4. claimlens-agent namespace에 벡터 적재
                if agent_docs:
                    saved_vectors = vector_index.upsert_documents(agent_docs)
                    agent_vector_count += saved_vectors

                claimlens_saved_count += 1
                db.commit()

            except Exception as e:
                db.rollback()
                logger.error(f"Failed to ingest ClaimLens details for {app_num}: {str(e)}")
                continue

    return {
        "status": "success",
        "patents_collected": len(all_patents),
        "chunks_created": len(chunks),
        "vectors_stored": rag_count,
        "claimlens_patents_saved": claimlens_saved_count,
        "agent_vectors_stored": agent_vector_count,
    }
