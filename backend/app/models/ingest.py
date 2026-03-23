from pydantic import BaseModel


class IngestRequest(BaseModel):
    applicant: str
    start_date: str = ""
    end_date: str = ""
    pages: int = 5


class IngestResponse(BaseModel):
    status: str
    patents_collected: int = 0
    chunks_created: int = 0
    vectors_stored: int = 0
