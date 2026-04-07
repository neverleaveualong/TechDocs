from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore

from app.config import settings
from app.core.embeddings import get_embeddings

# 싱글톤
_vectorstore = None


def get_vectorstore(namespace=None):
    """Pinecone 벡터스토어 연결 (네임스페이스 지원)"""
    global _vectorstore
    pc = Pinecone(api_key=settings.pinecone_api_key)
    
    # 랑체인 인스턴스 반환
    return PineconeVectorStore(
        index=pc.Index(settings.pinecone_index_name),
        embedding=get_embeddings(),
        namespace=namespace,
    )


def add_documents(documents, namespace=None):
    """문서를 Pinecone에 추가 (네임스페이스 지원)"""
    vectorstore = get_vectorstore(namespace=namespace)
    vectorstore.add_documents(documents)
    return len(documents)


def delete_all_documents():
    """Pinecone 인덱스 전체 삭제"""
    pc = Pinecone(api_key=settings.pinecone_api_key)
    index = pc.Index(settings.pinecone_index_name)
    index.delete(delete_all=True)
    print("Pinecone 인덱스 전체 삭제 완료")
