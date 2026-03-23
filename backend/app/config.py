from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Ollama (로컬 LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # 임베딩 (로컬 HuggingFace)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Pinecone
    pinecone_api_key: str
    pinecone_index_name: str = "techdocs-patents"

    # KIPRIS
    kipris_api_key: str
    kipris_base_url: str = "http://plus.kipris.or.kr/kipo-api/kipi"

    # CORS
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
