'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { t, type Lang } from '@/lib/i18n';
import { Crown, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMonthlyUsage, getQuotaStatus, settingsKeys } from '../hooks/useSettingsApi';

interface BillingSectionProps {
  lang: Lang;
  userId: string;
}

const providerLabels: Record<string, { en: string; zh: string }> = {
  'omytree-default': { en: 'oMyTree Default', zh: 'oMyTree 默认' },
  gemini: { en: 'Google Gemini', zh: 'Google Gemini' },
  google: { en: 'Google Gemini', zh: 'Google Gemini' },
  openai: { en: 'OpenAI', zh: 'OpenAI' },
};

const formatProviderLabel = (provider: string, lang: Lang) => {
  const fallback = provider || 'unknown';
  const label = providerLabels[provider];
  if (!label) return fallback;
  return lang === 'zh-CN' ? label.zh : label.en;
};

export function BillingSection({ lang, userId }: BillingSectionProps) {
  const billingQuery = useQuery({
    queryKey: settingsKeys.billing(userId),
    queryFn: async () => {
      const [usage, quota] = await Promise.all([getMonthlyUsage(userId), getQuotaStatus(userId)]);
      return { usage, quota };
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(lang === 'zh-CN' ? 'zh-CN' : 'en-US'),
    [lang]
  );

  const formatNumber = (value?: number) => numberFormatter.format(value || 0);
  const loading = billingQuery.isLoading;
  const usage = billingQuery.data?.usage || null;
  const quota = billingQuery.data?.quota || null;
  const error = billingQuery.error
    ? (lang === 'zh-CN' ? '无法加载用量数据，请稍后重试。' : 'Failed to load usage. Please try again.')
    : null;

  const summary = usage?.summary;
  const providerRows = usage?.by_provider || [];
  const planInfo = usage?.plan;
  const planName: 'free' | 'pro' | 'team' = planInfo?.name || quota?.plan || 'free';
  const weeklyTurn = quota?.weekly?.turn;
  const weeklySummarize = quota?.weekly?.summarize;
  const hasByok = Boolean(quota?.has_byok);
  const manageSubscriptionLabel = lang === 'zh-CN' ? '管理订阅' : 'Manage subscription';
  const pricingHref = lang === 'zh-CN' ? '/zh-Hans-CN/pricing' : '/pricing';

  const StatBlock = ({
    label,
    value,
    footer,
  }: {
    label: string;
    value: string;
    footer?: string;
  }) => (
    <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/60 p-4 shadow-inner shadow-emerald-500/5">
      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-7 rounded-md" />
      ) : (
        <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">{value}</div>
      )}
      {footer && <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{footer}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Plan Card */}
      <div className="rounded-2xl glass-panel-strong px-5 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t(lang, 'settings_billing_plan')}
              </h3>
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
              {planName === 'free'
                ? t(lang, 'settings_billing_plan_free')
                : planName.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/60 p-4 shadow-inner shadow-emerald-500/5">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t(lang, 'settings_weekly_quota_turn_label')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
              {weeklyTurn
                ? `${formatNumber(weeklyTurn.remaining)} / ${formatNumber(weeklyTurn.limit)}`
                : formatNumber(0)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {hasByok
                ? t(lang, 'settings_weekly_quota_byok_unlimited')
                : t(lang, 'settings_weekly_quota_byok_unlimited_need_key')}
            </div>
          </div>
          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/60 p-4 shadow-inner shadow-emerald-500/5">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {t(lang, 'settings_weekly_quota_summarize_label')}
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
              {weeklySummarize
                ? `${formatNumber(weeklySummarize.remaining)} / ${formatNumber(weeklySummarize.limit)}`
                : formatNumber(0)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {t(lang, 'settings_weekly_quota_reset_utc')}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t(lang, 'settings_billing_plan_desc')}
        </p>

        <div>
          <Link
            href={pricingHref}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {manageSubscriptionLabel}
          </Link>
        </div>
      </div>

      {/* Usage Card */}
      <div className="rounded-2xl glass-panel-strong px-5 py-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t(lang, 'settings_usage_title')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t(lang, 'settings_usage_subtitle')}
            </p>
          </div>
          {usage?.period && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100/60 dark:bg-slate-800/60 rounded-full px-3 py-1">
              {usage.period.from} → {usage.period.to}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200/70 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/40 px-3 py-2 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <StatBlock
            label={t(lang, 'settings_usage_this_month_requests')}
            value={formatNumber(summary?.requests)}
            footer={lang === 'zh-CN' ? '请求' : 'requests'}
          />
          <StatBlock
            label={t(lang, 'settings_usage_this_month_tokens')}
            value={formatNumber(summary?.tokens_total)}
            footer={lang === 'zh-CN' ? 'tokens' : 'tokens'}
          />
          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-900/60 p-4 shadow-inner shadow-emerald-500/5">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2">
              {t(lang, 'settings_usage_platform_tokens')} vs {t(lang, 'settings_usage_byok_tokens')}
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="h-12 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                <div className="h-12 rounded-lg bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-900/20 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-200 font-semibold">
                    {t(lang, 'settings_usage_platform_tokens')}
                  </div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {formatNumber(summary?.tokens_platform)}
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-200/80">tokens</div>
                </div>
                <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-900/20 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-200 font-semibold">
                    {t(lang, 'settings_usage_byok_tokens')}
                  </div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {formatNumber(summary?.tokens_byok)}
                  </div>
                  <div className="text-[11px] text-indigo-700/80 dark:text-indigo-200/80">tokens</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl glass-panel-soft p-3 shadow-inner shadow-emerald-500/5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 tracking-wide uppercase">
              {t(lang, 'settings_usage_title')}
            </h4>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {lang === 'zh-CN' ? '按服务商与 BYOK 区分' : 'By provider and BYOK source'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2 pr-3">{t(lang, 'settings_usage_table_provider')}</th>
                  <th className="text-left py-2 pr-3">{t(lang, 'settings_usage_table_source')}</th>
                  <th className="text-right py-2 pr-3">{t(lang, 'settings_usage_table_requests')}</th>
                  <th className="text-right py-2">{t(lang, 'settings_usage_table_tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, idx) => (
                      <tr key={idx} className="border-t border-white/50 dark:border-white/10">
                        <td className="py-3 pr-3">
                          <div className="h-5 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
                        </td>
                        <td className="py-3 pr-3">
                          <div className="h-5 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse w-24" />
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <div className="h-5 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse ml-auto w-16" />
                        </td>
                        <td className="py-3 text-right">
                          <div className="h-5 rounded bg-slate-200/80 dark:bg-slate-800/80 animate-pulse ml-auto w-20" />
                        </td>
                      </tr>
                    ))
                  : providerRows.length > 0
                    ? providerRows.map((row) => (
                        <tr
                          key={`${row.provider}-${row.is_byok ? 'byok' : 'platform'}`}
                          className="border-t border-white/50 dark:border-white/10"
                        >
                          <td className="py-3 pr-3">
                            <div className="font-medium text-slate-900 dark:text-slate-50">
                              {formatProviderLabel(row.provider, lang)}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{row.provider}</div>
                          </td>
                          <td className="py-3 pr-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                row.is_byok
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                              }`}
                            >
                              {row.is_byok
                                ? t(lang, 'settings_usage_source_byok')
                                : t(lang, 'settings_usage_source_platform')}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold text-slate-900 dark:text-slate-50">
                            {formatNumber(row.requests)}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900 dark:text-slate-50">
                            {formatNumber(row.tokens_total)}
                          </td>
                        </tr>
                      ))
                    : (
                      <tr className="border-t border-white/50 dark:border-white/10">
                        <td colSpan={4} className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                          {t(lang, 'settings_usage_empty')}
                        </td>
                      </tr>
                    )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
