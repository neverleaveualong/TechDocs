import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import MobileNavigation from "@/components/layout/MobileNavigation";
import Providers from "@/app/providers";

export const metadata: Metadata = {
  title: "TechDocs — 특허 AI 검색",
  description: "RAG 기반 특허 문서 AI 검색 플랫폼",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <Sidebar />
          <MobileNavigation />
          <main className="min-h-screen pb-20 lg:ml-60 lg:pb-0">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
