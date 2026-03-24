"use client";

import { useCustom } from "@refinedev/core";
import {
  Activity,
  Calendar,
  Key,
  PieChart,
  RefreshCw,
  TreeDeciduous,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminHeader } from "../_components/AdminHeader";
import {
  AdminPage,
  AdminSection,
  AdminStatCard,
  adminSurfaceClass,
} from "../_components/AdminUi";

interface Stats {
  users: {
    total: number;
    active_30d: number;
    new_today: number;
    with_byok: number;
    byok_percentage: number;
  };
  trees: {
    total: number;
    created_today: number;
    avg_per_user: number;
  };
  plans: Record<string, number>;
  recent_events: Record<string, number>;
}

interface StatsPayload {
  stats: Stats;
  generated_at: string | null;
}

export default function StatsPage() {
  const statsQuery = useCustom<StatsPayload>({
    url: "/api/admin/stats",
    method: "get",
  });

  const stats = statsQuery.result.data?.stats;
  const generatedAt = statsQuery.result.data?.generated_at || null;
  const loading = statsQuery.query.isLoading;
  const error = statsQuery.query.error instanceof Error ? statsQuery.query.error.message : null;

  return (
    <AdminPage>
      <AdminHeader
        title="统计"
        description="用户、对话树、套餐分布和事件概览"
        actions={
          <div className="flex items-center gap-3">
            {generatedAt ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                更新时间：{new Date(generatedAt).toLocaleString("zh-CN")}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => statsQuery.query.refetch()}
              disabled={loading || statsQuery.query.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${(loading || statsQuery.query.isFetching) ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
          </div>
        }
      />

      {error ? (
        <div className={`${adminSurfaceClass} rounded-xl border border-red-300/80 p-4 text-red-700 dark:border-red-800 dark:text-red-300`}>
          {error}
        </div>
      ) : null}

      {loading && !stats ? (
        <div className={`${adminSurfaceClass} py-16 text-center text-slate-500 dark:text-slate-400`}>
          正在加载统计数据...
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <AdminStatCard icon={<Users className="h-5 w-5" />} label="总用户" value={stats.users.total} />
            <AdminStatCard icon={<Activity className="h-5 w-5" />} label="近 30 天活跃" value={stats.users.active_30d} />
            <AdminStatCard icon={<TrendingUp className="h-5 w-5" />} label="今日新增" value={stats.users.new_today} />
            <AdminStatCard
              icon={<Key className="h-5 w-5" />}
              label="BYOK 用户"
              value={stats.users.with_byok}
              hint={`占比 ${stats.users.byok_percentage}%`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AdminStatCard icon={<TreeDeciduous className="h-5 w-5" />} label="总树数" value={stats.trees.total} />
            <AdminStatCard icon={<Calendar className="h-5 w-5" />} label="今日新建树" value={stats.trees.created_today} />
            <AdminStatCard icon={<PieChart className="h-5 w-5" />} label="人均树数" value={stats.trees.avg_per_user} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminSection title="套餐分布" description="当前用户套餐占比与规模">
              {Object.keys(stats.plans).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.plans).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between rounded-lg bg-slate-100/70 px-3 py-2 dark:bg-slate-900/65">
                      <span className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/85 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                        {plan}
                      </span>
                      <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                当前以 `free` 为主，`supporter / pro / team` 预留给后续商业化阶段。
              </p>
            </AdminSection>

            <AdminSection title="最近事件（30 天）" description="按事件类型聚合">
              {Object.keys(stats.recent_events).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">暂无事件记录</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.recent_events).map(([eventType, count]) => (
                    <div key={eventType} className="flex items-center justify-between rounded-lg bg-slate-100/70 px-3 py-2 dark:bg-slate-900/65">
                      <code className="text-xs text-slate-700 dark:text-slate-300">{eventType}</code>
                      <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </AdminSection>
          </div>

          <AdminSection
            className="border-dashed"
            title="后续接入点"
            description="保留计费与行为分析的扩展能力"
          >
            <p className="text-sm text-slate-600 dark:text-slate-400">
              目前统计已覆盖用户规模、用量、套餐和事件基础能力。后续可继续接入分层留存、转化漏斗、ARPU 与分渠道成本分析。
            </p>
          </AdminSection>
        </>
      ) : null}
    </AdminPage>
  );
}
