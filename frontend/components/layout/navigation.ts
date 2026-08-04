export interface NavigationItem {
  href: string;
  icon: string;
  activeIcon: string;
  label: string;
  exact?: boolean;
}

export const primaryNavigation: NavigationItem[] = [
  { href: "/", icon: "ri-home-line", activeIcon: "ri-home-fill", label: "홈", exact: true },
  { href: "/search", icon: "ri-robot-line", activeIcon: "ri-robot-fill", label: "AI 검색" },
  { href: "/dashboard", icon: "ri-bar-chart-line", activeIcon: "ri-bar-chart-fill", label: "대시보드" },
];

export const utilityNavigation: NavigationItem[] = [
  { href: "/help", icon: "ri-question-line", activeIcon: "ri-question-fill", label: "도움말" },
];

export function isNavigationActive(pathname: string, item: NavigationItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
