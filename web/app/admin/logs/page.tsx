"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import {
  AlertTriangle,
  Bug,
  Clock3,
  Fingerprint,
  RefreshCw,
  ShieldAlert,
  Users2,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AdminHeader } from "../_components/AdminHeader";
import {
  AdminEmptyState,
  AdminPage,
  AdminSection,
  AdminStatCard,
  adminSoftSurfaceClass,
  adminSurfaceClass,
} from "../_components/AdminUi";

type RiskLevel = "low" | "medium" | "high" | "critical";
type RiskLevelFilter = "all" | RiskLevel;
type ActorRole = "all" | "admin" | "user" | "system";
type FailureFilter = "all" | "only";

interface AuditEvent {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: "admin" | "user" | "system";
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown>;
  risk_level: RiskLevel;
  is_failure: boolean;
}

interface AuditOverviewPayload {
  generated_at: string;
  window_days: number;
  summary: {
    total_events_window: number;
    events_24h: number;
    actors_24h: number;
    unique_ips_24h: number;
    high_risk_24h: number;
    failed_24h: number;
  };
  top_actions: Array<{ action: string; count: number }>;
  top_actors: Array<{ actor: string; count: number }>;
  risk_breakdown: Array<{ risk_level: RiskLevel; count: number }>;
  trend: Array<{ date: string; total: number; high_risk: number }>;
  recent_alerts: AuditEvent[];
}

interface AuditEventsPayload {
  generated_at: string;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: AuditEvent[];
}

interface AuditFilters {
  q: string;
  action: string;
  target_type: string;
  risk_level: RiskLevelFilter;
  role: ActorRole;
  failure_only: FailureFilter;
}

const NUMBER_FORMAT = new Intl.NumberFormat("zh-CN");
const RISK_ORDER: RiskLevel[] = ["critical", "high", "medium", "low"];
const PAGE_SIZE = 20;

const INITIAL_FILTERS: AuditFilters = {
  q: "",
  action: "",
  target_type: "",
  risk_level: "all",
  role: "all",
  failure_only: "all",
};

const DEFAULT_SUMMARY: AuditOverviewPayload["summary"] = {
  total_events_window: 0,
  events_24h: 0,
  actors_24h: 0,
  unique_ips_24h: 0,
  high_risk_24h: 0,
  failed_24h: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.data)) {
    return value.data;
  }
  return value;
}

function toSafeNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}

function normalizeActorRole(value: unknown): AuditEvent["actor_role"] {
  if (value === "admin" || value === "user" || value === "system") {
    return value;
  }
  return "system";
}

function normalizeAuditEvent(value: unknown): AuditEvent | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  if (!id) return null;

  return {
    id,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    actor_user_id: typeof value.actor_user_id === "string" ? value.actor_user_id : null,
    actor_role: normalizeActorRole(value.actor_role),
    actor_email: typeof value.actor_email === "string" ? value.actor_email : null,
    actor_name: typeof value.actor_name === "string" ? value.actor_name : null,
    action: typeof value.action === "string" ? value.action : "",
    target_type: typeof value.target_type === "string" ? value.target_type : null,
    target_id: typeof value.target_id === "string" ? value.target_id : null,
    ip: typeof value.ip === "string" ? value.ip : null,
    trace_id: typeof value.trace_id === "string" ? value.trace_id : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    risk_level: normalizeRiskLevel(value.risk_level),
    is_failure: Boolean(value.is_failure),
  };
}

function buildEventsUrl(windowDays: number, page: number, filters: AuditFilters): string {
  const params = new URLSearchParams();
  params.set("window_days", String(windowDays));
  params.set("page", String(page));
  params.set("page_size", String(PAGE_SIZE));

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  if (filters.action.trim()) {
    params.set("action", filters.action.trim());
  }
  if (filters.target_type.trim()) {
    params.set("target_type", filters.target_type.trim());
  }
  if (filters.risk_level !== "all") {
    params.set("risk_level", filters.risk_level);
  }
  if (filters.role !== "all") {
    params.set("role", filters.role);
  }
  if (filters.failure_only === "only") {
    params.set("failure_only", "1");
  }

  return `/api/admin/audit/events?${params.toString()}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function shortText(value: string | null | undefined, max = 18): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function compactMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `数组(${value.length})`;
  if (typeof value === "object") return "对象";
  return String(value);
}

function summarizeMetadata(metadata: Record<string, unknown>): string {
  const keys = Object.keys(metadata || {});
  if (keys.length === 0) return "—";

  return keys
    .slice(0, 3)
    .map((key) => `${key}: ${compactMetadataValue(metadata[key])}`)
    .join(" · ");
}

function riskLabel(level: RiskLevel): string {
  if (level === "critical") return "严重";
  if (level === "high") return "高";
  if (level === "medium") return "中";
  return "低";
}

function riskBadgeClass(level: RiskLevel): string {
  if (level === "critical") {
    return "border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/35 dark:text-red-300";
  }
  if (level === "high") {
    return "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/35 dark:text-orange-300";
  }
  if (level === "medium") {
    return "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/35 dark:text-amber-300";
  }
  return "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300";
}

function riskBarClass(level: RiskLevel): string {
  if (level === "critical") return "bg-red-500";
  if (level === "high") return "bg-orange-500";
  if (level === "medium") return "bg-amber-500";
  return "bg-emerald-500";
}

function TrendBars({
  points,
}: {
  points: Array<{ date: string; total: number; high_risk: number }>;
}) {
  const max = Math.max(
    ...points.map((point) => Math.max(point.total, point.high_risk)),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex h-36 items-end gap-[6px]">
        {points.map((point) => {
          const totalHeight = max > 0 ? Math.max((point.total / max) * 136, 4) : 4;
          const riskHeight = max > 0 ? Math.max((point.high_risk / max) * 136, 2) : 2;
          return (
            <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full items-end justify-center rounded-md bg-slate-100/80 p-0.5 dark:bg-slate-900/60">
                <div
                  className="w-full rounded-sm bg-emerald-500/85"
                  style={{ height: `${totalHeight}px` }}
                  title={`${point.date} 总事件 ${point.total}`}
                />
                <div
                  className="absolute bottom-0 w-full rounded-sm bg-orange-500/95"
                  style={{ height: `${riskHeight}px` }}
                  title={`${point.date} 高风险 ${point.high_risk}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>总事件（绿）+ 高风险（橙）</span>
        <span>窗口：{points.length} 天</span>
      </div>
    </div>
  );
}

export default function AdminLogsPage() {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(INITIAL_FILTERS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const overviewUrl = useMemo(
    () => `/api/admin/audit/overview?window_days=${windowDays}`,
    [windowDays]
  );
  const eventsUrl = useMemo(
    () => buildEventsUrl(windowDays, page, appliedFilters),
    [windowDays, page, appliedFilters]
  );

  const overviewQuery = useCustom<AuditOverviewPayload>({
    url: overviewUrl,
    method: "get",
  });
  const eventsQuery = useCustom<AuditEventsPayload>({
    url: eventsUrl,
    method: "get",
    queryOptions: {
      placeholderData: (previousData) => previousData,
    },
  });

  const overview = useMemo<AuditOverviewPayload | null>(() => {
    const payload = unwrapPayload(overviewQuery.result.data);
    if (!payload) return null;

    const summarySource = isRecord(payload.summary) ? payload.summary : {};
    const topActionsRaw = Array.isArray(payload.top_actions) ? payload.top_actions : [];
    const topActorsRaw = Array.isArray(payload.top_actors) ? payload.top_actors : [];
    const riskBreakdownRaw = Array.isArray(payload.risk_breakdown) ? payload.risk_breakdown : [];
    const trendRaw = Array.isArray(payload.trend) ? payload.trend : [];
    const alertsRaw = Array.isArray(payload.recent_alerts) ? payload.recent_alerts : [];

    const topActions: AuditOverviewPayload["top_actions"] = [];
    for (const item of topActionsRaw) {
      if (!isRecord(item) || typeof item.action !== "string") continue;
      topActions.push({ action: item.action, count: toSafeNumber(item.count) });
    }

    const topActors: AuditOverviewPayload["top_actors"] = [];
    for (const item of topActorsRaw) {
      if (!isRecord(item) || typeof item.actor !== "string") continue;
      topActors.push({ actor: item.actor, count: toSafeNumber(item.count) });
    }

    const riskBreakdown: AuditOverviewPayload["risk_breakdown"] = [];
    for (const item of riskBreakdownRaw) {
      if (!isRecord(item)) continue;
      riskBreakdown.push({
        risk_level: normalizeRiskLevel(item.risk_level),
        count: toSafeNumber(item.count),
      });
    }

    const trend: AuditOverviewPayload["trend"] = [];
    for (const item of trendRaw) {
      if (!isRecord(item) || typeof item.date !== "string") continue;
      trend.push({
        date: item.date,
        total: toSafeNumber(item.total),
        high_risk: toSafeNumber(item.high_risk),
      });
    }

    const alerts: AuditEvent[] = [];
    for (const item of alertsRaw) {
      const normalized = normalizeAuditEvent(item);
      if (normalized) alerts.push(normalized);
    }

    return {
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : "",
      window_days: toSafeNumber(payload.window_days),
      summary: {
        total_events_window: toSafeNumber(summarySource.total_events_window),
        events_24h: toSafeNumber(summarySource.events_24h),
        actors_24h: toSafeNumber(summarySource.actors_24h),
        unique_ips_24h: toSafeNumber(summarySource.unique_ips_24h),
        high_risk_24h: toSafeNumber(summarySource.high_risk_24h),
        failed_24h: toSafeNumber(summarySource.failed_24h),
      },
      top_actions: topActions,
      top_actors: topActors,
      risk_breakdown: riskBreakdown,
      trend,
      recent_alerts: alerts,
    };
  }, [overviewQuery.result.data]);

  const eventsPayload = useMemo<AuditEventsPayload | null>(() => {
    const payload = unwrapPayload(eventsQuery.result.data);
    if (!payload) return null;
    const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
    const items: AuditEvent[] = [];
    for (const item of itemsRaw) {
      const normalized = normalizeAuditEvent(item);
      if (normalized) items.push(normalized);
    }

    return {
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : "",
      page: Math.max(1, toSafeNumber(payload.page)),
      page_size: Math.max(1, toSafeNumber(payload.page_size)),
      total: Math.max(0, toSafeNumber(payload.total)),
      total_pages: Math.max(1, toSafeNumber(payload.total_pages)),
      items,
    };
  }, [eventsQuery.result.data]);

  const summary = overview?.summary ?? DEFAULT_SUMMARY;
  const trendPoints = overview?.trend ?? [];
  const topActions = overview?.top_actions ?? [];
  const topActors = overview?.top_actors ?? [];
  const alerts = overview?.recent_alerts ?? [];
  const events = eventsPayload?.items ?? [];
  const total = eventsPayload?.total ?? 0;
  const totalPages = eventsPayload?.total_pages ?? 1;

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return (
      events.find((event) => event.id === selectedEventId) ||
      alerts.find((event) => event.id === selectedEventId) ||
      null
    );
  }, [alerts, events, selectedEventId]);

  const riskCountMap = useMemo(() => {
    const map = new Map<RiskLevel, number>();
    for (const item of overview?.risk_breakdown ?? []) {
      map.set(item.risk_level, item.count);
    }
    return map;
  }, [overview?.risk_breakdown]);

  const totalRiskCount = useMemo(() => {
    return RISK_ORDER.reduce((sum, level) => sum + (riskCountMap.get(level) ?? 0), 0);
  }, [riskCountMap]);

  const errorMessage =
    (overviewQuery.query.error instanceof Error ? overviewQuery.query.error.message : null) ||
    (eventsQuery.query.error instanceof Error ? eventsQuery.query.error.message : null);

  const loading = overviewQuery.query.isLoading || eventsQuery.query.isLoading;
  const fetching = overviewQuery.query.isFetching || eventsQuery.query.isFetching;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const refreshAll = async () => {
    await Promise.all([overviewQuery.query.refetch(), eventsQuery.query.refetch()]);
  };

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const resetFilters = () => {
    const reset = { ...INITIAL_FILTERS };
    setPage(1);
    setDraftFilters(reset);
    setAppliedFilters(reset);
  };

  return (
    <AdminPage>
      <AdminHeader
        title="日志与审计"
        description="审计事件检索、风险分级、异常告警与操作追踪"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {overview?.generated_at ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                更新时间：{formatDateTime(overview.generated_at)}
              </span>
            ) : null}
            <Select
              value={String(windowDays)}
              onValueChange={(value) => {
                setWindowDays((Number(value) as 7 | 30 | 90) || 30);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] bg-white/75 dark:bg-slate-900/75">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">近 7 天</SelectItem>
                <SelectItem value="30">近 30 天</SelectItem>
                <SelectItem value="90">近 90 天</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={fetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", fetching ? "animate-spin" : "")} />
              刷新
            </Button>
          </div>
        }
      />

      {errorMessage ? (
        <div
          className={cn(
            adminSurfaceClass,
            "rounded-xl border border-red-300/80 px-5 py-4 text-red-700 dark:border-red-800 dark:text-red-300"
          )}
        >
          {errorMessage}
        </div>
      ) : null}

      {loading && !overview ? (
        <div className={cn(adminSurfaceClass, "py-14 text-center text-slate-500 dark:text-slate-400")}>
          正在加载审计数据...
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AdminStatCard
              icon={<Clock3 className="h-5 w-5" />}
              label="24 小时事件"
              value={summary.events_24h}
              hint="最近 24 小时审计事件总量"
            />
            <AdminStatCard
              icon={<Wrench className="h-5 w-5" />}
              label={`近 ${windowDays} 天事件`}
              value={summary.total_events_window}
              hint="当前窗口累计"
            />
            <AdminStatCard
              icon={<Users2 className="h-5 w-5" />}
              label="24 小时操作人"
              value={summary.actors_24h}
              hint="去重 actor_user_id"
            />
            <AdminStatCard
              icon={<Fingerprint className="h-5 w-5" />}
              label="24 小时来源 IP"
              value={summary.unique_ips_24h}
              hint="去重访问来源"
            />
            <AdminStatCard
              icon={<ShieldAlert className="h-5 w-5" />}
              label="24 小时高风险"
              value={summary.high_risk_24h}
              hint="high + critical"
            />
            <AdminStatCard
              icon={<Bug className="h-5 w-5" />}
              label="24 小时失败事件"
              value={summary.failed_24h}
              hint="状态失败 / 拒绝 / 异常"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
            <AdminSection title="审计趋势" description="按天查看总事件与高风险事件变化">
              {trendPoints.length === 0 ? (
                <AdminEmptyState title="暂无趋势数据" description="当前窗口内没有可用于展示的事件。" />
              ) : (
                <TrendBars points={trendPoints} />
              )}
            </AdminSection>

            <AdminSection title="风险结构" description="按风险等级分层，辅助定位审计重点">
              {totalRiskCount === 0 ? (
                <AdminEmptyState title="暂无风险分布数据" description="当前窗口没有可统计的事件。" />
              ) : (
                <div className="space-y-3">
                  {RISK_ORDER.map((level) => {
                    const count = riskCountMap.get(level) ?? 0;
                    const ratio = totalRiskCount > 0 ? (count / totalRiskCount) * 100 : 0;
                    return (
                      <div key={level} className={cn(adminSoftSurfaceClass, "space-y-2 p-3")}>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge className={cn("border", riskBadgeClass(level))}>{riskLabel(level)}</Badge>
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {NUMBER_FORMAT.format(count)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200/90 dark:bg-slate-800/80">
                          <div
                            className={cn("h-2 rounded-full transition-all", riskBarClass(level))}
                            style={{ width: `${ratio.toFixed(1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminSection>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminSection title="高频动作" description="当前窗口动作类型 TOP 10">
              {topActions.length === 0 ? (
                <AdminEmptyState title="暂无动作数据" />
              ) : (
                <div className="space-y-2">
                  {topActions.map((item) => (
                    <div
                      key={item.action}
                      className="flex items-center justify-between rounded-lg bg-slate-100/75 px-3 py-2 dark:bg-slate-900/65"
                    >
                      <code className="max-w-[75%] truncate text-xs text-slate-700 dark:text-slate-300">
                        {item.action}
                      </code>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {NUMBER_FORMAT.format(item.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </AdminSection>

            <AdminSection title="高频操作人" description="按审计事件数统计 TOP 8">
              {topActors.length === 0 ? (
                <AdminEmptyState title="暂无操作人数据" />
              ) : (
                <div className="space-y-2">
                  {topActors.map((item) => (
                    <div
                      key={item.actor}
                      className="flex items-center justify-between rounded-lg bg-slate-100/75 px-3 py-2 dark:bg-slate-900/65"
                    >
                      <span className="max-w-[75%] truncate text-sm text-slate-700 dark:text-slate-300">
                        {item.actor}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {NUMBER_FORMAT.format(item.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </AdminSection>
          </div>

          <AdminSection title="风险告警" description="最近高风险或失败事件，点击可查看详情">
            {alerts.length === 0 ? (
              <AdminEmptyState title="当前无高风险告警" description="暂无 high / critical / failed 事件。" />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {alerts.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={cn(
                      adminSoftSurfaceClass,
                      "rounded-xl border p-4 text-left transition-colors hover:border-emerald-400/70",
                      selectedEventId === event.id ? "border-emerald-500" : ""
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Badge className={cn("border", riskBadgeClass(event.risk_level))}>
                        {riskLabel(event.risk_level)}
                      </Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(event.created_at)}
                      </span>
                    </div>
                    <code className="mt-2 block truncate text-xs text-slate-800 dark:text-slate-200">
                      {event.action}
                    </code>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      操作人：{event.actor_email || event.actor_name || "system"} · 目标：
                      {event.target_type || "—"}
                      {event.target_id ? `/${shortText(event.target_id, 24)}` : ""}
                    </p>
                    {event.is_failure ? (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        失败事件
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </AdminSection>
        </>
      ) : null}

      <AdminSection title="审计事件检索" description="支持关键字、动作、风险和角色筛选">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            placeholder="关键字（action/actor/trace/ip）"
            value={draftFilters.q}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, q: e.target.value }))}
          />
          <Input
            placeholder="动作筛选（如 admin.user.delete）"
            value={draftFilters.action}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, action: e.target.value }))}
          />
          <Input
            placeholder="目标类型（如 user / system_settings）"
            value={draftFilters.target_type}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, target_type: e.target.value }))}
          />
          <Select
            value={draftFilters.risk_level}
            onValueChange={(value: RiskLevelFilter) =>
              setDraftFilters((prev) => ({ ...prev, risk_level: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="风险等级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">风险：全部</SelectItem>
              <SelectItem value="critical">风险：严重</SelectItem>
              <SelectItem value="high">风险：高</SelectItem>
              <SelectItem value="medium">风险：中</SelectItem>
              <SelectItem value="low">风险：低</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={draftFilters.role}
            onValueChange={(value: ActorRole) => setDraftFilters((prev) => ({ ...prev, role: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="操作人角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">角色：全部</SelectItem>
              <SelectItem value="admin">角色：admin</SelectItem>
              <SelectItem value="user">角色：user</SelectItem>
              <SelectItem value="system">角色：system</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={draftFilters.failure_only}
            onValueChange={(value: FailureFilter) =>
              setDraftFilters((prev) => ({ ...prev, failure_only: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="是否仅失败事件" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">状态：全部</SelectItem>
              <SelectItem value="only">状态：仅失败事件</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={applyFilters} disabled={fetching}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            应用筛选
          </Button>
          <Button variant="outline" onClick={resetFilters} disabled={fetching}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重置
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <Table className="min-w-[980px]">
            <TableHeader className="bg-slate-100/85 dark:bg-slate-900/75">
              <TableRow>
                <TableHead className="px-3">时间</TableHead>
                <TableHead className="px-3">风险</TableHead>
                <TableHead className="px-3">动作</TableHead>
                <TableHead className="px-3">操作人</TableHead>
                <TableHead className="px-3">目标</TableHead>
                <TableHead className="px-3">追踪</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    暂无匹配的审计事件
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow
                    key={event.id}
                    className={cn(
                      "cursor-pointer",
                      selectedEventId === event.id
                        ? "bg-emerald-50/70 dark:bg-emerald-900/15"
                        : ""
                    )}
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    <TableCell className="px-3 text-xs text-slate-700 dark:text-slate-300">
                      {formatDateTime(event.created_at)}
                    </TableCell>
                    <TableCell className="px-3">
                      <div className="flex flex-col gap-1">
                        <Badge className={cn("border", riskBadgeClass(event.risk_level))}>
                          {riskLabel(event.risk_level)}
                        </Badge>
                        {event.is_failure ? (
                          <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                            failure
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {event.action}
                      </code>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {summarizeMetadata(event.metadata)}
                      </p>
                    </TableCell>
                    <TableCell className="px-3">
                      <p className="text-sm text-slate-800 dark:text-slate-200">
                        {event.actor_email || event.actor_name || "system"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {event.actor_role}
                        {event.actor_user_id ? ` · ${shortText(event.actor_user_id, 12)}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="px-3 text-xs text-slate-700 dark:text-slate-300">
                      <span>{event.target_type || "—"}</span>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        {event.target_id ? shortText(event.target_id, 20) : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 text-xs text-slate-700 dark:text-slate-300">
                      <div>IP: {event.ip || "—"}</div>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        trace: {shortText(event.trace_id, 16)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-slate-600 dark:text-slate-400">
            共 {NUMBER_FORMAT.format(total)} 条，当前第 {eventsPayload?.page ?? page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || fetching}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages || fetching}
            >
              下一页
            </Button>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="事件详情" description="点击上方“风险告警”或表格行查看完整审计上下文">
        {selectedEvent ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className={cn(adminSoftSurfaceClass, "space-y-2 p-4")}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">风险等级</span>
                  <Badge className={cn("border", riskBadgeClass(selectedEvent.risk_level))}>
                    {riskLabel(selectedEvent.risk_level)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">时间</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">
                    {formatDateTime(selectedEvent.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">动作</p>
                  <code className="text-xs text-slate-800 dark:text-slate-200">{selectedEvent.action}</code>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">操作人</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">
                    {selectedEvent.actor_email || selectedEvent.actor_name || "system"} ({selectedEvent.actor_role})
                  </p>
                </div>
              </div>

              <div className={cn(adminSoftSurfaceClass, "space-y-2 p-4")}>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">目标对象</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">
                    {selectedEvent.target_type || "—"}
                    {selectedEvent.target_id ? ` / ${selectedEvent.target_id}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">IP</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    {selectedEvent.ip || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Trace ID</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-slate-100">
                    {selectedEvent.trace_id || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">状态</p>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      selectedEvent.is_failure
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {selectedEvent.is_failure ? "失败/异常事件" : "正常事件"}
                  </p>
                </div>
              </div>
            </div>

            <div className={cn(adminSoftSurfaceClass, "p-4")}>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                Metadata（原始审计上下文）
              </p>
              <ScrollArea className="max-h-[320px] rounded-lg border border-slate-200/80 bg-slate-50/85 p-3 dark:border-slate-800/80 dark:bg-slate-950/70">
                <pre className="text-xs leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <AdminEmptyState title="请选择一条审计记录" description="选中后可查看完整 metadata 与追踪上下文。" />
        )}
      </AdminSection>
    </AdminPage>
  );
}
