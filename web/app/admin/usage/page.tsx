"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import {
  AlertTriangle,
  BarChart3,
  Key,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AdminHeader,
} from "../_components/AdminHeader";
import {
  AdminPage,
  AdminSection,
  AdminStatCard,
  adminSurfaceClass,
} from "../_components/AdminUi";

interface UsageUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  daily_requests: number;
  monthly_requests: number;
  has_byok: boolean;
}

interface UsageTotals {
  today: { official: number; byok: number };
  month: { official: number; byok: number };
}

interface LLMConfig {
  official_llm_enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

interface UsagePayload {
  users?: UsageUser[];
  totals?: UsageTotals | null;
}

interface LLMConfigPayload {
  config?: LLMConfig | null;
}

export default function UsageDashboardPage() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<"enable" | "disable" | null>(null);

  const usageQuery = useCustom<UsagePayload>({
    url: "/api/admin/usage",
    method: "get",
  });

  const llmConfigQuery = useCustom<LLMConfigPayload>({
    url: "/api/admin/llm-config",
    method: "get",
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  const users = usageQuery.result.data?.users || [];
  const totals = usageQuery.result.data?.totals || null;
  const config = llmConfigQuery.result.data?.config || null;
  const loading = usageQuery.query.isLoading || llmConfigQuery.query.isLoading;
  const queryError =
    (usageQuery.query.error instanceof Error ? usageQuery.query.error.message : null) ||
    (llmConfigQuery.query.error instanceof Error ? llmConfigQuery.query.error.message : null);
  const error = actionError || queryError;

  const fetchData = async () => {
    setActionError(null);
    await Promise.all([usageQuery.query.refetch(), llmConfigQuery.query.refetch()]);
  };

  const handleToggleClick = () => {
    if (!config) return;
    setPendingAction(config.official_llm_enabled ? "disable" : "enable");
    setShowConfirmDialog(true);
  };

  const handleConfirmToggle = async () => {
    if (!pendingAction) return;

    setConfigLoading(true);
    setActionError(null);
    try {
      const newValue = pendingAction === "enable";
      await mutateCustom({
        url: "/api/admin/llm-config",
        method: "post",
        values: { official_llm_enabled: newValue },
        config: { headers: { "content-type": "application/json" } },
      });
      await llmConfigQuery.query.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "切换失败");
    } finally {
      setConfigLoading(false);
      setShowConfirmDialog(false);
      setPendingAction(null);
    }
  };

  const activeUsers = users.filter((u) => u.daily_requests > 0 || u.monthly_requests > 0);
  const inactiveWithByok = users.filter(
    (u) => u.has_byok && u.daily_requests === 0 && u.monthly_requests === 0
  );

  return (
    <AdminPage>
      <AdminHeader
        title="LLM 用量"
        description="官方模型调用与 BYOK 使用情况"
        actions={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        }
      />

      {error ? (
        <div className={`${adminSurfaceClass} rounded-xl border border-red-300/80 p-4 text-red-700 dark:border-red-800 dark:text-red-300`}>
          {error}
        </div>
      ) : null}

      <AdminSection
        className="border-orange-200/90 dark:border-orange-800/70"
        title="官方模型总开关"
        description="关闭后，平台官方模型将停止服务（用户 BYOK 不受影响）"
        actions={
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${
                config?.official_llm_enabled ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {config?.official_llm_enabled ? "已开启" : "已关闭"}
            </span>
            <Switch
              checked={config?.official_llm_enabled ?? true}
              onCheckedChange={handleToggleClick}
              disabled={configLoading || !config}
            />
          </div>
        }
      >
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-orange-500" />
          <div>
            <p>该开关用于紧急止损与维护窗口控制。</p>
            {config?.updated_at ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                最近更新：{new Date(config.updated_at).toLocaleString("zh-CN")}
                {config.updated_by ? `（操作人：${config.updated_by}）` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </AdminSection>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <AdminStatCard
          icon={<Zap className="h-5 w-5" />}
          label="今日官方请求"
          value={totals?.today.official ?? 0}
          hint="当日消耗"
        />
        <AdminStatCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="本月官方请求"
          value={totals?.month.official ?? 0}
          hint="自然月累计"
        />
        <AdminStatCard
          icon={<Key className="h-5 w-5" />}
          label="本月 BYOK 请求"
          value={totals?.month.byok ?? 0}
          hint="用户自有 key 产生"
        />
        <AdminStatCard
          icon={<Users className="h-5 w-5" />}
          label="有请求用户"
          value={activeUsers.length}
          hint="今日或本月有调用"
        />
      </div>

      <AdminSection title="用户用量明细" description="按用户统计今日/本月请求量">
        {loading ? (
          <div className="py-8 text-center text-slate-500">正在加载...</div>
        ) : activeUsers.length === 0 ? (
          <div className="py-8 text-center text-slate-500">暂无用量数据</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-slate-800/75">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-100/70 dark:bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">邮箱</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">今日</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">本月</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-600 dark:text-slate-400">BYOK</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((user) => (
                  <tr key={user.id} className="border-t border-slate-200/70 dark:border-slate-800/80">
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-slate-900 dark:text-slate-100">{user.email}</span>
                        {user.name ? (
                          <span className="ml-2 text-slate-500 dark:text-slate-400">({user.name})</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{user.daily_requests}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{user.monthly_requests}</td>
                    <td className="px-4 py-3 text-center">
                      {user.has_byok ? (
                        <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300">
                          <Key className="mr-1 h-3 w-3" /> 是
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inactiveWithByok.length > 0 ? (
          <div className="mt-6 border-t border-slate-200/80 pt-6 dark:border-slate-800/80">
            <h4 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              BYOK 用户（本月无官方请求）
            </h4>
            <div className="flex flex-wrap gap-2">
              {inactiveWithByok.slice(0, 12).map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                >
                  <Key className="mr-1 h-3 w-3 text-emerald-500" />
                  {user.email}
                </span>
              ))}
              {inactiveWithByok.length > 12 ? (
                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-500">
                  +{inactiveWithByok.length - 12}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </AdminSection>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className={pendingAction === "disable" ? "text-red-500" : "text-emerald-500"}
              />
              {pendingAction === "disable" ? "关闭官方模型" : "开启官方模型"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "disable"
                ? "确认关闭官方模型服务？关闭后平台将不再调用官方模型。"
                : "确认重新开启官方模型服务？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggle}
              className={pendingAction === "disable" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
