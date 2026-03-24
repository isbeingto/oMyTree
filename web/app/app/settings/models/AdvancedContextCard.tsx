'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { t, type Lang } from '@/lib/i18n';
import {
  modelSettingsKeys,
  updateLlmSettings,
  useLlmSettingsQuery,
  useUserProvidersQuery,
} from './hooks/useModelSettingsApi';

type ProviderKind = 'openai' | 'google' | 'anthropic' | 'deepseek';

type UserProvider = {
  kind: ProviderKind;
  enabled: boolean;
  display_name?: string;
  test_passed?: boolean;
};

function labelForProvider(provider: string | null | undefined, lang: Lang): string {
  if (!provider) return lang === 'zh-CN' ? '未知' : 'Unknown';
  const p = provider.toLowerCase();
  if (p === 'omytree-default') return 'oMyTree Default';
  if (p === 'openai') return 'OpenAI';
  if (p === 'google') return 'Google AI';
  if (p === 'anthropic') return 'Anthropic';
  if (p === 'deepseek') return 'DeepSeek';
  return provider;
}

export function AdvancedContextCard({ lang }: { lang: Lang }) {
  const { toast } = useToast();
  const router = useRouter();
  const { update } = useSession();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);

  const llmSettingsQuery = useLlmSettingsQuery();
  const userProvidersQuery = useUserProvidersQuery();

  const provider = llmSettingsQuery.data?.provider || 'omytree-default';
  const enabled = Boolean(llmSettingsQuery.data?.enable_advanced_context);
  const advancedAvailable = Boolean(llmSettingsQuery.data?.advanced_available);
  const disabledReason = llmSettingsQuery.data?.advanced_disabled_reason || null;
  const userProviders = (userProvidersQuery.data?.providers || []) as UserProvider[];
  const loading = llmSettingsQuery.isLoading || userProvidersQuery.isLoading;
  const switchEnabled = optimisticEnabled ?? enabled;

  useEffect(() => {
    setOptimisticEnabled(null);
  }, [enabled]);

  const firstEnabledByokProvider = useMemo(() => {
    const enabledProviders = userProviders.filter((p) => p.enabled);
    if (enabledProviders.length === 0) return null;

    // Prefer tested providers if possible
    const tested = enabledProviders.find((p) => p.test_passed);
    return tested || enabledProviders[0];
  }, [userProviders]);

  const canEnable = advancedAvailable || enabled;

  const onToggle = useCallback(
    async (next: boolean) => {
      if (saving) return;

      // If turning on but no BYOK, block (backend would also block)
      if (next && !advancedAvailable) {
        toast({
          title: t(lang, 'toast_advanced_blocked'),
          description:
            disabledReason ||
            (lang === 'zh-CN'
              ? '请先添加并启用至少一个自带模型 API Key'
              : 'Please add and enable at least one BYOK API key first'),
          variant: 'destructive',
        });
        return;
      }

      const prevEnabled = enabled;
      setOptimisticEnabled(next);
      setSaving(true);

      try {
        let providerOverride: string | null = null;
        if (next && provider === 'omytree-default') {
          providerOverride = firstEnabledByokProvider?.kind || null;
          if (!providerOverride) {
            throw new Error(
              lang === 'zh-CN'
                ? '未找到可用的 BYOK 提供商，请先在下方配置并启用模型'
                : 'No enabled BYOK provider found. Please configure and enable a provider below.'
            );
          }
        }

        await updateLlmSettings({
          enable_advanced_context: next,
          ...(providerOverride ? { provider: providerOverride } : {}),
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: modelSettingsKeys.llmSettings() }),
          queryClient.invalidateQueries({ queryKey: modelSettingsKeys.userProviders() }),
        ]);

        toast({
          title: t(lang, 'toast_advanced_updated'),
          description:
            next && providerOverride
              ? lang === 'zh-CN'
                ? `已开启高级模式，并切换到 ${labelForProvider(providerOverride, lang)}`
                : `Advanced mode enabled. Switched to ${labelForProvider(providerOverride, lang)}`
              : undefined,
        });

        // Refresh NextAuth session + server components
        try {
          await update();
        } catch (err) {
          // Non-fatal: fallback to router refresh
          console.warn('[AdvancedContextCard] session update failed', err);
        }
        router.refresh();
      } catch (err) {
        console.error('[AdvancedContextCard] toggle failed', err);
        setOptimisticEnabled(prevEnabled);
        toast({
          title: t(lang, 'toast_advanced_update_failed'),
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setOptimisticEnabled(null);
        setSaving(false);
      }
    },
    [
      saving,
      advancedAvailable,
      disabledReason,
      enabled,
      firstEnabledByokProvider,
      lang,
      provider,
      router,
      toast,
      update,
      queryClient,
    ]
  );

  return (
    <Card className="rounded-2xl glass-panel shadow-sm shadow-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">
              {lang === 'zh-CN' ? '高级上下文档位' : 'Advanced context profiles'}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {lang === 'zh-CN'
                ? '开启后，新建树前需选择档位与记忆范围；平台默认模型将不可用。'
                : 'When enabled, new trees require profile/scope selection; the default model becomes unavailable.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={switchEnabled}
              onCheckedChange={onToggle}
              disabled={loading || saving || !canEnable}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          {!advancedAvailable && !enabled && (
            <div className="text-amber-600 dark:text-amber-400">
              {disabledReason ||
                (lang === 'zh-CN'
                  ? '需先添加并启用至少一个自带模型 API Key 才能开启'
                  : 'Add and enable a BYOK API key to enable this')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
