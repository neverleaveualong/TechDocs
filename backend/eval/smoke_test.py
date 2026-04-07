"""Smoke test: 2건으로 Vector vs Hybrid+Reranker 동작 확인"""
import sys
sys.path.insert(0, ".")
from app.core.rag_pipeline import RAGPipeline

pipeline = RAGPipeline()

# Test 1: Vector Only
print("=" * 50)
print("Test 1: Vector Only")
print("=" * 50)
r1 = pipeline.search("삼성전자 리튬 이차전지 관련 특허", top_k=3)
print(f"Answer: {r1['answer'][:100]}...")
print(f"Sources: {len(r1['sources'])}")
for s in r1["sources"]:
    print(f"  - {s['invention_title']} ({s['application_number']})")
    print(f"    content preview: {s['full_content'][:80]}...")
print()

# Test 2: Hybrid + Reranker
print("=" * 50)
print("Test 2: Hybrid + Reranker")
print("=" * 50)
r2 = pipeline.search("삼성전자 리튬 이차전지 관련 특허", top_k=3, use_hybrid=True, use_reranker=True)
print(f"Answer: {r2['answer'][:100]}...")
print(f"Sources: {len(r2['sources'])}")
for s in r2["sources"]:
    print(f"  - {s['invention_title']} ({s['application_number']})")
    print(f"    content preview: {s['full_content'][:80]}...")
print()

# Structure check
print("=" * 50)
print("Structure Check")
print("=" * 50)
print(f"r1 keys: {list(r1.keys())}")
print(f"r2 keys: {list(r2.keys())}")
if r1["sources"]:
    print(f"source keys: {list(r1['sources'][0].keys())}")

print()
print("SMOKE TEST COMPLETE")
