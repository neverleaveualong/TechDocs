"""Phase 3 실험: Hybrid Search + Reranker 성능 비교

비교 그룹:
1. Vector Only (Baseline, Phase 2 결과)
2. Hybrid (BM25 + Vector + RRF)
3. Hybrid + Reranker (BM25 + Vector + RRF + Flashrank)

각 그룹에 대해 RAGAS 4개 메트릭 측정 → Before/After 비교
"""

import asyncio
import json
import time
import sys
from pathlib import Path
from datetime import datetime

# 경로 설정
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.rag_pipeline import RAGPipeline


async def run_experiment():
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(exist_ok=True)

    # 테스트셋 로드
    testset_path = results_dir / "chunk_testset_20260407_003710.json"
    if not testset_path.exists():
        print("테스트셋이 없습니다. run_chunk_compare.py를 먼저 실행하세요.")
        return

    with open(testset_path, "r", encoding="utf-8") as f:
        testset = json.load(f)

    print(f"테스트셋: {len(testset)}개 질문")
    print()

    # 실험 설정
    experiments = [
        {"label": "Vector Only", "use_hybrid": False, "use_reranker": False},
        {"label": "Hybrid (BM25+Vector+RRF)", "use_hybrid": True, "use_reranker": False},
        {"label": "Hybrid + Reranker", "use_hybrid": True, "use_reranker": True},
    ]

    all_results = []

    for exp in experiments:
        print(f"{'='*60}")
        print(f"실험: {exp['label']}")
        print(f"{'='*60}")

        pipeline = RAGPipeline()
        eval_data = {"question": [], "answer": [], "contexts": [], "ground_truth": []}

        for i, item in enumerate(testset):
            q = item["question"]
            gt = item.get("ground_truth", item.get("answer", ""))
            print(f"  [{i+1}/{len(testset)}] {q[:50]}...")

            try:
                result = pipeline.search(
                    query=q,
                    top_k=5,
                    use_hybrid=exp["use_hybrid"],
                    use_reranker=exp["use_reranker"],
                )

                answer = result["answer"]
                contexts = [s["full_content"] for s in result.get("sources", [])]

                eval_data["question"].append(q)
                eval_data["answer"].append(answer)
                eval_data["contexts"].append(contexts)
                eval_data["ground_truth"].append(gt)

            except Exception as e:
                print(f"    오류: {e}")
                continue

        print(f"  수집 완료: {len(eval_data['question'])}개")

        # RAGAS 평가
        print("  RAGAS 평가 중...")
        try:
            from datasets import Dataset
            from ragas import evaluate
            from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
            from ragas.llms import LangchainLLMWrapper
            from ragas.embeddings import LangchainEmbeddingsWrapper
            from langchain_openai import ChatOpenAI, OpenAIEmbeddings

            eval_dataset = Dataset.from_dict(eval_data)
            evaluator_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))
            evaluator_embeddings = LangchainEmbeddingsWrapper(
                OpenAIEmbeddings(model="text-embedding-3-small")
            )

            scores = evaluate(
                eval_dataset,
                metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
                llm=evaluator_llm,
                embeddings=evaluator_embeddings,
            )

            metrics = {k: round(float(v), 4) for k, v in scores.items()}
            print(f"  결과: {metrics}")

        except Exception as e:
            print(f"  RAGAS 평가 오류: {e}")
            metrics = {}

        result_data = {
            "timestamp": datetime.now().isoformat(),
            "type": "hybrid_comparison",
            "label": exp["label"],
            "config": {
                "use_hybrid": exp["use_hybrid"],
                "use_reranker": exp["use_reranker"],
            },
            "metrics": metrics,
            "num_questions": len(eval_data["question"]),
        }
        all_results.append(result_data)
        print()

    # 결과 저장
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # JSON
    json_path = results_dir / f"hybrid_comparison_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"JSON 저장: {json_path}")

    # Markdown 리포트
    report_path = results_dir / f"hybrid_comparison_{ts}.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Phase 3: Hybrid Search + Reranker 비교 실험\n\n")
        f.write(f"실행일시: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"테스트셋: {len(testset)}개 질문\n\n")

        f.write("| 실험 | Faithfulness | Relevancy | Precision | Recall |\n")
        f.write("|:---|:---|:---|:---|:---|\n")
        for r in all_results:
            m = r["metrics"]
            label = r["label"]
            if label == "Hybrid + Reranker":
                label = f"**{label}**"
            f.write(f"| {label} | {m.get('faithfulness', '-')} | {m.get('answer_relevancy', '-')} "
                    f"| {m.get('context_precision', '-')} | {m.get('context_recall', '-')} |\n")

        f.write("\n---\n\n")
        f.write("## 분석\n\n")
        f.write("- Vector Only: 기존 순수 벡터 검색 (Phase 2 기준)\n")
        f.write("- Hybrid: BM25(키워드) + Vector(의미) + RRF 순위 병합\n")
        f.write("- Hybrid + Reranker: Hybrid 후 Flashrank로 2차 정렬\n")

    print(f"리포트 저장: {report_path}")
    print("\n실험 완료!")


if __name__ == "__main__":
    asyncio.run(run_experiment())
