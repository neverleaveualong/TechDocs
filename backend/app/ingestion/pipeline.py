import logging

from app.config import settings
from app.core.claimlens.claim_parser import normalize_application_number, parse_claims
from app.core.claimlens.vector_search import ClaimLensVectorIndex, ClaimVectorDocument
from app.core.vectorstore import add_documents
from app.db.database import SessionLocal, is_sqlite
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.kipris_client import kipris_client
from app.ingestion.text_splitter import get_text_splitter
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent
from app.core.hybrid_search import tokenize_korean
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def ingest_patents(
    applicant: str,
    start_date: str = "",
    end_date: str = "",
    pages: int = 5,
) -> dict:
    """Ingest patent data into both the RAG and ClaimLens stores."""
    all_patents = []

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

    documents = patents_to_documents(all_patents)
    text_splitter = get_text_splitter()
    chunks = text_splitter.split_documents(documents)
    rag_count = add_documents(chunks, namespace=settings.rag_namespace)

    # SQLite FTS5 테이블에 고속 키워드 검색용 데이터 백업 및 형태소 역색인 저장
    if is_sqlite and chunks:
        app_nums = list(set([chunk.metadata.get("application_number") for chunk in chunks if chunk.metadata.get("application_number")]))
        with SessionLocal() as db:
            try:
                # 1. 중복 유입 방지를 위해 기존 동일 특허 청크 데이터 일괄 삭제
                for app_num in app_nums:
                    db.execute(text("DELETE FROM patent_fts WHERE application_number = :app_num"), {"app_num": app_num})
                
                # 2. 형태소 단위로 조사 제거된 문자열을 FTS5에 적재
                for chunk in chunks:
                    app_num = chunk.metadata.get("application_number", "")
                    title = chunk.metadata.get("invention_title", "")
                    tokenized_content = " ".join(tokenize_korean(chunk.page_content))
                    
                    db.execute(
                        text("""
                            INSERT INTO patent_fts (
                                application_number, title, abstract, 
                                applicant_name, register_status, application_date, 
                                ipc_number, page_content
                            )
                            VALUES (
                                :app_num, :title, :abstract, 
                                :applicant_name, :register_status, :application_date, 
                                :ipc_number, :page_content
                            )
                        """),
                        {
                            "app_num": app_num,
                            "title": title,
                            "abstract": chunk.metadata.get("abstract", "") or "",
                            "applicant_name": chunk.metadata.get("applicant_name", "") or "",
                            "register_status": chunk.metadata.get("register_status", "") or "",
                            "application_date": chunk.metadata.get("application_date", "") or "",
                            "ipc_number": chunk.metadata.get("ipc_number", "") or "",
                            "page_content": tokenized_content
                        }
                    )
                db.commit()
                logger.info("Successfully indexed %d chunks in SQLite FTS5 for %d patents", len(chunks), len(app_nums))
            except Exception as e:
                db.rollback()
                logger.error("Failed to save chunks to SQLite FTS5: %s", e)

    claimlens_saved_count = 0
    agent_vector_count = 0
    vector_index = ClaimLensVectorIndex()

    with SessionLocal() as db:
        for p_item in all_patents:
            app_num = normalize_application_number(p_item.application_number)
            if not app_num:
                continue

            try:
                raw_claims = await kipris_client.get_claims(app_num)
                parsed_claims = parse_claims(raw_claims)

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

                # Remove old ClaimLens vectors before rebuilding this patent.
                vector_index.delete_patent_documents(patent.id)

                existing_claims = (
                    db.query(ClaimLensClaim)
                    .filter(ClaimLensClaim.patent_id == patent.id)
                    .all()
                )
                for ec in existing_claims:
                    db.query(ClaimLensClaimElement).filter(
                        ClaimLensClaimElement.claim_id == ec.id
                    ).delete()
                db.query(ClaimLensClaim).filter(ClaimLensClaim.patent_id == patent.id).delete()
                db.flush()

                agent_docs: list[ClaimVectorDocument] = []

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
                            },
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
                                },
                            )
                        )

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
                                    },
                                )
                            )

                if agent_docs:
                    saved_vectors = vector_index.upsert_documents(agent_docs)
                    agent_vector_count += saved_vectors

                claimlens_saved_count += 1
                db.commit()

            except Exception as e:
                db.rollback()
                logger.error("Failed to ingest ClaimLens details for %s: %s", app_num, e)
                continue

    return {
        "status": "success",
        "patents_collected": len(all_patents),
        "chunks_created": len(chunks),
        "vectors_stored": rag_count,
        "claimlens_patents_saved": claimlens_saved_count,
        "agent_vectors_stored": agent_vector_count,
    }
