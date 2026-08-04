"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isNavigationActive,
  primaryNavigation,
  utilityNavigation,
} from "@/components/layout/navigation";

export default function MobileNavigation() {
  const pathname = usePathname();
  const navigation = [...primaryNavigation, ...utilityNavigation];

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2.5" aria-label="TechDocs 홈">
          <Image src="/favicon.svg" alt="" width={32} height={32} className="rounded-lg" priority />
          <div>
            <span className="block text-sm font-bold tracking-tight text-gray-900">
              <span className="text-teal-600">T</span>ech<span className="text-teal-600">D</span>ocs
            </span>
            <span className="block text-[9px] tracking-wide text-gray-400">Patent AI Platform</span>
          </div>
        </Link>
        <span className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">
          Portfolio demo
        </span>
      </header>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-4 gap-1">
          {navigation.map((item) => {
            const active = isNavigationActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${
                    active ? "bg-teal-50 text-teal-700" : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <i className={`${active ? item.activeIcon : item.icon} text-lg`} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
