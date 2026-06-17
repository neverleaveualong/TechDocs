from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Pinecone
    pinecone_api_key: str
    pinecone_index_name: str = "techdocs-patents"
    
    # Namespaces
    rag_namespace: str = "techdocs-rag"
    agent_namespace: str = "claimlens-agent"

    # PostgreSQL Database URL
    database_url: str = "postgresql+psycopg://techdocs:techdocs@localhost:5432/techdocs"

    # KIPRIS
    kipris_api_key: str
    kipris_base_url: str = "https://plus.kipris.or.kr/kipo-api/kipi"

    # Conservative on-demand ingest limits for portfolio demos.
    auto_ingest_enabled: bool = True
    auto_ingest_fallback_applicant: str = "삼성전자"
    auto_ingest_max_daily_calls: int = 20
    auto_ingest_max_monthly_calls: int = 300
    auto_ingest_cache_ttl_days: int = 30
    auto_ingest_search_attempts: int = 4
    auto_ingest_rag_rerank_min_score: float = 0.56
    auto_ingest_claimlens_rerank_min_score: float = 0.60
    auto_ingest_rag_max_patents: int = 3
    auto_ingest_rag_max_chunks_per_patent: int = 2
    auto_ingest_claimlens_enabled: bool = True
    auto_ingest_claimlens_max_patents: int = 1
    auto_ingest_claimlens_max_claims_per_patent: int = 2
    auto_ingest_claimlens_max_elements_per_claim: int = 8

    # CORS
    frontend_url: str = "http://localhost:3000"

    # RAGAS 평가
    eval_model: str = "gpt-4o-mini"
    eval_embedding_model: str = "text-embedding-3-small"

    class Config:
        env_file = ".env"


settings = Settings()
