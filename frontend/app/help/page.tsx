"use client";

const pipelineSteps = [
  { icon: "ri-question-line", label: "질문 입력", desc: "사용자가 자연어로 질문을 입력합니다." },
  { icon: "ri-cpu-line", label: "벡터 변환", desc: "HuggingFace 모델로 질문을 384차원 벡터로 변환합니다." },
  { icon: "ri-search-line", label: "유사도 검색", desc: "Pinecone에서 코사인 유사도 기반으로 관련 청크를 검색합니다." },
  { icon: "ri-file-text-line", label: "청크 추출", desc: "유사도가 높은 상위 5개 특허 청크를 추출합니다." },
  { icon: "ri-robot-line", label: "AI 답변 생성", desc: "추출된 청크를 컨텍스트로 llama3가 답변을 생성합니다." },
];

const techStack = [
  { category: "데이터 수집", items: [
    { name: "KIPRIS API", desc: "한국 특허정보 공공 API", icon: "ri-global-line" },
  ]},
  { category: "임베딩 & 벡터 DB", items: [
    { name: "all-MiniLM-L6-v2", desc: "HuggingFace 384차원 임베딩 모델 (로컬 실행)", icon: "ri-cpu-line" },
    { name: "Pinecone", desc: "관리형 벡터 데이터베이스, 코사인 유사도 검색", icon: "ri-database-2-line" },
  ]},
  { category: "LLM & 프레임워크", items: [
    { name: "llama3 8B", desc: "Ollama 로컬 실행 LLM, 답변 생성 담당", icon: "ri-robot-line" },
    { name: "LangChain", desc: "RAG 파이프라인 오케스트레이션 프레임워크", icon: "ri-code-line" },
  ]},
  { category: "백엔드 & 프론트엔드", items: [
    { name: "FastAPI", desc: "Python 비동기 웹 프레임워크, REST API 서빙", icon: "ri-server-line" },
    { name: "Next.js", desc: "React 기반 프론트엔드, TypeScript + Tailwind", icon: "ri-window-line" },
  ]},
];

const faqs = [
  { q: "검색 결과가 없으면 어떻게 하나요?", a: "먼저 '데이터 수집' 페이지에서 해당 기업의 특허를 수집해주세요. 수집 후 벡터 DB에 데이터가 저장되면 검색이 가능합니다." },
  { q: "어떤 질문을 해야 좋은 결과를 얻나요?", a: "구체적인 기술 키워드를 포함해주세요. 예: '2차전지 열 관리 기술', 'ERP 클라우드 마이그레이션' 등 기술 분야를 명시하면 더 정확한 결과를 얻을 수 있습니다." },
  { q: "데이터 수집 시 회사명은 어떻게 입력하나요?", a: "KIPRIS에 등록된 공식 법인명을 사용하세요. 예: 삼성전자, 에스케이하이닉스, 엘지에너지솔루션, 더존비즈온" },
  { q: "임베딩은 어떤 모델을 사용하나요?", a: "HuggingFace의 all-MiniLM-L6-v2 모델을 로컬에서 실행합니다. 384차원 벡터로 변환하여 Pinecone에 저장합니다." },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 페이지 헤더 */}
      <header className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">도움말</h1>
            <p className="mt-1 text-sm text-gray-500 hidden sm:block">
              TechDocs 플랫폼 사용법과 기술 스택 안내
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <i className="ri-question-line text-amber-500 text-sm" />
            </div>
            가이드
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-6">
        {/* FAQ */}
        <section className="animate-fade-in bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">자주 묻는 질문</h2>

          <div className="divide-y divide-gray-100">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-start gap-2">
                  <i className="ri-question-line text-teal-500 mt-0.5 shrink-0" />
                  {faq.q}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed pl-6">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RAG 파이프라인 */}
        <section className="animate-fade-in-1 bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">RAG 파이프라인</h2>
          <p className="text-xs text-gray-500 mb-5">
            Retrieval-Augmented Generation — 질문에 관련된 문서를 검색한 뒤, LLM이 답변을 생성하는 방식입니다.
          </p>

          <div className="space-y-3">
            {pipelineSteps.map((step, i) => (
              <div key={step.label} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                    <i className={`${step.icon} text-teal-600 text-base`} />
                  </div>
                  {i < pipelineSteps.length - 1 && (
                    <div className="w-px h-4 bg-teal-100 mt-1" />
                  )}
                </div>
                <div className="pt-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                      {i + 1}단계
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900">{step.label}</h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 기술 스택 */}
        <section className="animate-fade-in-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <h2 className="text-base font-bold text-gray-900 mb-5">기술 스택</h2>

          <div className="space-y-5">
            {techStack.map((group) => (
              <div key={group.category}>
                <h3 className="text-[11px] font-bold text-teal-600 uppercase tracking-widest mb-2.5">
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {group.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0">
                        <i className={`${item.icon} text-teal-600 text-sm`} />
                      </div>
                      <div>
                        <h4 className="text-[13px] font-semibold text-gray-900">{item.name}</h4>
                        <p className="text-[11px] text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
