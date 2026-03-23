# TechDocs 핵심 코드 템플릿 (Phase 1~3)

> 클로드 없이도 참고할 수 있도록 핵심 코드를 미리 정리
> 복붙이 아니라 **구조와 흐름을 이해**하면서 작성할 것

---

## Phase 1: FastAPI 백엔드 기초

### backend/app/config.py

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Ollama (로컬 LLM)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # 임베딩 (로컬 HuggingFace)
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Pinecone
    pinecone_api_key: str
    pinecone_index_name: str = "techdocs-patents"

    # KIPRIS
    kipris_api_key: str
    kipris_base_url: str = "http://plus.kipris.or.kr/kipo-api/kipi"

    # CORS
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
```

**왜 pydantic-settings인가?**
- `.env` 파일에서 자동으로 환경변수 로드
- 타입 검증: 누락되면 앱 시작 시 바로 에러 → 런타임 에러 방지
- TechLens의 `requireEnv()` 패턴을 Python에서 더 안전하게 구현한 것

---

### backend/app/main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import api_router

app = FastAPI(
    title="TechDocs API",
    description="RAG 기반 특허 문서 AI 검색 API",
    version="1.0.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

**실행 명령어:**
```bash
cd backend
source .venv/Scripts/activate
uvicorn app.main:app --reload --port 8000
```

브라우저에서 `http://localhost:8000/docs` → Swagger UI 확인

---

### backend/app/api/router.py

```python
from fastapi import APIRouter

from app.api.search import router as search_router
from app.api.ingest import router as ingest_router
from app.api.patents import router as patents_router

api_router = APIRouter()
api_router.include_router(search_router, prefix="/search", tags=["search"])
api_router.include_router(ingest_router, prefix="/ingest", tags=["ingest"])
api_router.include_router(patents_router, prefix="/patents", tags=["patents"])
```

---

### backend/app/ingestion/kipris_client.py

```python
import httpx
import xmltodict

from app.config import settings


class KiprisClient:
    """KIPRIS Open API 클라이언트"""

    def __init__(self):
        self.base_url = settings.kipris_base_url
        self.api_key = settings.kipris_api_key

    async def search_patents(
        self,
        applicant: str,
        start_date: str = "",
        end_date: str = "",
        page: int = 1,
        num_of_rows: int = 20,
    ) -> list[dict]:
        """출원인 기반 특허 검색"""
        url = f"{self.base_url}/patUtiModInfoSearchSevice/getAdvancedSearch"
        params = {
            "ServiceKey": self.api_key,
            "applicant": applicant,
            "numOfRows": num_of_rows,
            "pageNo": page,
        }
        if start_date:
            params["applicationDateFrom"] = start_date
        if end_date:
            params["applicationDateTo"] = end_date

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        data = xmltodict.parse(response.text)

        # XML 구조에서 특허 리스트 추출
        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])

        # 단건이면 리스트로 래핑
        if isinstance(items, dict):
            items = [items]

        return items


kipris_client = KiprisClient()
```

**왜 httpx인가?**
- async 지원 (FastAPI와 궁합)
- requests보다 모던한 HTTP 클라이언트
- TechLens 백엔드의 axios 역할

---

## Phase 2: 인제스트 파이프라인 (핵심)

### backend/app/core/embeddings.py

```python
from langchain_huggingface import HuggingFaceEmbeddings

from app.config import settings


def get_embeddings():
    """HuggingFace 임베딩 모델 (로컬, 무료)"""
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
```

**왜 all-MiniLM-L6-v2인가?**
- 무료, 로컬 실행
- 384차원 (가벼움, Pinecone 무료 티어에 적합)
- 다국어 지원 (한국어 특허 텍스트 처리 가능)
- 프로덕션에서는 OpenAI embedding으로 교체 가능 (config만 변경)

---

### backend/app/ingestion/document_loader.py

```python
from langchain_core.documents import Document


def patent_to_document(patent: dict) -> Document:
    """KIPRIS 특허 1건을 LangChain Document로 변환

    왜 Document로 변환하는가?
    - LangChain의 표준 데이터 형식
    - page_content: 검색 대상 텍스트 (임베딩됨)
    - metadata: 검색 결과에 함께 반환할 부가 정보
    """
    # 검색에 필요한 텍스트 필드를 하나의 문자열로 결합
    content_parts = [
        f"발명의 명칭: {patent.get('inventionTitle', '')}",
        f"출원인: {patent.get('applicantName', '')}",
        f"초록: {patent.get('astrtCont', '')}",
        f"IPC 분류: {patent.get('ipcNumber', '')}",
    ]

    return Document(
        page_content="\n".join(part for part in content_parts if part.split(": ", 1)[-1]),
        metadata={
            "application_number": patent.get("applicationNumber", ""),
            "application_date": patent.get("applicationDate", ""),
            "register_status": patent.get("registerStatus", ""),
            "applicant_name": patent.get("applicantName", ""),
            "invention_title": patent.get("inventionTitle", ""),
            "source": "kipris",
        },
    )


def patents_to_documents(patents: list[dict]) -> list[Document]:
    """여러 특허를 Document 리스트로 변환"""
    return [patent_to_document(p) for p in patents if p.get("inventionTitle")]
```

---

### backend/app/ingestion/text_splitter.py

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter


def get_text_splitter():
    """텍스트 청킹 설정

    왜 500자, overlap 50인가?
    - 특허 초록 평균 길이: 200~600자
    - 500자면 대부분의 초록이 1~2청크로 분할
    - overlap 50으로 청크 경계에서 문맥이 끊기지 않도록
    - 면접 포인트: 300/500/1000으로 실험 → 500이 최적이었다고 설명
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
```

---

### backend/app/core/vectorstore.py

```python
from pinecone import Pinecone
from langchain_pinecone import PineconeVectorStore

from app.config import settings
from app.core.embeddings import get_embeddings


def get_vectorstore():
    """Pinecone 벡터스토어 연결

    왜 Pinecone인가?
    - 관리형 서비스: 인프라 관리 불필요
    - 무료 티어: 1 인덱스, 2GB (포폴 충분)
    - cosine similarity: 텍스트 유사도 검색에 가장 적합
    - 프로덕션 레벨 안정성
    """
    pc = Pinecone(api_key=settings.pinecone_api_key)

    return PineconeVectorStore(
        index=pc.Index(settings.pinecone_index_name),
        embedding=get_embeddings(),
    )


def add_documents(documents):
    """문서를 Pinecone에 추가 (임베딩 자동 생성)"""
    vectorstore = get_vectorstore()
    vectorstore.add_documents(documents)
    return len(documents)
```

---

### backend/app/ingestion/pipeline.py

```python
from app.ingestion.kipris_client import kipris_client
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.text_splitter import get_text_splitter
from app.core.vectorstore import add_documents


async def ingest_patents(
    applicant: str,
    start_date: str = "",
    end_date: str = "",
    pages: int = 5,
) -> dict:
    """전체 인제스트 파이프라인

    흐름: KIPRIS 수집 → Document 변환 → 청킹 → 임베딩 → Pinecone 저장

    왜 이 순서인가?
    1. 원본 데이터 수집 (KIPRIS API)
    2. LangChain Document 형식으로 통일 (표준화)
    3. 긴 텍스트를 청크로 분할 (검색 정밀도 향상)
    4. 벡터로 변환 + DB 저장 (의미 검색 가능하게)
    """
    all_patents = []

    # 1. KIPRIS에서 특허 수집
    for page in range(1, pages + 1):
        patents = await kipris_client.search_patents(
            applicant=applicant,
            start_date=start_date,
            end_date=end_date,
            page=page,
        )
        all_patents.extend(patents)

    if not all_patents:
        return {"status": "no_data", "count": 0}

    # 2. Document 변환
    documents = patents_to_documents(all_patents)

    # 3. 청킹
    text_splitter = get_text_splitter()
    chunks = text_splitter.split_documents(documents)

    # 4. Pinecone에 저장 (임베딩 자동 생성)
    count = add_documents(chunks)

    return {
        "status": "success",
        "patents_collected": len(all_patents),
        "chunks_created": len(chunks),
        "vectors_stored": count,
    }
```

---

### backend/app/api/ingest.py

```python
from fastapi import APIRouter
from pydantic import BaseModel

from app.ingestion.pipeline import ingest_patents

router = APIRouter()


class IngestRequest(BaseModel):
    applicant: str
    start_date: str = ""
    end_date: str = ""
    pages: int = 5


class IngestResponse(BaseModel):
    status: str
    patents_collected: int = 0
    chunks_created: int = 0
    vectors_stored: int = 0


@router.post("/", response_model=IngestResponse)
async def ingest(request: IngestRequest):
    """특허 데이터 인제스트 (수집 → 임베딩 → Pinecone 저장)"""
    result = await ingest_patents(
        applicant=request.applicant,
        start_date=request.start_date,
        end_date=request.end_date,
        pages=request.pages,
    )
    return result
```

---

## Phase 3: RAG 검색 파이프라인 (핵심)

### backend/app/core/llm.py

```python
from langchain_community.llms import Ollama

from app.config import settings


def get_llm():
    """Ollama 로컬 LLM

    왜 Ollama인가?
    - 무료 (API 비용 $0)
    - 로컬 실행 → 데이터 외부 유출 없음
    - llama3 8B → 16GB RAM이면 충분
    - 프로덕션: config만 바꾸면 OpenAI/Azure로 전환 가능
    """
    return Ollama(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        temperature=0.3,  # 낮을수록 일관된 답변 (특허 분석은 정확성 중요)
    )
```

---

### backend/app/core/prompts.py

```python
from langchain_core.prompts import PromptTemplate

SEARCH_PROMPT = PromptTemplate.from_template("""당신은 특허 문서 분석 전문가입니다.
아래 검색된 특허 문서들을 참고하여 사용자의 질문에 답변하세요.

[검색된 특허 문서]
{context}

[질문]
{question}

답변 규칙:
1. 검색된 특허 문서의 내용만을 근거로 답변하세요.
2. 관련 특허의 출원번호와 발명의 명칭을 반드시 인용하세요.
3. 검색 결과에 관련 정보가 없으면 "관련 특허를 찾지 못했습니다"라고 답하세요.
4. 한국어로 답변하세요.
5. 답변은 구조화하여 읽기 쉽게 작성하세요.
""")

SUMMARY_PROMPT = PromptTemplate.from_template("""당신은 특허 문서 분석 전문가입니다.
아래 특허 문서의 핵심 내용을 요약해주세요.

[특허 문서]
{document}

요약 규칙:
1. 핵심 기술을 3줄 이내로 요약하세요.
2. 주요 청구항이 있다면 핵심만 설명하세요.
3. 한국어로 작성하세요.
""")
```

**왜 프롬프트를 이렇게 설계했는가? (면접 포인트)**
- "문서의 내용만을 근거로" → 할루시네이션 방지 (RAG의 핵심 가치)
- "출원번호를 인용" → 출처 추적 가능 (신뢰성)
- "없으면 모른다고 답해" → LLM이 지어내는 것 방지
- temperature 0.3 → 창의적 답변보다 정확한 답변 우선

---

### backend/app/core/rag_pipeline.py

```python
from langchain.chains import RetrievalQA

from app.core.llm import get_llm
from app.core.vectorstore import get_vectorstore
from app.core.prompts import SEARCH_PROMPT


class RAGPipeline:
    """RAG 파이프라인 — 벡터 검색 + LLM 답변 생성

    전체 흐름:
    1. 사용자 질문을 임베딩 (HuggingFace)
    2. Pinecone에서 유사 문서 검색 (cosine similarity, top-k)
    3. 검색된 문서를 컨텍스트로 조합
    4. LLM에 컨텍스트 + 질문 전달 → 답변 생성
    """

    def __init__(self):
        self.vectorstore = get_vectorstore()
        self.llm = get_llm()

    def search(self, query: str, top_k: int = 5) -> dict:
        """RAG 검색 실행"""

        # 1~2. 유사 문서 검색 (임베딩 + Pinecone 검색 자동 수행)
        retriever = self.vectorstore.as_retriever(
            search_kwargs={"k": top_k}
        )

        # 3~4. 컨텍스트 조합 + LLM 답변 생성
        qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",  # 검색된 문서를 하나로 합쳐서 전달
            retriever=retriever,
            return_source_documents=True,
            chain_type_kwargs={"prompt": SEARCH_PROMPT},
        )

        result = qa_chain.invoke({"query": query})

        # 응답 구성
        sources = []
        for doc in result.get("source_documents", []):
            sources.append({
                "invention_title": doc.metadata.get("invention_title", ""),
                "applicant_name": doc.metadata.get("applicant_name", ""),
                "application_number": doc.metadata.get("application_number", ""),
                "application_date": doc.metadata.get("application_date", ""),
                "relevance_text": doc.page_content[:200],
            })

        return {
            "answer": result["result"],
            "sources": sources,
            "query": query,
        }

    def similarity_search(self, query: str, top_k: int = 5) -> list[dict]:
        """유사 문서만 검색 (LLM 답변 생성 없이)"""
        results = self.vectorstore.similarity_search_with_score(query, k=top_k)

        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": float(score),
            }
            for doc, score in results
        ]


# 싱글톤
rag_pipeline = RAGPipeline()
```

**왜 chain_type="stuff"인가? (면접 포인트)**
- stuff: 모든 문서를 하나로 합침 (간단, 문서가 적을 때 적합)
- map_reduce: 각 문서를 개별 처리 후 합침 (문서 많을 때)
- refine: 문서를 순차적으로 처리하며 답변 개선
- 특허 검색은 top-5 문서라 stuff로 충분. 문서가 많아지면 map_reduce 전환.

---

### backend/app/api/search.py

```python
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.rag_pipeline import rag_pipeline

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class PatentSource(BaseModel):
    invention_title: str
    applicant_name: str
    application_number: str
    application_date: str
    relevance_text: str


class SearchResponse(BaseModel):
    answer: str
    sources: list[PatentSource]
    query: str


@router.post("/", response_model=SearchResponse)
async def search(request: SearchRequest):
    """RAG 검색 — 자연어 질문 → AI 답변 + 출처 특허"""
    result = rag_pipeline.search(
        query=request.query,
        top_k=request.top_k,
    )
    return result


class SimilarityRequest(BaseModel):
    query: str
    top_k: int = 5


@router.post("/similar")
async def similarity_search(request: SimilarityRequest):
    """유사도 검색만 (LLM 답변 없이)"""
    results = rag_pipeline.similarity_search(
        query=request.query,
        top_k=request.top_k,
    )
    return {"results": results}
```

---

### backend/scripts/seed_patents.py

```python
"""초기 데이터 시딩 스크립트

사용법:
  cd backend
  source .venv/Scripts/activate
  python -m scripts.seed_patents
"""
import asyncio
from app.ingestion.pipeline import ingest_patents


# 시딩할 회사 목록 (다양한 업종)
SEED_COMPANIES = [
    "삼성전자",
    "LG에너지솔루션",
    "현대자동차",
    "SK하이닉스",
    "카카오",
    "네이버",
    "더존비즈온",
]


async def seed():
    for company in SEED_COMPANIES:
        print(f"\n{'='*50}")
        print(f"수집 중: {company}")
        print(f"{'='*50}")

        result = await ingest_patents(
            applicant=company,
            pages=3,  # 회사당 ~60건
        )
        print(f"결과: {result}")


if __name__ == "__main__":
    asyncio.run(seed())
    print("\n시딩 완료!")
```

---

## 테스트 명령어

### 백엔드 실행
```bash
cd D:/paul/projects/TechDocs/backend
source .venv/Scripts/activate
uvicorn app.main:app --reload --port 8000
```

### Ollama 실행 (별도 터미널)
```bash
ollama serve
```

### 시딩 실행
```bash
cd D:/paul/projects/TechDocs/backend
source .venv/Scripts/activate
python -m scripts.seed_patents
```

### API 테스트 (curl)
```bash
# 헬스 체크
curl http://localhost:8000/health

# 인제스트
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"applicant": "삼성전자", "pages": 1}'

# RAG 검색
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "2차전지 열 관리 기술", "top_k": 5}'
```

### Swagger UI
브라우저에서 `http://localhost:8000/docs` → 모든 API 테스트 가능
