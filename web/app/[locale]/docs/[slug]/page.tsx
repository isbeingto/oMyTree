import { notFound } from 'next/navigation';
import Link from 'next/link';
import { logDbError, pool } from '@/lib/db';
import { ArrowLeft, Calendar, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MarketingLayout } from '@/components/marketing/MarketingLayout';
import type { Metadata } from 'next';
import { LocaleSwitchLink } from '@/components/LocaleSwitchLink';
import {
  isValidLocale,
  type SiteLocale,
  localePath,
  localeToDocLang,
} from '@/lib/site-i18n/locale-utils';
import { mt } from '@/lib/site-i18n/marketing';

interface Doc {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  lang: string;
  created_at: string;
  updated_at: string;
}

async function getDocBySlug(slug: string, lang: string): Promise<Doc | null> {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, content, lang, created_at, updated_at
       FROM site_docs
       WHERE slug = $1 AND lang = $2 AND status = 'published'`,
      [slug, lang]
    );
    return result.rows[0] || null;
  } catch (err) {
    logDbError('[docs/[slug]] Failed to fetch doc:', err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === 'en') return {};
  const locale = rawLocale as SiteLocale;
  const docLang = localeToDocLang(locale);

  let doc = await getDocBySlug(slug, docLang);
  if (!doc) doc = await getDocBySlug(slug, 'en');
  if (!doc) doc = await getDocBySlug(slug, 'zh-CN');
  if (!doc) return { title: 'Not Found – oMyTree' };

  const canonical = `https://www.omytree.com${localePath(locale, `/docs/${slug}`)}`;

  const enUrl = `https://www.omytree.com/docs/${slug}`;
  return {
    title: `${doc.title} – oMyTree`,
    description: doc.summary || undefined,
    openGraph: {
      locale: 'zh_CN',
      title: `${doc.title} – oMyTree`,
      description: doc.summary || undefined,
    },
    alternates: {
      canonical,
      languages: {
        en: enUrl,
        'zh-Hans-CN': `https://www.omytree.com/zh-Hans-CN/docs/${slug}`,
        'x-default': enUrl,
      },
    },
  };
}

function formatDate(dateString: string, locale: SiteLocale): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === 'zh-Hans-CN' ? 'zh-CN' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function LangBadge({ lang }: { lang: string }) {
  const labels: Record<string, string> = {
    en: 'English',
    'zh-CN': '中文',
  };
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100/80 dark:bg-emerald-900/50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {labels[lang] || lang}
    </span>
  );
}

export default async function LocaleDocDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === 'en') notFound();
  const locale = rawLocale as SiteLocale;

  const docLang = localeToDocLang(locale);

  // Try locale-specific version first, then fall back to any language
  let doc = await getDocBySlug(slug, docLang);
  if (!doc) {
    doc = await getDocBySlug(slug, 'en');
  }
  if (!doc) {
    doc = await getDocBySlug(slug, 'zh-CN');
  }
  if (!doc) {
    notFound();
  }

  const isFallback = doc.lang !== docLang;

  return (
    <MarketingLayout activeNav="docs" locale={locale}>
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          href={localePath(locale, '/docs')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {mt(locale, 'doc_back')}
        </Link>

        {/* Fallback language banner */}
        {isFallback && (
          <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-900/20 px-5 py-3 text-sm text-amber-800 dark:text-amber-300">
            {locale === 'zh-Hans-CN'
              ? '此文档暂无中文版本，当前显示英文内容。'
              : 'This document is not available in your language yet. Showing the English version.'}
          </div>
        )}

        {/* Article card */}
        <article className="rounded-2xl glass-panel-strong shadow-xl overflow-hidden">
          {/* Article header */}
          <header className="px-6 sm:px-8 py-8 border-b border-slate-200/50 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <LangBadge lang={doc.lang} />
              <time dateTime={new Date(doc.updated_at).toISOString()} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(doc.updated_at, locale)}
              </time>
              <LocaleSwitchLink
                toLocale="en"
                href={`/docs/${doc.slug}`}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
              >
                <Globe className="h-3 w-3" />
                English
              </LocaleSwitchLink>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {doc.title}
            </h1>
            {doc.summary && (
              <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
                {doc.summary}
              </p>
            )}
          </header>

          {/* Article content */}
          <div className="px-6 sm:px-8 py-8">
            <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-emerald-600 dark:prose-a:text-emerald-400">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mt-8 mb-4 text-slate-900 dark:text-white">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-medium mt-6 mb-3 text-slate-900 dark:text-white">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="my-4 leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-4 pl-6 list-disc space-y-2 text-slate-600 dark:text-slate-400">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-4 pl-6 list-decimal space-y-2 text-slate-600 dark:text-slate-400">{children}</ol>
                  ),
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  code: ({ children, className }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-200">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="block p-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-mono overflow-x-auto">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="my-4 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-x-auto">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-4 pl-4 border-l-4 border-emerald-500 italic text-slate-600 dark:text-slate-400">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline"
                      target={href?.startsWith('http') ? '_blank' : undefined}
                      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    >
                      {children}
                    </a>
                  ),
                  hr: () => <hr className="my-8 border-slate-200 dark:border-white/10" />,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
                  ),
                }}
              >
                {doc.content || ''}
              </ReactMarkdown>
            </div>
          </div>
        </article>

        {/* Footer navigation */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href={localePath(locale, '/docs')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/50 dark:border-white/10 rounded-full transition-all duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
            {mt(locale, 'doc_back')}
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
          >
            {mt(locale, 'doc_cta_app')}
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
