from typing import Literal

from pydantic import BaseModel, Field


class ClaimLensAnalysisRequest(BaseModel):
    product_description: str = Field(min_length=20)
    technical_domain: str | None = None
    top_k: int = 5


class ClaimLensAgentEvent(BaseModel):
    type: Literal[
        "step_started",
        "tool_result",
        "step_completed",
        "claim_chart_row",
        "final_report",
        "auto_ingest_started",
        "auto_ingest_completed",
        "retry_search",
        "error",
    ]
    step: str | None = None
    tool: str | None = None
    message: str | None = None
    data: dict | None = None
