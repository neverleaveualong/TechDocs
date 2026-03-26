import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "TechDocs — 특허 AI 검색",
  description: "RAG 기반 특허 문서 AI 검색 플랫폼",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="min-h-screen" style={{ marginLeft: "240px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
