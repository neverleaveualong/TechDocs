import PageHeader from "@/components/common/PageHeader";
import Link from "next/link";

const allFaqs = [
  {
    category: "기능 활용 & 사용 시점",
    icon: "ri-compass-3-line",
    items: [
      {
        q: "Q. 어떤 기능을 언제 사용해야 하나요?",
        a: "TechDocs는 목적에 따라 3가지 주요 기능을 제공합니다:\n\n• [특허 검색 & AI 질의응답]: 특정 기술이나 특허에 대해 AI에게 직접 질문하고 답변을 얻고 싶을 때 (자동 수집 연동)\n• [기업별 특허 수집]: 특정 기업의 전체 특허를 한꺼번에 미리 지식베이스에 대량 구축하고 싶을 때\n• [수집 데이터 대시보드]: 수집된 특허 데이터의 총량, 기업별 비중, AI 분석 완료율을 모니터링할 때",
        hasLink: true,
        links: [
          { text: "특허 검색", href: "/search" },
          { text: "기업 수집", href: "/upload" },
          { text: "대시보드", href: "/dashboard" },
        ],
      },
      {
        q: "Q. 검색창에 키워드나 질문을 입력하면 어떻게 작동하나요?",
        a: "A. 지식베이스에 없는 특허라도 검색 시 KIPRIS 공공 API와 실시간 연동되어 [자동 수집 ➔ AI 청구항 파싱 ➔ 즉시 답변 생성] 과정이 백그라운드에서 원스톱으로 처리됩니다.",
      },
      {
        q: "Q. '기업별 특허 수집' 기능은 '특허 검색'과 무엇이 다른가요?",
        a: "A. '특허 검색'은 질문 시 관련 특허를 온디맨드로 자동 수집하지만, '기업별 특허 수집'은 특정 회사(예: 삼성전자, 더존비즈온 등)의 전체 특허 수백 건을 사전에 미리 한꺼번에 대량 구축할 때 사용하는 기능입니다.",
      },
      {
        q: "Q. 대시보드는 어떤 용도로 확인하나요?",
        a: "A. 수집된 실제 특허 총량, 주요 출원 기업별 비중 차트, AI 특허 분석 완료율(%) 및 KIPRIS API 일일/월간 호출 한도 상태를 한눈에 파악할 때 사용합니다.",
      },
    ],
  },
  {
    category: "실전 이용 팁 & 주요 이슈",
    icon: "ri-lightbulb-line",
    items: [
      {
        q: "Q. 회사명 입력 시 '수집 결과 없음'이 뜨는 이유는 무엇인가요?",
        a: "A. '삼성'이나 '더존' 같은 약어를 입력하면 공공 API 검색이 제한될 수 있습니다. '삼성전자' 또는 '삼성전자주식회사', '주식회사 더존비즈온'처럼 KIPRIS에 등록된 정식 법인명을 사용하셔야 정확히 수집됩니다.",
      },
      {
        q: "Q. KIPRIS 일일 수집 한도 초과 알림이 뜨면 어떻게 하나요?",
        a: "A. 공공 KIPRIS API 일일 연동 한도(예: 일 200회)가 소진되면 신규 수집이 당일 일시 제한될 수 있습니다. 기존에 수집된 데이터는 정상 조회 가능하며, 대시보드에서 당일 잔여 한도를 확인하실 수 있습니다.",
      },
      {
        q: "Q. AI 특허 분석 완료율이 100%가 아닌 이유는 무엇인가요?",
        a: "A. 최근 공개되었거나 특허 명세서 서식이 독특한 일부 특허는 청구항 및 구성요소 파싱 작업이 백그라운드에서 순차 진행 중일 수 있습니다. 대시보드에서 전체 분석 완료율(%)을 실시간 모니터링하실 수 있습니다.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      <PageHeader
        icon="ri-question-line"
        title="도움말 & Q&A 가이드"
        description="플랫폼 주요 기능과 실전 사용법을 Q&A 형태로 쉽고 직관적으로 안내해 드립니다."
      />

      <main className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        {allFaqs.map((section) => (
          <section key={section.category} className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
                <i className={`${section.icon} text-sm`} />
              </div>
              <h2 className="text-base font-bold text-gray-900">{section.category}</h2>
            </div>

            <div className="space-y-4">
              {section.items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-gray-200/80 bg-white p-6 shadow-xs transition-all hover:border-gray-300"
                >
                  <h3 className="text-sm font-extrabold text-gray-900 flex items-start gap-2">
                    <span className="text-teal-600 shrink-0">{item.q.split(" ")[0]}</span>
                    <span>{item.q.substring(item.q.indexOf(" ") + 1)}</span>
                  </h3>

                  <div className="mt-3 text-xs leading-relaxed text-gray-600 whitespace-pre-line pl-6 border-l-2 border-teal-100">
                    {item.a}
                  </div>

                  {item.hasLink && item.links && (
                    <div className="mt-4 pl-6 flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                      {item.links.map((link) => (
                        <Link
                          key={link.text}
                          href={link.href}
                          className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-1.5 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100"
                        >
                          <span>{link.text} 바로가기</span>
                          <i className="ri-arrow-right-line text-[11px]" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
