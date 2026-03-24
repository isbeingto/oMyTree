"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useCustom } from "@refinedev/core";
import {
  Activity,
  Globe2,
  Leaf,
  LineChart,
  Sparkles,
  TreeDeciduous,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AdminHeader } from "../_components/AdminHeader";
import {
  AdminPage,
  AdminSection,
  AdminStatCard,
  adminSurfaceClass,
} from "../_components/AdminUi";

type Summary = {
  total_users: number;
  active_users_30d: number;
  new_users_month: number;
  total_trees: number;
};

type DailyPoint = { date: string; count: number };
type TokenPoint = { date: string; tokens: number };

type DashboardData = {
  summary: Summary;
  new_users_daily: DailyPoint[];
  countries: { country: string; count: number }[];
  usage: {
    tokens_daily: TokenPoint[];
    trees_daily: DailyPoint[];
  };
  range_days: number;
  generated_at: string;
  active_definition?: string;
};

const numberFormat = new Intl.NumberFormat("zh-CN");

function MiniBarChart({
  data,
  valueKey,
  colorClass,
  tooltipLabel,
}: {
  data: Record<string, string | number>[];
  valueKey: string;
  colorClass: string;
  tooltipLabel?: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 0);
  const chartHeightPx = 128;
  const minBarHeightPx = 4;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-32 items-end gap-[6px]">
        {data.map((d) => {
          const value = Number(d[valueKey]) || 0;
          const heightPx =
            max > 0
              ? Math.max(Math.round((value / max) * chartHeightPx), minBarHeightPx)
              : minBarHeightPx;

          return (
            <div key={String(d.date)} className="flex h-full flex-1 items-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`w-full rounded-md ${colorClass}`}
                    style={{ height: `${heightPx}px` }}
                    aria-label={`${d.date}: ${value}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="flex flex-col gap-0.5">
                    <div className="font-medium">{String(d.date)}</div>
                    <div>
                      {tooltipLabel ? `${tooltipLabel}: ` : ""}
                      {numberFormat.format(value)}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function TrendLegend({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-xs text-slate-500 dark:text-slate-400">
      <span className="font-semibold text-slate-700 dark:text-slate-200">{value}</span> {label}
    </div>
  );
}

function TrendCard({
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <AdminSection
      className={className}
      title={title}
      description={description}
      actions={<span className="text-emerald-500">{icon}</span>}
    >
      {children}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </AdminSection>
  );
}

export default function DashboardPage() {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);

  const dashboardQuery = useCustom<DashboardData>({
    url: `/api/admin/metrics/dashboard?range_days=${rangeDays}`,
    method: "get",
  });

  const data = dashboardQuery.result.data || null;
  const loading = dashboardQuery.query.isLoading;
  const error = dashboardQuery.query.error instanceof Error ? dashboardQuery.query.error.message : null;

  const displayCountries = useMemo(() => {
    if (!data?.countries) return [];
    const sorted = [...data.countries].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 5);
    const remaining = sorted.slice(5);
    const otherCount = remaining.reduce((sum, c) => sum + c.count, 0);
    if (otherCount > 0) {
      top.push({ country: "其他", count: otherCount });
    }
    return top;
  }, [data?.countries]);

  const latestTokens = useMemo(() => {
    if (!data?.usage?.tokens_daily?.length) return 0;
    return data.usage.tokens_daily[data.usage.tokens_daily.length - 1].tokens;
  }, [data?.usage?.tokens_daily]);

  const latestTrees = useMemo(() => {
    if (!data?.usage?.trees_daily?.length) return 0;
    return data.usage.trees_daily[data.usage.trees_daily.length - 1].count;
  }, [data?.usage?.trees_daily]);

  return (
    <AdminPage>
      <AdminHeader title="仪表盘" description="用户、用量与增长概览" />

      {loading ? (
        <div className={`${adminSurfaceClass} flex items-center gap-3 p-6 text-slate-500`}>
          <div className="h-4 w-4 animate-pulse rounded-full bg-emerald-500" />
          <span>正在加载数据...</span>
        </div>
      ) : error ? (
        <div className={`${adminSurfaceClass} p-6 text-red-600 dark:text-red-400`}>加载失败：{error}</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              icon={<Users className="h-5 w-5" />}
              label="总用户数"
              value={data.summary.total_users}
              hint="所有已注册账号"
            />
            <AdminStatCard
              icon={<Activity className="h-5 w-5" />}
              label="近 30 天活跃"
              value={data.summary.active_users_30d}
              hint="30 天内创建或新增树的账号"
            />
            <AdminStatCard
              icon={<Sparkles className="h-5 w-5" />}
              label="本月新增用户"
              value={data.summary.new_users_month}
              hint="当月注册账号数"
            />
            <AdminStatCard
              icon={<TreeDeciduous className="h-5 w-5" />}
              label="总树数"
              value={data.summary.total_trees}
              hint="全站已创建树数量"
            />
          </div>

          <div className="flex justify-end">
            <div className={`${adminSurfaceClass} flex items-center gap-3 px-3 py-2`}>
              <span className="text-xs text-slate-500 dark:text-slate-400">统计窗口</span>
              <Select
                value={String(rangeDays)}
                onValueChange={(v) => setRangeDays((Number(v) as 7 | 30 | 90) || 30)}
              >
                <SelectTrigger className="h-8 w-[136px] bg-white/70 dark:bg-slate-900/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">近 7 天</SelectItem>
                  <SelectItem value="30">近 30 天</SelectItem>
                  <SelectItem value="90">近 90 天</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TrendCard
              className="lg:col-span-2"
              title="新增用户趋势"
              description="按天统计"
              icon={<LineChart className="h-5 w-5" />}
              footer={
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <TrendLegend
                    value={numberFormat.format(
                      data.new_users_daily[data.new_users_daily.length - 1]?.count || 0
                    )}
                    label="最新日新增"
                  />
                  <span>窗口：{data.range_days} 天</span>
                </div>
              }
            >
              <MiniBarChart
                data={data.new_users_daily}
                valueKey="count"
                colorClass="bg-emerald-500/80"
                tooltipLabel="新增"
              />
            </TrendCard>

            <AdminSection
              title="注册来源国家/地区"
              description="基于注册 IP"
              actions={<Globe2 className="h-5 w-5 text-emerald-500" />}
            >
              <div className="space-y-2">
                {displayCountries.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
                ) : (
                  displayCountries.map((c) => (
                    <div
                      key={c.country}
                      className="flex items-center justify-between text-sm text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        {c.country === "Unknown" ? "未知" : c.country}
                      </div>
                      <span className="font-semibold">{numberFormat.format(c.count)}</span>
                    </div>
                  ))
                )}
              </div>
            </AdminSection>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendCard
              title="每日 tokens"
              description="按天汇总官方用量"
              icon={<Activity className="h-5 w-5" />}
              footer={<TrendLegend value={numberFormat.format(latestTokens)} label="最近一天 tokens" />}
            >
              <MiniBarChart
                data={data.usage.tokens_daily}
                valueKey="tokens"
                colorClass="bg-blue-500/80"
                tooltipLabel="tokens"
              />
            </TrendCard>

            <TrendCard
              title="每日新建树"
              description="按天统计新增树数量"
              icon={<Leaf className="h-5 w-5" />}
              footer={<TrendLegend value={numberFormat.format(latestTrees)} label="最近一天新建树" />}
            >
              <MiniBarChart
                data={data.usage.trees_daily}
                valueKey="count"
                colorClass="bg-amber-500/80"
                tooltipLabel="新建"
              />
            </TrendCard>
          </div>

          <div className={`${adminSurfaceClass} p-4 text-xs text-slate-500 dark:text-slate-400`}>
            活跃定义：{data.active_definition || "近 30 天内创建过新树或新增新节点"}
          </div>
        </>
      ) : null}
    </AdminPage>
  );
}
