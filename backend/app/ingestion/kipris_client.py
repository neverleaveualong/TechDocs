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

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)
        body = data.get("response", {}).get("body") or {}
        items_block = body.get("items") or {}
        total_count = int(items_block.get("totalCount", 0) or 0)
        items = items_block.get("item", []) or []

        # 단건이면 리스트로 래핑
        if isinstance(items, dict):
            items = [items]

        # PatentItem으로 변환
        patents = [
            PatentItem(
                application_number=item.get("applicationNumber") or "",
                invention_title=item.get("inventionTitle") or "",
                applicant_name=item.get("applicantName") or "",
                ipc_number=item.get("ipcNumber") or "",
                application_date=item.get("applicationDate") or "",
                register_status=item.get("registerStatus") or "",
                abstract=item.get("astrtCont") or item.get("inventionTitle") or "",
            )
            for item in items
            if item.get("inventionTitle")
        ]

        return patents, total_count

    async def get_claims(self, application_number: str) -> list[str]:
        """특허 출원번호 기준 청구항 본문 리스트 수집 (폴백 포함)"""
        try:
            claims = await self.get_claims_from_claim_endpoint(application_number)
            if claims:
                return claims
        except Exception:
            pass
        return await self.get_claims_from_bibliography_detail(application_number)

    async def get_claims_from_claim_endpoint(self, application_number: str) -> list[str]:
        """openapi patentClaimInfo 엔드포인트에서 청구항 수집"""
        url = "http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/patentClaimInfo"
        params = {
            "applicationNumber": application_number,
            "accessKey": self.api_key,
        }
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)
        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode")
        if result_code and result_code not in {"00", "0"}:
            raise RuntimeError(f"KIPRIS API error {result_code}: {header.get('resultMsg')}")

        body = data.get("response", {}).get("body", {})
        items = body.get("items", {}) or {}
        claim_info = items.get("claimInfo", []) or []

        if isinstance(claim_info, dict):
            claim_info = [claim_info]

        claims = []
        for info in claim_info:
            claim_text = info.get("claim")
            if claim_text and isinstance(claim_text, str):
                claims.append(claim_text.strip())
        return claims

    async def get_claims_from_bibliography_detail(self, application_number: str) -> list[str]:
        """kipo-api getBibliographyDetailInfoSearch 엔드포인트에서 청구항 수집 (폴백용)"""
        url = f"{self.base_url}/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch"
        params = {
            "ServiceKey": self.api_key,
            "applicationNumber": application_number,
        }
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)
        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode")
        if result_code and result_code not in {"00", "0"}:
            raise RuntimeError(f"KIPRIS API error {result_code}: {header.get('resultMsg')}")

        body = data.get("response", {}).get("body", {})
        items = body.get("items", {}) or {}
        biblio_info = items.get("bibliographyDetailInfo", {}) or {}
        claim_info_array = biblio_info.get("claimInfoArray", {}) or {}
        claim_info = claim_info_array.get("claimInfo", []) or []

        if isinstance(claim_info, dict):
            claim_info = [claim_info]

        claims = []
        for info in claim_info:
            claim_text = info.get("claim")
            if claim_text and isinstance(claim_text, str):
                claims.append(claim_text.strip())
        return claims


kipris_client = KiprisClient()

