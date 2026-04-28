from langchain_core.documents import Document

from app.models.patent import PatentItem


def _extract_ipc_main(ipc_number: str) -> str:
    """IPC 번호에서 대표 분류를 추출합니다. 예: 'H01M 10/052' -> 'H01M'"""
    if not ipc_number:
        return ""
    ipc_clean = ipc_number.strip().split()[0] if " " in ipc_number else ipc_number.strip()
    return ipc_clean[:4] if len(ipc_clean) >= 4 else ipc_clean


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
    if patent.ipc_number:
        content_parts.append(f"IPC 분류: {patent.ipc_number}")
    if patent.abstract:
        content_parts.append(f"초록: {patent.abstract}")

    ipc_main = _extract_ipc_main(patent.ipc_number)

    return Document(
        page_content="\n".join(content_parts),
        metadata={
            "application_number": patent.application_number,
            "application_date": patent.application_date,
            "register_status": patent.register_status,
            "applicant_name": patent.applicant_name,
            "invention_title": patent.invention_title,
            "ipc_number": patent.ipc_number,
            "ipc_main_class": ipc_main,
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
