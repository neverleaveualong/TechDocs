from langchain.text_splitter import RecursiveCharacterTextSplitter


def get_text_splitter():
    """텍스트 청킹 설정

    chunk_size=500: 특허 초록 평균 200~600자 → 대부분 1~2청크
    chunk_overlap=50: 청크 경계에서 문맥 유실 방지
    separators: 문단 → 문장 → 단어 순으로 분할 시도
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
