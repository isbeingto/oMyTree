import { notFound } from "next/navigation";
import { logDbError, pool } from "@/lib/db";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ChangelogArticle } from "@/components/changelog/ChangelogArticle";
import type { Metadata } from "next";
import {
  isValidLocale,
  type SiteLocale,
  localeToDocLang,
  localePath,
} from "@/lib/site-i18n/locale-utils";

export const dynamic = "force-dynamic";

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

async function getChangelogBySlug(slug: string, docLang: string): Promise<ChangelogDoc | null> {
  try {
    let result = await pool.query(
      `SELECT id, title, slug, summary, content, version, lang, created_at, updated_at
       FROM site_docs
       WHERE slug = $1 AND doc_type = 'changelog' AND status = 'published' AND lang = $2
       LIMIT 1`,
      [slug, docLang]
    );
    if (!result.rows[0]) {
      result = await pool.query(
        `SELECT id, title, slug, summary, content, version, lang, created_at, updated_at
         FROM site_docs
         WHERE slug = $1 AND doc_type = 'changelog' AND status = 'published'
         LIMIT 1`,
        [slug]
      );
    }
    return result.rows[0] || null;
  } catch (err) {
    logDbError("[changelog/[slug]] Failed to fetch:", err);
    return null;
  }
}

async function getAdjacentEntries(createdAt: string): Promise<{ prev: AdjacentEntry | null; next: AdjacentEntry | null }> {
  try {
    const [prevResult, nextResult] = await Promise.all([
      pool.query(
        `SELECT slug, title, version FROM site_docs
         WHERE doc_type = 'changelog' AND status = 'published' AND created_at < $1
         ORDER BY created_at DESC LIMIT 1`,
        [createdAt]
      ),
      pool.query(
        `SELECT slug, title, version FROM site_docs
         WHERE doc_type = 'changelog' AND status = 'published' AND created_at > $1
         ORDER BY created_at ASC LIMIT 1`,
        [createdAt]
      ),
    ]);
    return {
      prev: prevResult.rows[0] || null,
      next: nextResult.rows[0] || null,
    };
  } catch {
    return { prev: null, next: null };
  }
}

export default async function LocaleChangelogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") notFound();
  const locale = rawLocale as SiteLocale;
  const docLang = localeToDocLang(locale);

  const doc = await getChangelogBySlug(slug, docLang);
  if (!doc) notFound();

  const isFallback = doc.lang !== docLang;
  const { prev, next } = await getAdjacentEntries(doc.created_at);

  return (
    <MarketingLayout activeNav="changelog" locale={locale}>
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      {isFallback && (
        <div className="mx-auto max-w-3xl mb-6 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-900/20 px-5 py-3 text-sm text-amber-800 dark:text-amber-300">
          {locale === 'zh-Hans-CN'
            ? '此更新日志暂无中文版本，当前显示英文内容。'
            : 'This changelog is not available in your language yet. Showing the English version.'}
        </div>
      )}

      <ChangelogArticle doc={doc} prev={prev} next={next} locale={locale} />
    </MarketingLayout>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  if (!isValidLocale(rawLocale) || rawLocale === "en") return {};
  const locale = rawLocale as SiteLocale;
  const docLang = localeToDocLang(locale);

  const doc = await getChangelogBySlug(slug, docLang);
  if (!doc) return { title: "Not Found – oMyTree" };

  const canonical = `https://www.omytree.com${localePath(locale, `/changelog/${slug}`)}`;

  const enUrl = `https://www.omytree.com/changelog/${slug}`;
  return {
    title: `${doc.title} – Changelog – oMyTree`,
    description: doc.summary || `Changelog entry: ${doc.title}`,
    openGraph: {
      locale: 'zh_CN',
      title: `${doc.title} – Changelog – oMyTree`,
      description: doc.summary || `Changelog entry: ${doc.title}`,
    },
    alternates: {
      canonical,
      languages: {
        en: enUrl,
        "zh-Hans-CN": `https://www.omytree.com/zh-Hans-CN/changelog/${slug}`,
        "x-default": enUrl,
      },
    },
  };
}
