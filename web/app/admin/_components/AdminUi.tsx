"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const adminSurfaceClass =
  "rounded-2xl border border-slate-200/75 bg-white/92 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-900/78";

export const adminSoftSurfaceClass =
  "rounded-xl border border-slate-200/75 bg-white/86 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)] dark:border-slate-800/75 dark:bg-slate-900/66";

interface AdminPageProps {
  children: ReactNode;
  className?: string;
}

export function AdminPage({ children, className }: AdminPageProps) {
  return (
    <div className={cn("admin-page-bg min-h-full p-4 sm:p-6", className)}>
      <div className="mx-auto w-full max-w-[1680px] space-y-6">{children}</div>
    </div>
  );
}

interface AdminSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AdminSection({
  title,
  description,
  actions,
  children,
  className,
}: AdminSectionProps) {
  return (
    <section className={cn(adminSurfaceClass, "p-5 sm:p-6", className)}>
      {(title || description || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

interface AdminStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}

export function AdminStatCard({ icon, label, value, hint, className }: AdminStatCardProps) {
  return (
    <div className={cn(adminSoftSurfaceClass, "p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold leading-none text-slate-900 dark:text-slate-100">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {hint ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

interface AdminEmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function AdminEmptyState({ title, description, className }: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/35",
        className
      )}
    >
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
    </div>
  );
}
