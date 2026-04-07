# Phase 3: Hybrid Search + Reranker 비교 실험

실행일시: 2026-04-07 13:43
테스트셋: 10개 질문

| 실험 | Faithfulness | Relevancy | Precision | Recall |
|:---|:---|:---|:---|:---|
| Vector Only | 0.7194 | 0.3051 | 0.735 | 0.9 |
| Hybrid (BM25+Vector+RRF) | 0.7353 | 0.2646 | 0.9589 | 1.0 |
| **Hybrid + Reranker** | 0.4834 | 0.1637 | 0.4589 | 0.4 |

---

## 분석

- Vector Only: 기존 순수 벡터 검색 (Phase 2 기준)
- Hybrid: BM25(키워드) + Vector(의미) + RRF 순위 병합
- Hybrid + Reranker: Hybrid 후 Flashrank로 2차 정렬
