import asyncio
import json
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents
from app.core.vectorstore import add_documents
from app.core.rag_pipeline import rag_pipeline
from eval.evaluator import evaluate_baseline, save_results

from langchain.text_splitter import RecursiveCharacterTextSplitter
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper

load_dotenv()

async def run_experiment(chunk_size: int, chunk_overlap: int, sample_size: int = 100):
    namespace = f"exp_{chunk_size}_{chunk_overlap}"
    print(f"\n🚀 [실험 시작] Chunk: {chunk_size}, Overlap: {chunk_overlap} (Namespace: {namespace})")
    
    # 1. 샘플 데이터 수집 (테스트셋에 포함된 주요 기업들 망라)
    applicants = ["삼성전자", "LG에너지솔루션", "SK온", "삼성SDI"]
    all_patents = []
    for app in applicants:
        print(f"  - {app} 데이터 수집 중...")
        p, _ = await kipris_client.search_patents(applicant=app, num_of_rows=25)
        all_patents.extend(p)
    
    documents = patents_to_documents(all_patents)
    
    # 2. 지정된 파라미터로 청킹
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = splitter.split_documents(documents)
    print(f"📦 청킹 완료: {len(chunks)}개 청크 생성")
    
    # 3. Pinecone 해당 네임스페이스에 저장
    print(f"📤 {namespace} 네임스페이스에 인덱싱 중...")
    add_documents(chunks, namespace=namespace)
    
    # Pinecone 인덱스 반영 대기
    print("⏳ Pinecone 인덱스 대기 중 (5초)...")
    import time
    time.sleep(5)
    
    # 4. 평가 수행 (evaluator.py의 로직 재활용하되 namespace 지정)
    test_path = Path(__file__).resolve().parent / "test_dataset.json"
    with open(test_path, "r", encoding="utf-8") as f:
        test_items = json.load(f)
    
    # 시간 관계상 실험 단계에서는 상위 10개 문항으로만 테스트 (샘플링)
    # 실제 프로젝트에서는 전체 65개를 돌리는게 좋지만, 빠른 비교를 위해 샘플링 제안
    test_items = test_items[:10] 
    
    eval_data = {"question": [], "answer": [], "contexts": [], "ground_truth": []}
    
    print(f"🔍 RAG 파이프라인 실행 중 (문항 수: {len(test_items)})")
    for item in test_items:
        res = rag_pipeline.search(item["question"], namespace=namespace)
        eval_data["question"].append(item["question"])
        eval_data["answer"].append(res["answer"])
        eval_data["contexts"].append([s["full_content"] for s in res["sources"]])
        eval_data["ground_truth"].append(item["ground_truth"])

    # RAGAS 평가
    eval_dataset = Dataset.from_dict(eval_data)
    evaluator_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini"))
    evaluator_embeddings = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))

    print("📊 RAGAS 스코어 계산 중...")
    result = evaluate(
        eval_dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
        llm=evaluator_llm,
        embeddings=evaluator_embeddings,
    )
    
    import pandas as pd
    df = result.to_pandas()
    scores = df.select_dtypes(include=['number']).mean().to_dict()
    
    # 결과 반환
    return {
        "params": f"{chunk_size}/{chunk_overlap}",
        "metrics": scores
    }

async def main():
    experiments = [
        (500, 50),
        (800, 100),
        (1000, 200)
    ]
    
    report_path = Path(__file__).resolve().parent / "results" / "tuning_comparison.md"
    os.makedirs(report_path.parent, exist_ok=True)
    
    # 리포트 헤더 초기화
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# RAG 파라미터 튜닝 비교 리포트\n\n")
        f.write("| 실험군 (Chunk/Overlap) | Faithfulness | Relevancy | Precision | Recall |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- |\n")

    for chunk, overlap in experiments:
        try:
            res = await run_experiment(chunk, overlap)
            m = res["metrics"]
            # 결과 즉시 기록 (체크포인트)
            with open(report_path, "a", encoding="utf-8") as f:
                f.write(f"| {res['params']} | {m.get('faithfulness', 0):.4f} | {m.get('answer_relevancy', 0):.4f} | {m.get('context_precision', 0):.4f} | {m.get('context_recall', 0):.4f} |\n")
            print(f"📊 {res['params']} 결과 기록 완료")
        except Exception as e:
            print(f"❌ {chunk}/{overlap} 실험 중 오류 발생: {e}")
            continue
            
    print(f"\n✅ 모든 가능한 실험 완료! 리포트: {report_path}")

if __name__ == "__main__":
    asyncio.run(main())
