from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class PatentSource(BaseModel):
    invention_title: str
    applicant_name: str
    application_number: str
    application_date: str
    relevance_text: str


class SearchResponse(BaseModel):
    answer: str
    sources: list[PatentSource]
    query: str


class SimilarityRequest(BaseModel):
    query: str
    top_k: int = 5


class SimilarityResult(BaseModel):
    content: str
    metadata: dict
    score: float


class SimilarityResponse(BaseModel):
    results: list[SimilarityResult]
