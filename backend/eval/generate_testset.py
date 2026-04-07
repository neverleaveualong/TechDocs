import os
import json
import random
from pathlib import Path
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# 프로젝트 루트를 path에 추가
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.vectorstore import get_vectorstore

load_dotenv()

def generate_custom_testset(count: int = 50):
    print(f"🚀 [커스텀 가성비 모드] GPT-4o-mini 기반 합성 데이터 {count}개 생성 시작...")
    print(f"💰 예상 비용: 약 $0.05 (약 70원 내외)")
    
    # 1. 문서 샘플링 (Pinecone에서 데이터 가져오기)
    vectorstore = get_vectorstore()
    keywords = ["특허", "배터리", "이차전지", "삼성", "LG", "에너지", "반도체", "물질", "장치", "방법"]
    all_docs = []
    
    print("📦 Pinecone에서 문서 샘플링 중...")
    for kw in keywords:
        results = vectorstore.similarity_search(kw, k=8)
        all_docs.extend(results)
    
    # 중복 제거 및 무작위 셔플
    unique_contents = list({doc.page_content: doc for doc in all_docs}.values())
    random.shuffle(unique_contents)
    
    print(f"📝 총 {len(unique_contents)}개의 고유 문서 조각 확보.")

    # 2. LLM 설정 (gpt-4o-mini)
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)

    # 3. 질문 생성 로직
    new_items = []
    dataset_path = Path(__file__).resolve().parent / "test_dataset.json"
    
    # 기존 데이터 로드 (중복 생성 방지용)
    if dataset_path.exists():
        with open(dataset_path, "r", encoding="utf-8") as f:
            existing_items = json.load(f)
            existing_questions = {item["question"] for item in existing_items}
    else:
        existing_items = []
        existing_questions = set()

    print(f"🧪 {count}개의 데이터셋 생성 중 (배치 처리)...")
    
    batch_size = 5 # 한 번의 프롬프트에서 5개씩 생성하여 비용 최적화
    for i in range(0, count, batch_size):
        current_batch_count = min(batch_size, count - len(new_items))
        if current_batch_count <= 0: break
        
        # 이번 배치를 위한 문서들 선택
        sample_docs = unique_contents[(i % len(unique_contents)) : (i % len(unique_contents)) + current_batch_count]
        context_text = "\n\n".join([f"[문서 {idx}]: {doc.page_content}" for idx, doc in enumerate(sample_docs)])
        
        prompt = f"""당신은 특허 전문 기술 평가자입니다. 다음 특허 문서 내용들을 바탕으로, RAG 시스템 평가를 위한 질문과 정답 쌍 {current_batch_count}개를 만들어주세요.

[문서 리스트]
{context_text}

[조건]
1. 각 질문은 반드시 제공된 [문서 리스트] 중 하나 이상의 내용을 기반으로 해야 합니다.
2. 질문은 '단순 정보 추출', '기술적 원리', '비교 분석' 등 다양하게 구성하세요.
3. 정답(ground_truth)은 제공된 문서의 내용을 바탕으로 상세하게 작성하세요.
4. 출력 형식은 반드시 아래의 JSON 리스트 형식이어야 합니다.

[JSON 출력 형식]
[
  {{
    "question": "질문 내용",
    "ground_truth": "상세한 모범 정답",
    "category": "simple/technical/comparative 중 택 1",
    "source": "synthetic"
  }}
]
"""
        try:
            response = llm.invoke(prompt)
            # JSON만 추출 (```json ... ``` 대응)
            content = response.content.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
                
            batch_items = json.loads(content)
            
            for item in batch_items:
                if item["question"] not in existing_questions:
                    new_items.append(item)
                    existing_questions.add(item["question"])
                    
            print(f"  - [{len(new_items)}/{count}] 생성 완료...")
            
        except Exception as e:
            print(f"❌ 배치 {i} 생성 중 오류 발생: {e}")
            continue

    # 4. 결과 저장
    final_items = existing_items + new_items
    with open(dataset_path, "w", encoding="utf-8") as f:
        json.dump(final_items, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 생성 완료!")
    print(f"📊 새로 추가됨: {len(new_items)}개")
    print(f"📈 전체 데이터셋 규모: {len(final_items)}개")
    print(f"💾 저장 위치: {dataset_path}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=50)
    args = parser.parse_args()
    
    generate_custom_testset(count=args.count)
