"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavigationActive,
  primaryNavigation,
  type NavigationItem,
  utilityNavigation,
} from "@/components/layout/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const renderLink = (item: NavigationItem) => {
    const active = isNavigationActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
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
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-gray-200 bg-white lg:flex">
      {/* 로고 */}
      <div className="px-5 pt-6 pb-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/favicon.svg" alt="" width={32} height={32} className="rounded-lg" priority />
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
          {primaryNavigation.map(renderLink)}
        </ul>
      </nav>

      {/* 하단 메뉴 */}
      <div className="mx-4 border-t border-gray-100" />
      <div className="px-3 py-3">
        <ul className="space-y-1">
          {utilityNavigation.map(renderLink)}
        </ul>
      </div>
    </aside>
  );
}
