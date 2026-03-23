# Phase 0 — 설치 가이드 (혼자 따라하기)

> 예상 소요: 2~3시간
> 준비물: 인터넷 연결, 터미널

---

## Step 1: Ollama 설치 (가장 먼저 — 다운로드 오래 걸림)

### 1-1. Ollama 설치
- https://ollama.com 접속
- "Download for Windows" 클릭 → 설치

### 1-2. 모델 다운로드 (4~5GB, 먼저 시작해두기)
```bash
ollama pull llama3
```
다운로드 되는 동안 아래 작업 계속 진행.

### 1-3. 설치 확인 (다운로드 끝난 후)
```bash
ollama run llama3
```
"안녕" 입력 → 한국어 답변 오면 성공. `/bye`로 종료.

---

## Step 2: Pinecone 가입 + 인덱스 생성

### 2-1. 가입
- https://app.pinecone.io 접속
- 구글 계정으로 가입 (무료)

### 2-2. 인덱스 생성
- 대시보드 → "Create Index" 클릭
- 설정값:

```
Index Name: techdocs-patents
Dimensions: 384  (← HuggingFace all-MiniLM-L6-v2 모델의 차원)
Metric: cosine
Cloud: AWS
Region: us-east-1 (무료 티어 기본)
```

### 2-3. API 키 복사
- 좌측 메뉴 → "API Keys"
- 키 복사해서 메모장에 저장해두기

---

## Step 3: KIPRIS API 키 확인

### TechLens에서 쓰던 키 확인
```bash
cat D:/paul/projects/Techlens/TechLens_Backend/.env
```
`KIPRIS_API_KEY=...` 값이 있으면 그대로 사용.

### 없으면 새로 발급
- https://plus.kipris.or.kr 접속
- 회원가입 → 마이페이지 → API 키 발급

---

## Step 4: 프로젝트 디렉토리 생성

```bash
cd D:/paul/projects/TechDocs

# 백엔드 디렉토리
mkdir -p backend/app/api
mkdir -p backend/app/core
mkdir -p backend/app/ingestion
mkdir -p backend/app/models
mkdir -p backend/app/utils
mkdir -p backend/scripts
mkdir -p backend/tests

# 문서 디렉토리
mkdir -p docs
```

---

## Step 5: Python 가상환경 + 패키지 설치

### 5-1. 가상환경 생성
```bash
cd D:/paul/projects/TechDocs/backend
python -m venv .venv
```

### 5-2. 가상환경 활성화
```bash
# Windows (Git Bash)
source .venv/Scripts/activate

# 활성화 확인 (앞에 (.venv) 표시되면 성공)
```

### 5-3. requirements.txt 생성
`D:/paul/projects/TechDocs/backend/requirements.txt` 파일 생성:

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
langchain==0.3.14
langchain-community==0.3.14
langchain-pinecone==0.2.0
langchain-huggingface==0.1.2
pinecone-client==5.0.1
sentence-transformers==3.3.1
pydantic-settings==2.7.1
httpx==0.28.1
python-dotenv==1.0.1
xmltodict==0.14.1
python-multipart==0.0.20
```

### 5-4. 패키지 설치
```bash
pip install -r requirements.txt
```
시간 좀 걸림 (sentence-transformers가 큼). 기다리면서 Step 6 진행.

---

## Step 6: Next.js 프론트엔드 셋업

### 6-1. Next.js 프로젝트 생성
```bash
cd D:/paul/projects/TechDocs
npx create-next-app@latest frontend
```

선택지가 나오면:
```
Would you like to use TypeScript? → Yes
Would you like to use ESLint? → Yes
Would you like to use Tailwind CSS? → Yes
Would you like your code inside a `src/` directory? → Yes
Would you like to use App Router? → Yes
Would you like to use Turbopack? → Yes
Would you like to customize the import alias? → Yes → @/*
```

### 6-2. shadcn/ui 설치
```bash
cd D:/paul/projects/TechDocs/frontend
npx shadcn@latest init
```

선택지:
```
Which style would you like to use? → New York
Which color would you like to use? → Neutral
Would you like to use CSS variables? → Yes
```

### 6-3. 필요한 shadcn 컴포넌트 설치
```bash
npx shadcn@latest add button input card badge textarea tabs
```

---

## Step 7: 환경변수 파일 생성

### backend/.env
```bash
cd D:/paul/projects/TechDocs/backend
```

`.env` 파일 생성:
```env
# LLM (로컬 Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# 임베딩 (로컬 HuggingFace)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# 벡터DB (Pinecone)
PINECONE_API_KEY=여기에_복사한_키_붙여넣기
PINECONE_INDEX_NAME=techdocs-patents

# 데이터 소스
KIPRIS_API_KEY=여기에_KIPRIS_키_붙여넣기
KIPRIS_BASE_URL=http://plus.kipris.or.kr/kipo-api/kipi

# CORS
FRONTEND_URL=http://localhost:3000
```

### frontend/.env.local
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Step 8: Git 초기화

```bash
cd D:/paul/projects/TechDocs
git init
```

### .gitignore 생성
```
# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
dist/

# Node
node_modules/
.next/
out/

# 환경변수
.env
.env.local
.env*.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Pinecone / API keys
*.key
```

### 첫 커밋
```bash
git add .
git commit -m "[260323] Phase 0: 프로젝트 초기 셋업"
```

---

## Step 9: 검증 체크리스트

모든 설치 끝나면 하나씩 확인:

- [ ] `ollama run llama3` → "안녕" 입력 → 답변 옴
- [ ] Pinecone 대시보드 → techdocs-patents 인덱스 보임
- [ ] `cd backend && source .venv/Scripts/activate && python -c "import fastapi; print('OK')"` → OK
- [ ] `cd frontend && npm run dev` → http://localhost:3000 접속됨
- [ ] `.env` 파일에 API 키 전부 들어있음

**전부 체크되면 Phase 0 완료. Phase 1 시작 가능.**
