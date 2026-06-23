from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    use_hybrid: bool = True
    use_reranker: bool = False
    auto_ingest: bool = True


class PatentSource(BaseModel):
    invention_title: str
    applicant_name: str
    application_number: str
    application_date: str
    register_status: str = ""
    ipc_number: str = ""
    score: float | None = None
    score_type: str = ""
    relevance_reason: str = ""
    matched_terms: list[str] = Field(default_factory=list)
    relevance_text: str
    full_content: str = ""


class SearchResponse(BaseModel):
    answer: str
    sources: list[PatentSource]
    query: str
    query_log_id: int | None = None


class SimilarityRequest(BaseModel):
    query: str
    top_k: int = 5


class SimilarityResult(BaseModel):
    content: str
    metadata: dict
    score: float


class SimilarityResponse(BaseModel):
    results: list[SimilarityResult]
