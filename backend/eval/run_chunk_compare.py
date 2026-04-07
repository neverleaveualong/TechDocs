"""
청킹 사이즈 비교 실험 (500 vs 800 vs 1000)

원칙: 같은 원본 특허 문서에서 Q&A를 추출하므로,
정답은 반드시 원본에 존재 → 청킹이 문맥을 자르는지만 비교 가능.

사용법:
    cd backend
    python -m eval.run_chunk_compare
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from datasets import Dataset

from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents
from app.core.vectorstore import get_vectorstore
from app.core.rag_pipeline import rag_pipeline

from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from langchain_openai import OpenAIEmbeddings

import pandas as pd

# ── 설정 ──────────────────────────────────────────────
EXPERIMENTS = [
    {"chunk_size": 500, "chunk_overlap": 50,  "label": "500/50"},
    {"chunk_size": 800, "chunk_overlap": 100, "label": "800/100"},
    {"chunk_size": 1000, "chunk_overlap": 200, "label": "1000/200"},
]
APPLICANTS = ["삼성전자", "LG에너지솔루션", "SK온", "삼성SDI"]
PATENTS_PER_COMPANY = 25
NUM_TEST_QUESTIONS = 20


async def collect_patents() -> list:
    """KIPRIS에서 샘플 특허 수집"""
    all_patents = []
    for applicant in APPLICANTS:
        print(f"  📥 {applicant} 특허 수집 중...")
        patents, _ = await kipris_client.search_patents(
            applicant=applicant, num_of_rows=PATENTS_PER_COMPANY
        )
        all_patents.extend(patents)
    print(f"  ✅ 총 {len(all_patents)}건 수집 완료")
    return all_patents


def generate_testset_from_documents(documents: list, num_questions: int = 20) -> list[dict]:
    """실제 문서 내용 기반으로 Q&A 페어 생성 (GPT 활용)"""
    print(f"\n📝 문서 기반 테스트셋 생성 중 (목표: {num_questions}개)...")

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

    prompt = PromptTemplate.from_template("""아래 특허 문서 내용을 바탕으로, 이 문서에서만 답변 가능한 질문과 정답을 1개 생성하세요.

[특허 문서]
{document}

[출력 형식 - 반드시 JSON]
{{"question": "질문 내용", "answer": "정답 내용 (문서에 있는 내용만 사용)"}}

규칙:
1. 한국어로 작성
2. 문서에 명시된 내용만 정답으로 사용
3. 추론이나 외부 지식 사용 금지
4. 구체적인 기술 내용을 묻는 질문""")


    # 문서 중 num_questions개를 무작위 선택 (내용이 충분한 것 우선)
    import random
    random.seed(42)
    candidates = [d for d in documents if len(d.page_content) > 200]
    selected = random.sample(candidates, min(num_questions, len(candidates)))

    testset = []
    for i, doc in enumerate(selected):
        try:
            chain = prompt | llm
            response = chain.invoke({"document": doc.page_content[:1500]})
            content = response.content.strip()

            # JSON 파싱 (코드블록 제거)
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()

            item = json.loads(content)
            testset.append({
                "question": item["question"],
                "ground_truth": item["answer"],
                "source_doc": doc.page_content[:100],  # 추적용
            })
            print(f"  [{i+1}/{len(selected)}] 생성 완료: {item['question'][:40]}...")

        except Exception as e:
            print(f"  [{i+1}] 스킵 (오류: {e})")
            continue

    print(f"  ✅ {len(testset)}개 Q&A 생성 완료")
    return testset


def chunk_and_index(documents: list, chunk_size: int, chunk_overlap: int, namespace: str) -> int:
    """문서를 청킹 + Pinecone 인덱싱"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(documents)
    print(f"  📦 {namespace}: {len(chunks)}개 청크 생성 ({chunk_size}자)")

    # 네임스페이스 지정 인덱싱
    from app.core.vectorstore import add_documents
    count = add_documents(chunks, namespace=namespace)
    print(f"  📤 인덱싱 완료: {count}개 벡터")

    # Pinecone 반영 대기
    print(f"  ⏳ 인덱스 반영 대기 (10초)...")
    time.sleep(10)

    return len(chunks)


def run_evaluation(testset: list[dict], namespace: str) -> dict:
    """특정 네임스페이스에 대해 RAGAS 평가"""
    eval_data = {"question": [], "answer": [], "contexts": [], "ground_truth": []}

    print(f"  🔍 {namespace} 평가 시작 ({len(testset)}문항)")
    for i, item in enumerate(testset):
        try:
            res = rag_pipeline.search(item["question"], top_k=5, namespace=namespace)
            contexts = [s.get("full_content", s.get("relevance_text", "")) for s in res.get("sources", [])]

            eval_data["question"].append(item["question"])
            eval_data["answer"].append(res.get("answer", ""))
            eval_data["contexts"].append(contexts)
            eval_data["ground_truth"].append(item["ground_truth"])

        except Exception as e:
            print(f"    [{i+1}] 오류: {e}")
            eval_data["question"].append(item["question"])
            eval_data["answer"].append("")
            eval_data["contexts"].append([])
            eval_data["ground_truth"].append(item["ground_truth"])

    dataset = Dataset.from_dict(eval_data)

    evaluator_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))
    evaluator_embeddings = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(model="text-embedding-3-small")
    )

    print(f"  📊 RAGAS 메트릭 계산 중...")
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
        llm=evaluator_llm,
        embeddings=evaluator_embeddings,
    )

    df = result.to_pandas()
    scores = df.select_dtypes(include=["number"]).mean().to_dict()
    return scores


async def main():
    print("=" * 60)
    print("[청킹 사이즈 비교 실험 (500 vs 800 vs 1000)]")
    print("=" * 60)

    # 1. 특허 수집
    print("[1/4] 특허 데이터 수집")
    patents = await collect_patents()
    documents = patents_to_documents(patents)
    print(f"  📄 LangChain Document {len(documents)}개 변환 완료")

    # 2. 테스트셋 생성 (원본 문서 기반)
    print("[2/4] 테스트셋 생성 (문서 기반 Q&A)")
    testset = generate_testset_from_documents(documents, NUM_TEST_QUESTIONS)

    # 테스트셋 저장
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    testset_path = results_dir / f"chunk_testset_{ts}.json"
    with open(testset_path, "w", encoding="utf-8") as f:
        json.dump(testset, f, ensure_ascii=False, indent=2)
    print(f"  💾 테스트셋 저장: {testset_path}")

    # 3. 각 청킹 사이즈별 실험
    print("[3/4] 청킹 사이즈별 실험")
    all_results = []

    for exp in EXPERIMENTS:
        namespace = f"chunk_{exp['label'].replace('/', '_')}"
        print(f"\n--- 실험: {exp['label']} (namespace: {namespace}) ---")

        # 청킹 + 인덱싱
        num_chunks = chunk_and_index(
            documents, exp["chunk_size"], exp["chunk_overlap"], namespace
        )

        # 평가
        scores = run_evaluation(testset, namespace)

        result = {
            "params": exp["label"],
            "chunk_size": exp["chunk_size"],
            "chunk_overlap": exp["chunk_overlap"],
            "num_chunks": num_chunks,
            "metrics": scores,
        }
        all_results.append(result)
        print(f"  📊 {exp['label']}: F={scores.get('faithfulness',0):.3f} R={scores.get('answer_relevancy',0):.3f} P={scores.get('context_precision',0):.3f} CR={scores.get('context_recall',0):.3f}")

    # 4. 결과 리포트
    print("[4/4] 결과 리포트 생성")
    report_path = results_dir / f"chunk_comparison_{ts}.md"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# 청킹 사이즈 비교 실험 결과\n\n")
        f.write(f"- 날짜: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"- 테스트 문항: {len(testset)}개 (문서 기반 Synthetic)\n")
        f.write(f"- 특허 수: {len(patents)}건 ({', '.join(APPLICANTS)})\n\n")
        f.write("| Chunk/Overlap | 청크 수 | Faithfulness | Relevancy | Precision | Recall |\n")
        f.write("|:---|:---|:---|:---|:---|:---|\n")
        for r in all_results:
            m = r["metrics"]
            f.write(f"| {r['params']} | {r['num_chunks']} | {m.get('faithfulness',0):.4f} | {m.get('answer_relevancy',0):.4f} | {m.get('context_precision',0):.4f} | {m.get('context_recall',0):.4f} |\n")

    # JSON도 저장
    json_path = results_dir / f"chunk_comparison_{ts}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    # 최종 출력
    print("=" * 60)
    print("[최종 비교 결과]")
    print("=" * 60)
    for r in all_results:
        m = r["metrics"]
        print(f"  {r['params']:>10}: F={m.get('faithfulness',0):.3f} | R={m.get('answer_relevancy',0):.3f} | P={m.get('context_precision',0):.3f} | CR={m.get('context_recall',0):.3f}")

    print(f"\n💾 리포트: {report_path}")
    print(f"💾 JSON: {json_path}")
    print("✅ 실험 완료!")


if __name__ == "__main__":
    asyncio.run(main())
