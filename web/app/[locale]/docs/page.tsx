import { notFound } from 'next/navigation';
import Link from 'next/link';
import { logDbError, pool } from '@/lib/db';
import { FileText, BookOpen, ArrowRight } from 'lucide-react';
import { MarketingLayout } from '@/components/marketing/MarketingLayout';
import { FadeIn } from '@/components/animations/FadeIn';
import {
  isValidLocale,
  type SiteLocale,
  localePath,
  localeToDocLang,
} from '@/lib/site-i18n/locale-utils';
import { mt } from '@/lib/site-i18n/marketing';

export const revalidate = 120;

interface Doc {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  lang: string;
  updated_at: string;
}

async function getPublishedDocs(docLang: string): Promise<Doc[]> {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, lang, updated_at
       FROM site_docs
       WHERE status = 'published' AND lang = $1 AND doc_type = 'article'
       ORDER BY updated_at DESC`,
      [docLang]
    );
    // Fallback to all published docs if no docs found for the specific language
    if (result.rows.length === 0) {
      const fallback = await pool.query(
        `SELECT id, title, slug, summary, lang, updated_at
         FROM site_docs
         WHERE status = 'published' AND doc_type = 'article'
         ORDER BY updated_at DESC`
      );
      return fallback.rows;
    }
    return result.rows;
  } catch (err) {
    logDbError('[docs] Failed to fetch docs:', err);
    return [];
  }
}

function LangBadge({ lang }: { lang: string }) {
  const labels: Record<string, string> = {
    en: 'EN',
    'zh-CN': '中文',
  };
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100/80 dark:bg-emerald-900/50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      {labels[lang] || lang}
    </span>
  );
}

function formatDate(dateString: string, locale: SiteLocale): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === 'zh-Hans-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function LocaleDocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === 'en') notFound();
  const locale = rawLocale as SiteLocale;

  const docLang = localeToDocLang(locale);
  const docs = await getPublishedDocs(docLang);
  const hasDocs = docs.length > 0;

  return (
    <MarketingLayout activeNav="docs" locale={locale}>
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-3xl space-y-10">
        {/* Header */}
        <FadeIn>
          <header className="text-center space-y-4">
            <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-4 py-1.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium">
              {mt(locale, 'docs_badge')}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
              {mt(locale, 'docs_title')}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              {mt(locale, 'docs_subtitle')}
            </p>
          </header>
        </FadeIn>

        {hasDocs ? (
          <div className="space-y-4">
            {docs.map((doc, index) => (
              <FadeIn key={doc.id} delay={0.1 + index * 0.05}>
                <Link
                  href={localePath(locale, `/docs/${doc.slug}`)}
                  className="group block rounded-2xl glass-panel-strong px-6 py-5 shadow-lg hover:shadow-xl hover:border-emerald-500/50 dark:hover:border-emerald-400/50 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        <span className="truncate">{doc.title}</span>
                      </h2>
                      {doc.summary && (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                          {doc.summary}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
                        <time dateTime={new Date(doc.updated_at).toISOString()}>{formatDate(doc.updated_at, locale)}</time>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <LangBadge lang={doc.lang} />
                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Link>
              </FadeIn>
            ))}
          </div>
        ) : (
          <FadeIn delay={0.1}>
            <div className="rounded-2xl glass-panel-strong border border-dashed border-slate-300/50 dark:border-white/10 px-8 py-16 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-600" />
              <h2 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                {mt(locale, 'docs_empty_title')}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {mt(locale, 'docs_empty_desc')}
              </p>
            </div>
          </FadeIn>
        )}

        {/* CTA buttons */}
        <FadeIn delay={0.3}>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Link
              href="/app"
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
            >
              {mt(locale, 'docs_cta_app')}
            </Link>
            <Link
              href={localePath(locale, '/')}
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/50 dark:border-white/10 rounded-full transition-all duration-300"
            >
              {mt(locale, 'docs_cta_home')}
            </Link>
          </div>
        </FadeIn>
      </div>
    </MarketingLayout>
  );
}
