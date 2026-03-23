import httpx
import xmltodict

from app.config import settings
from app.models.patent import PatentItem


class KiprisClient:
    """KIPRIS Open API 클라이언트 — 특허 데이터 수집"""

    def __init__(self):
        self.base_url = settings.kipris_base_url
        self.api_key = settings.kipris_api_key

    async def search_patents(
        self,
        applicant: str,
        start_date: str = "",
        end_date: str = "",
        page: int = 1,
        num_of_rows: int = 20,
    ) -> tuple[list[PatentItem], int]:
        """출원인 기반 특허 검색"""
        url = f"{self.base_url}/patUtiModInfoSearchSevice/getAdvancedSearch"
        params = {
            "ServiceKey": self.api_key,
            "applicant": applicant,
            "numOfRows": num_of_rows,
            "pageNo": page,
        }
        if start_date:
            params["applicationDateFrom"] = start_date
        if end_date:
            params["applicationDateTo"] = end_date

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)

        # 응답 구조 파싱
        body = data.get("response", {}).get("body", {})
        total_count = int(body.get("items", {}).get("totalCount", 0) or 0)
        items = body.get("items", {}).get("item", [])

        # 단건이면 리스트로 래핑
        if isinstance(items, dict):
            items = [items]

        # PatentItem으로 변환
        patents = [
            PatentItem(
                application_number=item.get("applicationNumber", ""),
                invention_title=item.get("inventionTitle", ""),
                applicant_name=item.get("applicantName", ""),
                ipc_number=item.get("ipcNumber", ""),
                application_date=item.get("applicationDate", ""),
                register_status=item.get("registerStatus", ""),
                abstract=item.get("astrtCont", ""),
            )
            for item in items
            if item.get("inventionTitle")
        ]

        return patents, total_count


kipris_client = KiprisClient()
