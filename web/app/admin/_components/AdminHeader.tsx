"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { adminSurfaceClass } from "./AdminUi";

interface AdminHeaderProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function AdminHeader({
  title = "管理后台",
  description,
  actions,
  className,
}: AdminHeaderProps) {
  return (
    <header className={cn(adminSurfaceClass, "px-5 py-4 sm:px-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
