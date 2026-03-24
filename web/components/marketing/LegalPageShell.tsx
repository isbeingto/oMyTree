"use client";

import React from "react";
import { FadeIn } from "@/components/animations/FadeIn";
import { mt } from "@/lib/site-i18n/marketing";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";
import type { MarketingKey } from "@/lib/site-i18n/marketing";

/* ── Shared legal page shell ── */

interface LegalPageProps {
  locale?: SiteLocale;
  badge: MarketingKey;
  title: MarketingKey;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalPageShell({
  locale = "en",
  badge,
  title,
  lastUpdated,
  children,
}: LegalPageProps) {
  return (
    <>
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-3xl space-y-10 relative z-10">
        {/* Header */}
        <FadeIn>
          <header className="text-center space-y-4 relative">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <FadeIn delay={0.1} distance={10}>
              <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-4 py-1.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium relative z-10">
                {mt(locale, badge)}
              </span>
            </FadeIn>
            <FadeIn delay={0.2} distance={20}>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight relative z-10">
                {mt(locale, title)}
              </h1>
            </FadeIn>
            <FadeIn delay={0.3} distance={10}>
              <p className="text-sm text-slate-500 dark:text-slate-400 relative z-10">
                {locale === "zh-Hans-CN"
                  ? `最后更新：${lastUpdated}`
                  : `Last updated: ${lastUpdated}`}
              </p>
            </FadeIn>
          </header>
        </FadeIn>

        {/* Content */}
        <FadeIn delay={0.2}>
          <article className="rounded-2xl glass-card p-8 md:p-10 prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-emerald-600 dark:prose-a:text-emerald-400">
            {children}
          </article>
        </FadeIn>
      </div>
    </>
  );
}
