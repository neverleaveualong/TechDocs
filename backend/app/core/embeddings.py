from langchain_openai import OpenAIEmbeddings

from app.config import settings

_embeddings = None


def get_embeddings():
    """OpenAI 임베딩 모델 (text-embedding-3-small, 1536차원)"""
    global _embeddings
    if _embeddings is None:
        _embeddings = OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            openai_api_key=settings.openai_api_key,
        )
    return _embeddings
