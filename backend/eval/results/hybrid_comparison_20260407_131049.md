# Phase 3: Hybrid Search + Reranker 비교 실험

실행일시: 2026-04-07 13:10
테스트셋: 20개 질문

| 실험 | Faithfulness | Relevancy | Precision | Recall |
|:---|:---|:---|:---|:---|
| Vector Only | - | - | - | - |
| Hybrid (BM25+Vector+RRF) | - | - | - | - |
| **Hybrid + Reranker** | - | - | - | - |

---

## 분석

- Vector Only: 기존 순수 벡터 검색 (Phase 2 기준)
- Hybrid: BM25(키워드) + Vector(의미) + RRF 순위 병합
- Hybrid + Reranker: Hybrid 후 Flashrank로 2차 정렬
