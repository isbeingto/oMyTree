import { notFound } from "next/navigation";
import { logDbError, pool } from "@/lib/db";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ChangelogTimeline } from "@/components/changelog/ChangelogTimeline";
import {
  isValidLocale,
  type SiteLocale,
  localeToDocLang,
} from "@/lib/site-i18n/locale-utils";

export const revalidate = 120;

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  version: string | null;
  lang: string;
  created_at: string;
  updated_at: string;
}

interface MonthGroup {
  label: string;
  entries: ChangelogEntry[];
}

async function getChangelogs(docLang: string): Promise<ChangelogEntry[]> {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, version, lang, created_at, updated_at
       FROM site_docs
       WHERE status = 'published' AND doc_type = 'changelog' AND lang = $1
       ORDER BY created_at DESC`,
      [docLang]
    );
    if (result.rows.length === 0) {
      const fallback = await pool.query(
        `SELECT id, title, slug, summary, version, lang, created_at, updated_at
         FROM site_docs
         WHERE status = 'published' AND doc_type = 'changelog'
         ORDER BY created_at DESC`
      );
      return fallback.rows;
    }
    return result.rows;
  } catch (err) {
    logDbError("[changelog] Failed to fetch changelogs:", err);
    return [];
  }
}

function groupByMonth(entries: ChangelogEntry[], locale: SiteLocale): MonthGroup[] {
  const groups: Map<string, ChangelogEntry[]> = new Map();
  const intlLocale = locale === "zh-Hans-CN" ? "zh-CN" : "en-US";
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const label = date.toLocaleDateString(intlLocale, { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export default async function LocaleChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isValidLocale(rawLocale)) notFound();
  const locale = rawLocale as SiteLocale;
  const docLang = localeToDocLang(locale);

  const changelogs = await getChangelogs(docLang);
  const monthGroups = groupByMonth(changelogs, locale);

  return (
    <MarketingLayout activeNav="changelog" locale={locale}>
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-4xl">
        <ChangelogTimeline monthGroups={monthGroups} hasEntries={changelogs.length > 0} locale={locale} />
      </div>
    </MarketingLayout>
  );
}
