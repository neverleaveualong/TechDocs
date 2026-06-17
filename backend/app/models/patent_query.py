from typing import Literal

from pydantic import BaseModel, Field


class PatentQueryPlan(BaseModel):
    intent: Literal["rag_search", "claim_analysis", "mixed"] = "mixed"
    summary: str = Field(default="", max_length=200)
    technical_features: list[str] = Field(default_factory=list)
    search_keywords: list[str] = Field(default_factory=list)
    synonyms: list[str] = Field(default_factory=list)
    ipc_candidates: list[str] = Field(default_factory=list)
    rag_query: str = Field(default="", max_length=300)
    kipris_queries: list[str] = Field(default_factory=list)
    applicant_candidates: list[str] = Field(default_factory=list)

    def to_event_data(self) -> dict:
        return {
            "intent": self.intent,
            "summary": self.summary,
            "technicalFeatures": self.technical_features,
            "searchKeywords": self.search_keywords,
            "synonyms": self.synonyms,
            "ipcCandidates": self.ipc_candidates,
            "ragQuery": self.rag_query,
            "kiprisQueries": self.kipris_queries,
            "applicantCandidates": self.applicant_candidates,
        }
