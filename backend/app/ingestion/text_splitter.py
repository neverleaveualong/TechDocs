import logging
import re
import math
from typing import List
from langchain.text_splitter import TextSplitter
from app.core.embeddings import get_embeddings

logger = logging.getLogger(__name__)


def dot_product(a, b):
    return sum(x * y for x, y in zip(a, b))


class SemanticTextSplitter(TextSplitter):
    def __init__(
        self,
        buffer_size: int = 2,
        threshold_step: float = 1.25,
        min_chunk_size: int = 200,
        max_chunk_size: int = 1500,
        **kwargs
    ):
        super().__init__(**kwargs)
        self.buffer_size = buffer_size
        self.threshold_step = threshold_step
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self._embeddings = None

    @property
    def embeddings(self):
        if self._embeddings is None:
            self._embeddings = get_embeddings()
        return self._embeddings

    def split_text(self, text: str) -> List[str]:
        if not text or not text.strip():
            return []

        # 1. 문장 단위 1차 분할
        # 특허 단락 번호 [0001], 1., 가. 및 일반 마침표 기준으로 문장 쪼개기
        sentence_end = re.compile(r'(?<=[.!?])\s+|(?=\[\d{4}\])|(?<=\[\d{4}\])|(?=\d+\.\s+)|(?<=\n)')
        raw_sentences = [s.strip() for s in sentence_end.split(text) if s.strip()]
        
        if not raw_sentences:
            return [text]

        # 너무 짧은 문장 조각(예: "도 1.", "표 2.") 방지를 위한 병합
        sentences = []
        temp_sent = ""
        for s in raw_sentences:
            if len(s) < 10 and temp_sent:  # 10자 미만의 조각은 이전 문장에 임시로 붙임
                temp_sent += " " + s
            else:
                if temp_sent:
                    sentences.append(temp_sent)
                temp_sent = s
        if temp_sent:
            sentences.append(temp_sent)

        if len(sentences) <= 1:
            return sentences

        # 2. 문맥 버퍼 그룹화 (윈도우 생성)
        buffered_sentences = []
        for i in range(len(sentences)):
            start = max(0, i - self.buffer_size)
            end = min(len(sentences), i + self.buffer_size + 1)
            context = " ".join(sentences[start:end])
            buffered_sentences.append(context)

        # 3. 임베딩 벡터 생성
        try:
            # OpenAI Embeddings API 호출
            vectors = self.embeddings.embed_documents(buffered_sentences)
        except Exception as e:
            logger.error("Failed to generate embeddings during semantic chunking: %s. Falling back to simple paragraph splitting.", e)
            return [text]

        if len(vectors) <= 1:
            return [text]

        # 4. 연속된 문맥 간 코사인 유사도 및 거리(1 - 유사도) 계산
        # OpenAI 임베딩은 크기가 1인 정규화 벡터이므로 내적이 곧 코사인 유사도
        distances = []
        for i in range(len(vectors) - 1):
            sim = dot_product(vectors[i], vectors[i+1])
            # 유사도 범위 [ -1, 1 ] 임을 감안해 거리를 [0, 2] 범위로 변환
            dist = 1.0 - sim
            distances.append(dist)

        # 5. 분할 임계치(Threshold) 설정: 평균 + (표준편차 * threshold_step)
        mean_dist = sum(distances) / len(distances)
        variance = sum((x - mean_dist) ** 2 for x in distances) / len(distances)
        std_dist = math.sqrt(variance)
        threshold = mean_dist + self.threshold_step * std_dist

        # 6. 임계치를 초과하는 지점에서 분할
        chunks = []
        current_chunk = []
        
        for i, sentence in enumerate(sentences):
            current_chunk.append(sentence)
            # 마지막 문장이 아니면서 거리가 임계치를 초과하면 분할
            if i < len(distances) and distances[i] > threshold:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
        if current_chunk:
            chunks.append(" ".join(current_chunk))

        # 7. 하드 캡(Min/Max) 보정
        final_chunks = []
        for chunk in chunks:
            chunk_len = len(chunk)
            
            # 너무 긴 청크는 강제로 자름 (Max Chunk Size 제한)
            if chunk_len > self.max_chunk_size:
                # 임시로 글자수 기반 서브 청킹 수행
                sub_sentences = [s.strip() for s in sentence_end.split(chunk) if s.strip()]
                sub_chunk = []
                sub_len = 0
                for s in sub_sentences:
                    if sub_len + len(s) > self.max_chunk_size and sub_chunk:
                        final_chunks.append(" ".join(sub_chunk))
                        sub_chunk = [s]
                        sub_len = len(s)
                    else:
                        sub_chunk.append(s)
                        sub_len += len(s)
                if sub_chunk:
                    final_chunks.append(" ".join(sub_chunk))
            
            # 너무 짧은 청크는 이전 청크에 병합 (Min Chunk Size 제한)
            elif chunk_len < self.min_chunk_size and final_chunks:
                final_chunks[-1] += " " + chunk
            else:
                final_chunks.append(chunk)

        # 빈 청크 필터링
        return [c.strip() for c in final_chunks if c.strip()]


def get_text_splitter():
    """시맨틱 청킹 설정"""
    return SemanticTextSplitter(
        buffer_size=2,
        threshold_step=1.25,
        min_chunk_size=200,
        max_chunk_size=1500
    )
