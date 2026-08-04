import type { ReactNode } from "react";

type AlertTone = "error" | "warning" | "info" | "success";

const toneStyles: Record<AlertTone, { container: string; icon: string; title: string }> = {
  error: {
    container: "border-red-200 bg-red-50 text-red-700",
    icon: "ri-error-warning-line text-red-500",
    title: "text-red-800",
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-800",
    icon: "ri-alert-line text-amber-500",
    title: "text-amber-900",
  },
  info: {
    container: "border-blue-200 bg-blue-50 text-blue-700",
    icon: "ri-information-line text-blue-500",
    title: "text-blue-800",
  },
  success: {
    container: "border-green-200 bg-green-50 text-green-700",
    icon: "ri-checkbox-circle-line text-green-500",
    title: "text-green-800",
  },
};

interface StatusAlertProps {
  title: string;
  children: ReactNode;
  tone?: AlertTone;
}

export default function StatusAlert({ title, children, tone = "error" }: StatusAlertProps) {
  const style = toneStyles[tone];

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${style.container}`}>
      <i className={`${style.icon} mt-0.5 shrink-0 text-lg`} aria-hidden="true" />
      <div className="min-w-0">
        <p className={`mb-0.5 font-semibold ${style.title}`}>{title}</p>
        <div className="text-xs leading-5 sm:text-sm">{children}</div>
      </div>
    </div>
  );
}
