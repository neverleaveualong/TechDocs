from pydantic import BaseModel


class PatentItem(BaseModel):
    application_number: str = ""
    invention_title: str = ""
    applicant_name: str = ""
    ipc_number: str = ""
    application_date: str = ""
    register_status: str = ""
    abstract: str = ""


class PatentSearchRequest(BaseModel):
    applicant: str
    start_date: str = ""
    end_date: str = ""
    page: int = 1
    num_of_rows: int = 20


class PatentSearchResponse(BaseModel):
    patents: list[PatentItem]
    total_count: int
