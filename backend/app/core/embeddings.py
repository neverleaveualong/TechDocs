from langchain_huggingface import HuggingFaceEmbeddings

from app.config import settings

# 싱글톤: 모델을 한 번만 로드
_embeddings = None


def get_embeddings():
    """HuggingFace 임베딩 모델 (로컬, 무료)

    all-MiniLM-L6-v2:
    - 384차원 벡터 생성
    - 무료, 로컬 실행
    - 다국어 지원 (한국어 특허 처리 가능)
    - 프로덕션에서는 OpenAI embedding으로 config만 교체 가능
    """
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(
            model_name=settings.embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings
