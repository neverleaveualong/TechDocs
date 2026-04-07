"""
RAGAS 평가 CLI 실행 스크립트

사용법:
    cd backend
    python -m eval.run_eval          # Baseline 측정
    python -m eval.run_eval --save   # 결과를 JSON으로 저장
"""

import argparse
import sys
from pathlib import Path

# 프로젝트 루트를 path에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.evaluator import evaluate_baseline, save_results


def main():
    parser = argparse.ArgumentParser(description="TechDocs RAGAS 평가 도구")
    parser.add_argument(
        "--save",
        action="store_true",
        help="결과를 JSON 파일로 저장",
    )
    parser.add_argument(
        "--type",
        choices=["baseline", "all"],
        default="baseline",
        help="평가 유형 (기본: baseline)",
    )
    args = parser.parse_args()

    print("🚀 TechDocs RAG 평가 시작\n")

    if args.type == "baseline":
        result_data = evaluate_baseline()
    elif args.type == "all":
        result_data = evaluate_baseline()

    if args.save:
        filepath = save_results(result_data)
        print(f"\n✅ 결과가 저장되었습니다: {filepath}")
    else:
        print(f"\n📊 결과 요약: {result_data['metrics']}")

    print("\n✅ 평가 완료!")


if __name__ == "__main__":
    main()
