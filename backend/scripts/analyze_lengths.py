import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 프로젝트 루트를 path에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents

load_dotenv()

async def analyze_patent_lengths(count: int = 500):
    print(f"🔍 KIPRIS 실시간 데이터 기반 특허 길이 분석 시작 (목표: {count}건)")
    
    applicant = "삼성전자"
    all_patents = []
    num_pages = (count // 100) + (1 if count % 100 > 0 else 0)
    
    for page in range(1, num_pages + 1):
        print(f"  - {page}페이지 수집 중...")
        patents, _ = await kipris_client.search_patents(
            applicant=applicant,
            page=page,
            num_of_rows=min(100, count - len(all_patents))
        )
        all_patents.extend(patents)
        if len(all_patents) >= count:
            break

    print(f"📦 총 {len(all_patents)}건 수집 완료. 텍스트 변환 및 길이 측정 중...")
    
    documents = patents_to_documents(all_patents)
    lengths = [len(doc.page_content) for doc in documents]
    
    if not lengths:
        print("❌ 분석 데이터가 없습니다.")
        return

    avg_len = sum(lengths) / len(lengths)
    max_len = max(lengths)
    min_len = min(lengths)
    lengths.sort()
    median_len = lengths[len(lengths) // 2]
    
    over_500 = len([l for l in lengths if l > 500])
    over_800 = len([l for l in lengths if l > 800])
    over_1000 = len([l for l in lengths if l > 1000])

    print("\n📊 분석 결과 (Page Content 기준)")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"평균 길이: {avg_len:.1f}자")
    print(f"중앙값:   {median_len}자")
    print(f"최대 길이: {max_len}자")
    print(f"최소 길이: {min_len}자")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"500자 초과:  {over_500}건 ({over_500/len(lengths)*100:.1f}%)")
    print(f"800자 초과:  {over_800}건 ({over_800/len(lengths)*100:.1f}%)")
    print(f"1000자 초과: {over_1000}건 ({over_1000/len(lengths)*100:.1f}%)")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

if __name__ == "__main__":
    asyncio.run(analyze_patent_lengths(2000))
