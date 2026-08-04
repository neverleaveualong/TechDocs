import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ icon, title, description, actions }: PageHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
              <i className={`${icon} text-base text-white`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
              {description && (
                <p className="mt-0.5 hidden text-sm text-gray-500 sm:block">{description}</p>
              )}
            </div>
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
