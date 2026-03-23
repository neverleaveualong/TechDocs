from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore

from app.config import settings
from app.core.embeddings import get_embeddings

# 싱글톤
_vectorstore = None


def get_vectorstore():
    """Pinecone 벡터스토어 연결"""
    global _vectorstore
    if _vectorstore is None:
        pc = Pinecone(api_key=settings.pinecone_api_key)
        _vectorstore = PineconeVectorStore(
            index=pc.Index(settings.pinecone_index_name),
            embedding=get_embeddings(),
        )
    return _vectorstore


def add_documents(documents):
    """문서를 Pinecone에 추가 (임베딩 자동 생성)"""
    vectorstore = get_vectorstore()
    vectorstore.add_documents(documents)
    return len(documents)
