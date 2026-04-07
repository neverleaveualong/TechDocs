from langchain.text_splitter import RecursiveCharacterTextSplitter


def get_text_splitter():
    """텍스트 청킹 설정

    chunk_size=800: 특허 초록/청구항 평균 500~800자 고려 → 문맥 끊김 최소화
    chunk_overlap=100: 청크 경계에서 핵심 키워드 유실 방지 (12.5% 오버랩)
    separators: 문단 → 문장 → 단어 순으로 분할 시도
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
