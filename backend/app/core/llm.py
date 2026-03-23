from langchain_community.llms import Ollama

from app.config import settings

_llm = None


def get_llm():
    """Ollama 로컬 LLM (llama3)"""
    global _llm
    if _llm is None:
        _llm = Ollama(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            temperature=0.3,
        )
    return _llm
