import { logDbError, pool } from "@/lib/db";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ChangelogTimeline } from "@/components/changelog/ChangelogTimeline";

export const revalidate = 120;

export const metadata = {
  title: "Changelog – oMyTree",
  description: "See what's new in oMyTree. Track every update, feature, and improvement.",
};

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

async function getChangelogs(): Promise<ChangelogEntry[]> {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, version, lang, created_at, updated_at
       FROM site_docs
       WHERE status = 'published' AND doc_type = 'changelog' AND lang = 'en'
       ORDER BY created_at DESC`
    );
    return result.rows;
  } catch (err) {
    logDbError("[changelog] Failed to fetch changelogs:", err);
    return [];
  }
}

function groupByMonth(entries: ChangelogEntry[]): MonthGroup[] {
  const groups: Map<string, ChangelogEntry[]> = new Map();
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export default async function ChangelogPage() {
  const changelogs = await getChangelogs();
  const monthGroups = groupByMonth(changelogs);
  const hasEntries = changelogs.length > 0;

  return (
    <MarketingLayout activeNav="changelog">
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-4xl">
        <ChangelogTimeline monthGroups={monthGroups} hasEntries={hasEntries} />
      </div>
    </MarketingLayout>
  );
}
