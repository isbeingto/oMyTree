"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Eye,
  FileText,
  Image,
  LayoutDashboard,
  Server,
  Settings,
  TrendingUp,
  TreeDeciduous,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    id: "core",
    title: "核心",
    items: [
      {
        href: "/admin/dashboard",
        label: "仪表盘",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        href: "/admin/providers",
        label: "服务商",
        icon: <Server className="h-4 w-4" />,
      },
      {
        href: "/admin/users",
        label: "用户",
        icon: <Users className="h-4 w-4" />,
      },
    ],
  },
  {
    id: "operations",
    title: "运营",
    items: [
      {
        href: "/admin/usage",
        label: "LLM 用量",
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        href: "/admin/stats",
        label: "统计",
        icon: <TrendingUp className="h-4 w-4" />,
      },
      {
        href: "/admin/docs",
        label: "文档",
        icon: <FileText className="h-4 w-4" />,
      },
      {
        href: "/admin/landing-media",
        label: "首页媒体",
        icon: <Image className="h-4 w-4" />,
      },
    ],
  },
  {
    id: "system",
    title: "系统",
    items: [
      {
        href: "/admin/settings",
        label: "设置",
        icon: <Settings className="h-4 w-4" />,
      },
      {
        href: "/admin/logs",
        label: "日志",
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        href: "/admin/context-inspector",
        label: "Context 检查器",
        icon: <Eye className="h-4 w-4" />,
      },
    ],
  },
];

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      prefetch
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
        active
          ? "bg-emerald-500/12 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.24)] dark:bg-emerald-500/16 dark:text-emerald-300"
          : "text-slate-600 hover:bg-slate-200/55 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-emerald-500 dark:bg-emerald-400" />
      ) : null}
      <span className={cn(active ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300")}>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-950/92 lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <TreeDeciduous className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">oMyTree Admin</span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {navSections.flatMap((section) => section.items).map((item) => {
            const active = isRouteActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  active
                    ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/16 dark:text-emerald-300"
                    : "border-slate-300/80 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-72 border-r border-slate-200/75 bg-white/96 px-4 py-5 dark:border-slate-800/80 dark:bg-slate-950/92 lg:flex lg:flex-col">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/35">
              <TreeDeciduous className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">oMyTree Admin</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">运营控制台</p>
            </div>
          </Link>
          <ThemeToggle />
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
          {navSections.map((section) => (
            <div key={section.id}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isRouteActive(pathname, item.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
          <Link href="/app" className="font-medium text-slate-700 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-300">
            返回应用
          </Link>
        </div>
      </aside>
    </>
  );
}
