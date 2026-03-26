from langchain_openai import ChatOpenAI

from app.config import settings

_llm = None


def get_llm():
    """OpenAI LLM (gpt-4o-mini)"""
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(
            model=settings.openai_model,
            openai_api_key=settings.openai_api_key,
            temperature=0.3,
        )
    return _llm
