"""
RAGAS 평가 모듈 — 현재 RAG 시스템의 성능을 정량 측정

핵심 메트릭:
- Faithfulness: 답변이 검색된 문서에 충실한가 (할루시네이션 측정)
- AnswerRelevancy: 답변이 질문과 관련 있는가
- ContextPrecision: 검색된 문서가 정답을 포함하는가
- ContextRecall: 정답에 필요한 정보를 검색해왔는가
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# 프로젝트 루트를 path에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)

from datasets import Dataset

def load_test_dataset() -> list[dict]:
    """test_dataset.json 파일에서 평가 데이터 로드"""
    dataset_path = Path(__file__).resolve().parent / "test_dataset.json"
    if not dataset_path.exists():
        return []
    with open(dataset_path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_rag_and_collect(question: str) -> dict:
    """RAG 파이프라인에 질문을 던지고 결과를 RAGAS 형식으로 수집"""
    from app.core.rag_pipeline import rag_pipeline

    result = rag_pipeline.search(query=question, top_k=5)

    # RAGAS 형식으로 변환 (full_content + 메타데이터 헤더 포함)
    contexts = []
    for src in result.get("sources", []):
        header = (
            f"출원번호: {src.get('application_number', '')} | "
            f"발명명칭: {src.get('invention_title', '')} | "
            f"출원인: {src.get('applicant_name', '')}"
        )
        contexts.append(f"{header}\n{src.get('full_content', '')}")

    return {
        "question": question,
        "answer": result.get("answer", ""),
        "contexts": contexts,
    }


def evaluate_baseline() -> dict:
    """Golden Set으로 현재 RAG 시스템 Baseline 측정"""

    print("=" * 60)
    print("📊 RAGAS Baseline 평가 시작")
    print("=" * 60)

    test_items = load_test_dataset()
    if not test_items:
        print("❌ 평가할 데이터가 없습니다. (test_dataset.json 확인)")
        return {}
    eval_data = {
        "question": [],
        "answer": [],
        "contexts": [],
        "ground_truth": [],
    }

    # RAG 파이프라인 실행 + 결과 수집
    for i, item in enumerate(test_items):
        print(f"\n[{i+1}/{len(test_items)}] 질문: {item['question'][:50]}...")

        try:
            rag_result = run_rag_and_collect(item["question"])

            eval_data["question"].append(rag_result["question"])
            eval_data["answer"].append(rag_result["answer"])
            eval_data["contexts"].append(rag_result["contexts"])
            eval_data["ground_truth"].append(item["ground_truth"])

            print(f"  → 답변 길이: {len(rag_result['answer'])}자, 검색 문서: {len(rag_result['contexts'])}개")

        except Exception as e:
            print(f"  ❌ 오류: {e}")
            eval_data["question"].append(item["question"])
            eval_data["answer"].append("")
            eval_data["contexts"].append([])
            eval_data["ground_truth"].append(item["ground_truth"])

    # HuggingFace Dataset으로 변환
    eval_dataset = Dataset.from_dict(eval_data)

    # RAGAS 평가 실행 (gpt-4o-mini 사용하여 비용 최적화)
    print("\n" + "=" * 60)
    print("🔍 RAGAS 메트릭 계산 중 (평가 모델: gpt-4o-mini)...")
    print("=" * 60)

    from langchain_openai import ChatOpenAI, OpenAIEmbeddings
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper

    evaluator_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))
    evaluator_embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))

    result = evaluate(
        eval_dataset,
        metrics=[
            faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        ],
        llm=evaluator_llm,
        embeddings=evaluator_embeddings,
    )

    # 결과 출력
    print("\n" + "=" * 60)
    print("📈 Baseline 결과")
    print("=" * 60)

    # Ragas 0.2.x 기준 안전하게 점수 추출 (Pandas DataFrame 활용)
    df = result.to_pandas()
    # 수치형 컬럼만 평균 계산
    import pandas as pd
    numeric_cols = df.select_dtypes(include=['number']).columns
    scores = df[numeric_cols].mean().to_dict()

    for metric_name, score in scores.items():
        print(f"  {metric_name}: {score:.4f}")

    # 결과 요약
    result_data = {
        "timestamp": datetime.now().isoformat(),
        "type": "baseline",
        "metrics": scores,
        "num_questions": len(test_items),
        "source_counts": {
            "manual": len([item for item in test_items if item.get("source") == "manual"]),
            "synthetic": len([item for item in test_items if item.get("source") == "synthetic"]),
        },
    }

    return result_data


def save_results(result_data: dict, filename: str = None) -> str:
    """결과를 JSON으로 저장"""
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(exist_ok=True)

    if filename is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"baseline_{ts}.json"

    filepath = results_dir / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 결과 저장: {filepath}")
    return str(filepath)


if __name__ == "__main__":
    result_data = evaluate_baseline()
    save_results(result_data)
