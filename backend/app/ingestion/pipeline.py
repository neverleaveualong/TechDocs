from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.text_splitter import get_text_splitter
from app.core.vectorstore import add_documents


async def ingest_patents(
    applicant: str,
    start_date: str = "",
    end_date: str = "",
    pages: int = 5,
) -> dict:
    """전체 인제스트 파이프라인

    1. KIPRIS API에서 특허 수집
    2. LangChain Document로 변환
    3. 텍스트 청킹 (500자)
    4. 임베딩 + Pinecone 저장
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
        return {"status": "no_data", "patents_collected": 0, "chunks_created": 0, "vectors_stored": 0}

    # 2. Document 변환
    documents = patents_to_documents(all_patents)

    # 3. 청킹
    text_splitter = get_text_splitter()
    chunks = text_splitter.split_documents(documents)

    # 4. Pinecone에 저장 (임베딩 자동 생성)
    count = add_documents(chunks)

    return {
        "status": "success",
        "patents_collected": len(all_patents),
        "chunks_created": len(chunks),
        "vectors_stored": count,
    }
