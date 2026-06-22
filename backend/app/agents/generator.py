from __future__ import annotations

import logging
import re
from typing import Any, AsyncGenerator

from app.agents.protocol import AgentAction, AgentMessage
from app.core.rag_pipeline import RAGPipeline

logger = logging.getLogger(__name__)


class GeneratorAgent:
    """답변 생성, 문서 압축, citation 검증을 담당하는 에이전트."""

    def __init__(self, pipeline: RAGPipeline):
        self.pipeline = pipeline

    async def execute(self, message: AgentMessage) -> AgentMessage:
        query = message.payload.get("query")
        sources = message.payload.get("sources", [])

        if not sources:
            prepared = self.pipeline.prepare_empty_search(query)
            prompt_value = prepared["prompt_value"]
            answer_obj = await self.pipeline.llm.ainvoke(prompt_value)
            answer = answer_obj.content if hasattr(answer_obj, "content") else str(answer_obj)

            return AgentMessage(
                sender="generator",
                action=AgentAction.DONE,
                payload={
                    "answer": answer,
                    "sources": [],
                    "citation_valid": True,
                },
                reasoning="검색 결과가 없어 빈 검색으로 답변 생성 완료."
            )

        # 1. Deduplicate
        deduped = self._dedupe_documents(sources)
        # 2. Compress
        compressed = self._compress_documents(query, deduped)
        # 3. Context & Prompt
        context_text = self._build_context(compressed)
        from app.core.prompts import SEARCH_PROMPT
        prompt_value = SEARCH_PROMPT.invoke({"context": context_text, "question": query})

        # 4. Generate Answer
        answer_obj = await self.pipeline.llm.ainvoke(prompt_value)
        answer = answer_obj.content if hasattr(answer_obj, "content") else str(answer_obj)

        # 5. Citation Validation
        citation_valid = self._validate_citations(answer, deduped)

        return AgentMessage(
            sender="generator",
            action=AgentAction.DONE,
            payload={
                "answer": answer,
                "sources": deduped,
                "citation_valid": citation_valid,
                "prompt_value": prompt_value.to_string() if hasattr(prompt_value, "to_string") else str(prompt_value)
            },
            reasoning=f"답변 생성 완료 (중복제거 특허 {len(deduped)}건, 출처 검증: {citation_valid})",
        )

    async def stream_answer(self, prompt_value) -> AsyncGenerator[Any, None]:
        """답변 스트리밍을 지원하기 위한 함수."""
        async for chunk in self.pipeline.stream_answer(prompt_value):
            yield chunk

    def _dedupe_documents(self, docs: list[dict], max_per_patent: int = 1) -> list[dict]:
        """특허별 중복 청크를 제거하고 최대 max_per_patent개만 남긴다."""
        counts = {}
        deduped = []
        for doc in docs:
            app_num = doc.get("application_number")
            if not app_num:
                deduped.append(doc)
                continue
            count = counts.get(app_num, 0)
            if count < max_per_patent:
                deduped.append(doc)
                counts[app_num] = count + 1
        return deduped

    def _compress_documents(self, query: str, docs: list[dict]) -> list[dict]:
        """각 문서에서 질문과 관련성이 높은 문장을 추출하여 압축한다 (최대 420자)."""
        query_tokens = set(self._tokenize(query))
        compressed_docs = []

        for doc in docs:
            content = doc.get("full_content") or doc.get("relevance_text", "")
            sentences = self._split_sentences(content)

            scored_sentences = []
            for s in sentences:
                s_tokens = set(self._tokenize(s))
                overlap = len(query_tokens.intersection(s_tokens))
                scored_sentences.append((overlap, s))

            # 토큰 겹침이 높은 상위 2개 문장 선택
            scored_sentences.sort(key=lambda x: x[0], reverse=True)
            top_sentences = [s for _, s in scored_sentences[:2]]

            compressed_text = " ".join(top_sentences)
            if len(compressed_text) > 420:
                compressed_text = compressed_text[:417] + "..."

            new_doc = dict(doc)
            new_doc["compressed_content"] = compressed_text
            compressed_docs.append(new_doc)

        return compressed_docs

    def _build_context(self, compressed: list[dict]) -> str:
        """압축된 문서들을 결합하여 LLM context 문자열을 생성한다."""
        blocks = []
        for doc in compressed:
            header = (
                f"[특허 정보]\n"
                f"- 출원번호: {doc.get('application_number', '정보 없음')}\n"
                f"- 발명의 명칭: {doc.get('invention_title', '정보 없음')}\n"
                f"- 출원인: {doc.get('applicant_name', '정보 없음')}\n"
                f"- IPC 분류: {doc.get('ipc_number', '정보 없음')}\n"
                f"- 출원일: {doc.get('application_date', '정보 없음')}\n"
                f"- 등록상태: {doc.get('register_status', '정보 없음')}"
            )
            content = doc.get("compressed_content", "")
            blocks.append(f"{header}\n\n[문서 내용]\n{content}\n[출처: {doc.get('application_number')}]")
        return "\n\n---\n\n".join(blocks)

    def _validate_citations(self, answer: str, documents: list[dict]) -> bool:
        """답변 내 [출처: 출원번호] 형식이 실제 제공된 문서 목록 내에 존재하는지 검증한다."""
        citations = re.findall(r"\[출처:\s*([0-9\-]+)\]", answer)
        if not citations:
            return True

        valid_numbers = {doc.get("application_number") for doc in documents if doc.get("application_number")}

        for citation in citations:
            cleaned_citation = citation.replace("-", "").strip()
            matched = False
            for num in valid_numbers:
                if num.replace("-", "").strip() == cleaned_citation:
                    matched = True
                    break
            if not matched:
                logger.warning("잘못된 출처 감지: %s", citation)
                return False

        return True

    def _tokenize(self, text: str) -> list[str]:
        """한국어+영문 2자 이상의 토큰을 추출한다."""
        return re.findall(r"[가-힣]{2,}|[a-zA-Z0-9]{2,}", text.lower())

    def _split_sentences(self, text: str) -> list[str]:
        """마침표, 물음표, 느낌표를 기준으로 문장을 나눈다."""
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        return [s for s in sentences if s]
