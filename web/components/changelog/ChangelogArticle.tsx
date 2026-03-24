"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Calendar, Tag, ChevronLeft, ChevronRight, Sparkles, Globe } from "lucide-react";
import { localePath, type SiteLocale } from "@/lib/site-i18n/locale-utils";
import { mt } from "@/lib/site-i18n/marketing";
import { LocaleSwitchLink } from "@/components/LocaleSwitchLink";

interface ChangelogDoc {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  version: string | null;
  lang: string;
  created_at: string;
  updated_at: string;
}

interface AdjacentEntry {
  slug: string;
  title: string;
  version: string | null;
}

function formatDate(dateString: string, locale?: SiteLocale): string {
  const date = new Date(dateString);
  const intlLocale = locale === "zh-Hans-CN" ? "zh-CN" : "en-US";
  return date.toLocaleDateString(intlLocale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ChangelogArticle({
  doc,
  prev,
  next,
  locale,
}: {
  doc: ChangelogDoc;
  prev: AdjacentEntry | null;
  next: AdjacentEntry | null;
  locale?: SiteLocale;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href={localePath(locale ?? "en", "/changelog")}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {mt(locale, 'changelog_back')}
        </Link>
      </motion.div>

      {/* Article card */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative rounded-2xl border border-white/10 dark:border-white/[0.06] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/20 overflow-hidden"
      >
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />

        {/* Article header */}
        <header className="px-6 sm:px-10 pt-10 pb-8 border-b border-slate-200/50 dark:border-white/[0.06]">
          {/* Meta row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-center gap-3 mb-5"
          >
            {doc.version && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/40 px-3 py-1 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                <Tag className="h-3.5 w-3.5" />
                {doc.version}
              </span>
            )}
            <time dateTime={new Date(doc.created_at).toISOString()} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(doc.created_at, locale)}
            </time>
            <LocaleSwitchLink
              toLocale={locale === 'zh-Hans-CN' ? 'en' : 'zh-Hans-CN'}
              href={locale === 'zh-Hans-CN' ? `/changelog/${doc.slug}` : `/zh-Hans-CN/changelog/${doc.slug}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
            >
              <Globe className="h-3 w-3" />
              {locale === 'zh-Hans-CN' ? 'English' : '中文'}
            </LocaleSwitchLink>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight"
          >
            {doc.title}
          </motion.h1>

          {/* Summary */}
          {doc.summary && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-4 text-lg text-slate-600 dark:text-slate-400 leading-relaxed"
            >
              {doc.summary}
            </motion.p>
          )}
        </header>

        {/* Article content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="px-6 sm:px-10 py-10"
        >
          <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-emerald-600 dark:prose-a:text-emerald-400">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-10 mb-4 text-slate-900 dark:text-white">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-semibold mt-10 mb-4 text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="inline-block h-5 w-1 rounded-full bg-emerald-500" />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-medium mt-6 mb-3 text-slate-900 dark:text-white">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="my-4 leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="my-4 pl-6 list-disc space-y-2 text-slate-600 dark:text-slate-400 marker:text-emerald-500">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-4 pl-6 list-decimal space-y-2 text-slate-600 dark:text-slate-400">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                code: ({ children, className }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-sm font-mono text-emerald-800 dark:text-emerald-300 border border-emerald-200/30 dark:border-emerald-700/30">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className="block p-4 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-sm font-mono overflow-x-auto border border-slate-200/50 dark:border-white/5">
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="my-4 rounded-lg bg-slate-100 dark:bg-slate-800/80 overflow-x-auto border border-slate-200/50 dark:border-white/5">
                    {children}
                  </pre>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-6 pl-5 border-l-4 border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-lg py-3 pr-4 italic text-slate-600 dark:text-slate-400">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline decoration-emerald-500/30 underline-offset-2"
                    target={href?.startsWith("http") ? "_blank" : undefined}
                    rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {children}
                  </a>
                ),
                hr: () => (
                  <hr className="my-10 border-0 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent" />
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
                ),
              }}
            >
              {doc.content || ""}
            </ReactMarkdown>
          </div>
        </motion.div>
      </motion.article>

      {/* Adjacent navigation */}
      {(prev || next) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {prev ? (
            <Link
              href={localePath(locale ?? "en", `/changelog/${prev.slug}`)}
              className="group flex items-center gap-3 rounded-xl border border-white/10 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] backdrop-blur-sm px-5 py-4 hover:border-emerald-500/30 dark:hover:border-emerald-400/20 transition-all duration-300"
            >
              <ChevronLeft className="h-5 w-5 text-slate-400 group-hover:text-emerald-500 group-hover:-translate-x-0.5 transition-all flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-xs text-slate-500 dark:text-slate-500 mb-0.5">{mt(locale, 'changelog_prev')}</span>
                <span className="block text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  {prev.version ? `${prev.version} – ` : ""}{prev.title}
                </span>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={localePath(locale ?? "en", `/changelog/${next.slug}`)}
              className="group flex items-center justify-end gap-3 rounded-xl border border-white/10 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] backdrop-blur-sm px-5 py-4 hover:border-emerald-500/30 dark:hover:border-emerald-400/20 transition-all duration-300 text-right"
            >
              <div className="min-w-0">
                <span className="block text-xs text-slate-500 dark:text-slate-500 mb-0.5">{mt(locale, 'changelog_next')}</span>
                <span className="block text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  {next.version ? `${next.version} – ` : ""}{next.title}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Link>
          ) : (
            <div />
          )}
        </motion.div>
      )}

      {/* Footer CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8 flex flex-wrap justify-center gap-4"
      >
        <Link
          href={localePath(locale ?? "en", "/changelog")}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/50 dark:border-white/10 rounded-full transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4" />
          {mt(locale, 'changelog_all_updates')}
        </Link>
        <Link
          href="/app"
          className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
        >
          {mt(locale, 'changelog_try_app')}
        </Link>
      </motion.div>
    </div>
  );
}
