"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const mainMenu = [
  { href: "/", icon: "ri-home-line", activeIcon: "ri-home-fill", label: "홈", exact: true },
  { href: "/search", icon: "ri-robot-line", activeIcon: "ri-robot-fill", label: "AI 검색" },
  { href: "/upload", icon: "ri-database-2-line", activeIcon: "ri-database-2-fill", label: "데이터 수집" },
  { href: "/dashboard", icon: "ri-bar-chart-line", activeIcon: "ri-bar-chart-fill", label: "대시보드" },
];

const bottomMenu = [
  { href: "/help", icon: "ri-question-line", activeIcon: "ri-question-fill", label: "도움말" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const renderLink = (item: { href: string; icon: string; activeIcon: string; label: string; exact?: boolean }) => {
    const active = isActive(item.href, item.exact);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={`
            group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium
            transition-all duration-150
            ${active
              ? "bg-teal-50 text-teal-800 font-semibold"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }
          `}
        >
          <i
            className={`${active ? item.activeIcon : item.icon} text-base ${
              active ? "text-teal-600" : "text-gray-400 group-hover:text-gray-600"
            }`}
          />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 w-60 h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* 로고 */}
      <div className="px-5 pt-6 pb-5">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="TechDocs" className="w-8 h-8 rounded-lg" />
          <div>
            <span className="text-[15px] font-bold tracking-tight block">
              <span className="text-teal">T</span>
              <span className="text-gray-900">ech</span>
              <span className="text-teal">D</span>
              <span className="text-gray-900">ocs</span>
            </span>
            <span className="block text-[10px] text-gray-400 -mt-0.5 tracking-wide">
              Patent AI Platform
            </span>
          </div>
        </Link>
      </div>

      <div className="mx-4 border-t border-gray-100" />

      {/* 메인 메뉴 */}
      <nav className="flex-1 px-3 pt-4 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Menu
        </p>
        <ul className="space-y-1">
          {mainMenu.map(renderLink)}
        </ul>
      </nav>

      {/* 하단 메뉴 */}
      <div className="mx-4 border-t border-gray-100" />
      <div className="px-3 py-3">
        <ul className="space-y-1">
          {bottomMenu.map(renderLink)}
        </ul>
      </div>
    </aside>
  );
}
