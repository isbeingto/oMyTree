"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import {
  AlertCircle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  KeyRound,
  RefreshCw,
  Rocket,
  Save,
  Server,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, adminSurfaceClass } from "../_components/AdminUi";

interface PlatformModel {
  id: string;
  modelKey: string;
  displayName: string;
  description: string | null;
  enabledForUsers: boolean;
  enabledInDefault: boolean;
  sortOrder: number;
}

interface PlatformProvider {
  id: string;
  kind: string;
  name: string;
  slug: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  models: PlatformModel[];
}

interface TestResult {
  success: boolean;
  latency?: number;
  response?: string;
  model?: string;
  error?: { code: string; message: string };
}

interface FetchResult {
  ok: boolean;
  count?: number;
  error?: string;
}

interface ProvidersResponse {
  ok?: boolean;
  providers?: PlatformProvider[];
  error?: { message?: string };
}

export default function AdminProvidersPage() {
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [defaultExpandedInitialized, setDefaultExpandedInitialized] = useState(false);

  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [fetchResults, setFetchResults] = useState<Record<string, FetchResult>>({});

  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [apiKeyProviderId, setApiKeyProviderId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");

  const [pendingModelUpdates, setPendingModelUpdates] = useState<
    Record<string, Record<string, { enabledForUsers: boolean; enabledInDefault: boolean }>>
  >({});
  const [savingModels, setSavingModels] = useState(false);

  const providersQuery = useCustom<ProvidersResponse>({
    url: "/api/admin/platform-providers",
    method: "get",
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  const providersPayload = providersQuery.result.data;
  const providers = providersPayload?.providers || [];
  const loading = providersQuery.query.isLoading;
  const queryError =
    providersQuery.query.error instanceof Error ? providersQuery.query.error.message : null;
  const dataError =
    providersPayload && !providersPayload.ok
      ? providersPayload.error?.message || "服务商加载失败"
      : null;
  const error = actionError || dataError || queryError;

  useEffect(() => {
    if (defaultExpandedInitialized || providers.length === 0) {
      return;
    }
    const defaultProvider = providers.find((provider) => provider.isDefault);
    if (defaultProvider) {
      setExpandedProviders(new Set([defaultProvider.id]));
    }
    setDefaultExpandedInitialized(true);
  }, [defaultExpandedInitialized, providers]);

  const refetchProviders = async () => {
    setActionError(null);
    await providersQuery.query.refetch();
  };

  const toggleExpanded = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const openApiKeyDialog = (provider: PlatformProvider) => {
    setApiKeyProviderId(provider.id);
    setApiKeyInput("");
    setBaseUrlInput(provider.baseUrl || "");
    setApiKeyDialogOpen(true);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyProviderId) return;

    setSavingProvider(apiKeyProviderId);
    setActionError(null);
    try {
      const response = await mutateCustom({
        url: `/api/admin/platform-providers/${apiKeyProviderId}`,
        method: "put",
        values: {
          apiKey: apiKeyInput.trim() || undefined,
          baseUrl: baseUrlInput.trim() || undefined,
        },
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!data.ok) {
        throw new Error(data.error?.message || "保存失败");
      }
      await refetchProviders();
      setApiKeyDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "API Key 保存失败");
    } finally {
      setSavingProvider(null);
    }
  };

  const handleToggleEnabled = async (provider: PlatformProvider) => {
    setSavingProvider(provider.id);
    setActionError(null);
    try {
      const response = await mutateCustom({
        url: `/api/admin/platform-providers/${provider.id}`,
        method: "put",
        values: { enabled: !provider.enabled },
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!data.ok) {
        throw new Error(data.error?.message || "更新失败");
      }
      await refetchProviders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "切换状态失败");
    } finally {
      setSavingProvider(null);
    }
  };

  const handleSetDefault = async (provider: PlatformProvider) => {
    setSavingProvider(provider.id);
    setActionError(null);
    try {
      const response = await mutateCustom({
        url: `/api/admin/platform-providers/${provider.id}`,
        method: "put",
        values: { isDefault: true, enabled: true },
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!data.ok) {
        throw new Error(data.error?.message || "设为默认失败");
      }
      await refetchProviders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "设为默认失败");
    } finally {
      setSavingProvider(null);
    }
  };

  const handleFetchModels = async (provider: PlatformProvider) => {
    setFetchingModels(provider.id);
    setActionError(null);
    setFetchResults((prev) => ({ ...prev, [provider.id]: { ok: false } }));
    try {
      const response = await mutateCustom({
        url: `/api/admin/platform-providers/${provider.id}/fetch-models`,
        method: "post",
        values: {},
      });
      const data = response.data as {
        ok?: boolean;
        count?: number;
        error?: { message?: string };
      };
      if (!data.ok) {
        setFetchResults((prev) => ({
          ...prev,
          [provider.id]: { ok: false, error: data.error?.message || "拉取失败" },
        }));
        return;
      }
      setFetchResults((prev) => ({ ...prev, [provider.id]: { ok: true, count: data.count } }));
      await refetchProviders();
    } catch (err) {
      setFetchResults((prev) => ({
        ...prev,
        [provider.id]: {
          ok: false,
          error: err instanceof Error ? err.message : "网络错误",
        },
      }));
    } finally {
      setFetchingModels(null);
    }
  };

  const handleTestConnection = async (provider: PlatformProvider) => {
    setTestingProvider(provider.id);
    setActionError(null);
    setTestResults((prev) => ({ ...prev, [provider.id]: { success: false } }));
    try {
      const response = await mutateCustom({
        url: `/api/admin/platform-providers/${provider.id}/test`,
        method: "post",
        values: {},
      });
      const data = response.data as TestResult;
      setTestResults((prev) => ({ ...prev, [provider.id]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: {
          success: false,
          error: {
            code: "NETWORK_ERROR",
            message: err instanceof Error ? err.message : "网络错误",
          },
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleModelToggle = (
    providerId: string,
    modelId: string,
    field: "enabledForUsers" | "enabledInDefault",
    value: boolean
  ) => {
    setPendingModelUpdates((prev) => {
      const providerUpdates = prev[providerId] || {};
      const model = providers
        .find((p) => p.id === providerId)
        ?.models.find((m) => m.id === modelId);
      const modelUpdate = providerUpdates[modelId] || {
        enabledForUsers: model?.enabledForUsers || false,
        enabledInDefault: model?.enabledInDefault || false,
      };
      return {
        ...prev,
        [providerId]: {
          ...providerUpdates,
          [modelId]: { ...modelUpdate, [field]: value },
        },
      };
    });
  };

  const getModelState = (providerId: string, model: PlatformModel) => {
    const pending = pendingModelUpdates[providerId]?.[model.id];
    return {
      enabledForUsers: pending?.enabledForUsers ?? model.enabledForUsers,
      enabledInDefault: pending?.enabledInDefault ?? model.enabledInDefault,
    };
  };

  const hasPendingChanges =
    Object.keys(pendingModelUpdates).length > 0 &&
    Object.values(pendingModelUpdates).some((p) => Object.keys(p).length > 0);

  const handleSaveModelChanges = async () => {
    setSavingModels(true);
    try {
      const updates: Array<{ id: string; enabledForUsers: boolean; enabledInDefault: boolean }> = [];
      for (const [, models] of Object.entries(pendingModelUpdates)) {
        for (const [modelId, state] of Object.entries(models)) {
          updates.push({ id: modelId, ...state });
        }
      }

      if (updates.length === 0) return;

      setActionError(null);
      const response = await mutateCustom({
        url: "/api/admin/platform-models/bulk",
        method: "put",
        values: { updates },
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!data.ok) {
        throw new Error(data.error?.message || "模型保存失败");
      }

      setPendingModelUpdates({});
      await refetchProviders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "模型保存失败");
    } finally {
      setSavingModels(false);
    }
  };

  const getProviderIcon = (kind: string) => {
    switch (kind) {
      case "openai_native":
      case "openai_compatible":
        return <Server className="h-4 w-4" />;
      case "gemini":
        return <Zap className="h-4 w-4" />;
      case "anthropic":
        return <Brain className="h-4 w-4" />;
      case "deepseek":
        return <Rocket className="h-4 w-4" />;
      default:
        return <Cpu className="h-4 w-4" />;
    }
  };

  const getProviderColor = (kind: string) => {
    switch (kind) {
      case "openai_native":
      case "openai_compatible":
        return {
          border: "border-emerald-200/80 dark:border-emerald-800/60",
          bg: "bg-emerald-50/75 dark:bg-emerald-950/20",
          badge: "bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200",
          icon: "text-emerald-600 dark:text-emerald-400",
        };
      case "gemini":
        return {
          border: "border-orange-200/80 dark:border-orange-800/60",
          bg: "bg-orange-50/75 dark:bg-orange-950/20",
          badge: "bg-orange-100/90 dark:bg-orange-900/50 text-orange-900 dark:text-orange-200",
          icon: "text-orange-600 dark:text-orange-400",
        };
      case "anthropic":
        return {
          border: "border-cyan-200/80 dark:border-cyan-800/60",
          bg: "bg-cyan-50/75 dark:bg-cyan-950/20",
          badge: "bg-cyan-100/90 dark:bg-cyan-900/50 text-cyan-900 dark:text-cyan-200",
          icon: "text-cyan-600 dark:text-cyan-400",
        };
      case "deepseek":
        return {
          border: "border-blue-200/80 dark:border-blue-800/60",
          bg: "bg-blue-50/75 dark:bg-blue-950/20",
          badge: "bg-blue-100/90 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200",
          icon: "text-blue-600 dark:text-blue-400",
        };
      default:
        return {
          border: "border-slate-200/80 dark:border-slate-800/80",
          bg: "bg-slate-100/75 dark:bg-slate-900/65",
          badge: "bg-slate-100/90 dark:bg-slate-900/60 text-slate-900 dark:text-slate-200",
          icon: "text-slate-600 dark:text-slate-400",
        };
    }
  };

  return (
    <AdminPage>
      <AdminHeader
        title="服务商"
        description="管理平台默认服务商、API Key 和可用模型"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => providersQuery.query.refetch()}
              disabled={providersQuery.query.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${providersQuery.query.isFetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            {hasPendingChanges ? (
              <Button onClick={handleSaveModelChanges} disabled={savingModels}>
                {savingModels ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                保存模型变更
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className={`${adminSurfaceClass} rounded-xl border border-red-300/80 p-4 text-red-700 dark:border-red-800 dark:text-red-300`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionError(null)}
              className="ml-auto h-7 w-7 p-0"
            >
              ×
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className={`${adminSurfaceClass} flex items-center gap-3 p-6 text-slate-500`}>
          <RefreshCw className="h-4 w-4 animate-spin" />
          正在加载服务商配置...
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => {
            const colors = getProviderColor(provider.kind);
            const expanded = expandedProviders.has(provider.id);
            const hasPendingProviderChanges =
              pendingModelUpdates[provider.id] &&
              Object.keys(pendingModelUpdates[provider.id]).length > 0;

            return (
              <section
                key={provider.id}
                className={cn(
                  adminSurfaceClass,
                  "overflow-hidden border",
                  colors.border,
                  provider.isDefault && "ring-2 ring-emerald-500/30 dark:ring-emerald-400/25"
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition",
                    colors.bg,
                    "hover:brightness-[0.98] dark:hover:brightness-110"
                  )}
                  onClick={() => toggleExpanded(provider.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn("rounded-xl p-2", colors.badge)}>{getProviderIcon(provider.kind)}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {provider.name}
                        </h3>
                        {provider.isDefault ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">默认</Badge>
                        ) : null}
                        {!provider.enabled ? (
                          <Badge variant="secondary" className="opacity-80">
                            已禁用
                          </Badge>
                        ) : null}
                        {hasPendingProviderChanges ? (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                            有待保存变更
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        provider: {provider.slug} · model count: {provider.models.length}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {provider.hasApiKey ? (
                      <Badge variant="outline" className="max-w-[220px] truncate font-mono text-xs">
                        <KeyRound className="mr-1 h-3 w-3" />
                        {provider.apiKeyMasked}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        未配置 Key
                      </Badge>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 text-slate-500 transition-transform dark:text-slate-400",
                        expanded && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-4 px-4 pb-4 pt-3">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openApiKeyDialog(provider)}
                        className="gap-1 text-xs"
                      >
                        <KeyRound className="h-3 w-3" />
                        API Key
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFetchModels(provider)}
                        disabled={!provider.hasApiKey || fetchingModels === provider.id}
                        className="gap-1 text-xs"
                      >
                        {fetchingModels === provider.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        拉取模型
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(provider)}
                        disabled={!provider.hasApiKey || testingProvider === provider.id}
                        className="gap-1 text-xs"
                      >
                        {testingProvider === provider.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        连通测试
                      </Button>

                      <Button
                        variant={provider.enabled ? "secondary" : "default"}
                        size="sm"
                        onClick={() => handleToggleEnabled(provider)}
                        disabled={savingProvider === provider.id}
                        className="gap-1 text-xs"
                      >
                        {provider.enabled ? (
                          <>
                            <Check className="h-3 w-3" />
                            已启用
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            已禁用
                          </>
                        )}
                      </Button>
                    </div>

                    {!provider.isDefault && provider.enabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(provider)}
                        disabled={savingProvider === provider.id}
                        className="w-full gap-1 text-xs"
                      >
                        设为默认服务商
                      </Button>
                    ) : null}

                    {testResults[provider.id] ? (
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
                          testResults[provider.id].success
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
                        )}
                      >
                        {testResults[provider.id].success ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>连通成功</span>
                            {testResults[provider.id].latency ? (
                              <span className="text-xs opacity-70">
                                {testResults[provider.id].latency}ms
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4" />
                            <span>{testResults[provider.id].error?.message || "连通失败"}</span>
                          </>
                        )}
                      </div>
                    ) : null}

                    {fetchResults[provider.id]?.ok ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                        <Check className="h-4 w-4" />
                        <span>已同步 {fetchResults[provider.id].count} 个模型</span>
                      </div>
                    ) : null}

                    {fetchResults[provider.id] &&
                    !fetchResults[provider.id].ok &&
                    fetchResults[provider.id].error ? (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                        <AlertCircle className="h-4 w-4" />
                        <span>{fetchResults[provider.id].error}</span>
                      </div>
                    ) : null}

                    {provider.models.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">可用模型</Label>
                        <div className="overflow-hidden rounded-lg border border-slate-200/80 dark:border-slate-800/80">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100/70 dark:bg-slate-900/70">
                              <tr>
                                <th className="p-3 text-left font-medium">模型 ID</th>
                                <th className="w-28 p-3 text-center font-medium">用户可选</th>
                                <th className="w-28 p-3 text-center font-medium">默认列表</th>
                              </tr>
                            </thead>
                            <tbody>
                              {provider.models.map((model) => {
                                const state = getModelState(provider.id, model);
                                const isPending = pendingModelUpdates[provider.id]?.[model.id];
                                return (
                                  <tr
                                    key={model.id}
                                    className={cn(
                                      "border-t border-slate-200/70 dark:border-slate-800/70",
                                      isPending && "bg-amber-50/70 dark:bg-amber-900/15"
                                    )}
                                  >
                                    <td className="p-3">
                                      <div>
                                        <span className="font-mono text-xs">{model.modelKey}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center">
                                      <Checkbox
                                        checked={state.enabledForUsers}
                                        onCheckedChange={(checked) =>
                                          handleModelToggle(
                                            provider.id,
                                            model.id,
                                            "enabledForUsers",
                                            !!checked
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="p-3 text-center">
                                      <Checkbox
                                        checked={state.enabledInDefault}
                                        onCheckedChange={(checked) =>
                                          handleModelToggle(
                                            provider.id,
                                            model.id,
                                            "enabledInDefault",
                                            !!checked
                                          )
                                        }
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : provider.hasApiKey ? (
                      <p className="py-2 text-sm italic text-slate-500 dark:text-slate-400">
                        尚未同步到模型，请点击“拉取模型”。
                      </p>
                    ) : (
                      <p className="py-2 text-sm italic text-slate-500 dark:text-slate-400">
                        请先配置 API Key。
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>更新 API Key</DialogTitle>
            <DialogDescription>输入新 Key 后会立即保存并覆盖原值。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="请输入新的 API Key"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                不回填原始 Key。若保持为空，仅更新 Base URL。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                type="url"
                placeholder="https://api.example.com/v1"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">支持 OpenAI 兼容端点。</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveApiKey} disabled={savingProvider !== null}>
              {savingProvider ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
