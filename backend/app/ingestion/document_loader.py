from langchain_core.documents import Document

from app.models.patent import PatentItem


def patent_to_document(patent: PatentItem) -> Document:
    """특허 1건을 LangChain Document로 변환

    page_content: 임베딩 대상 텍스트 (검색에 사용됨)
    metadata: 검색 결과에 함께 반환할 부가 정보
    """
    content_parts = []

    if patent.invention_title:
        content_parts.append(f"발명의 명칭: {patent.invention_title}")
    if patent.applicant_name:
        content_parts.append(f"출원인: {patent.applicant_name}")
    if patent.abstract:
        content_parts.append(f"초록: {patent.abstract}")
    if patent.ipc_number:
        content_parts.append(f"IPC 분류: {patent.ipc_number}")

    return Document(
        page_content="\n".join(content_parts),
        metadata={
            "application_number": patent.application_number,
            "application_date": patent.application_date,
            "register_status": patent.register_status,
            "applicant_name": patent.applicant_name,
            "invention_title": patent.invention_title,
            "source": "kipris",
        },
    )


def patents_to_documents(patents: list[PatentItem]) -> list[Document]:
    """여러 특허를 Document 리스트로 변환"""
    return [
        patent_to_document(p)
        for p in patents
        if p.invention_title
    ]
