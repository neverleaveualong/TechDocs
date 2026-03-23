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
