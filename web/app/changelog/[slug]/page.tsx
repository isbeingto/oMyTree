import { notFound } from "next/navigation";
import Link from "next/link";
import { logDbError, pool } from "@/lib/db";
import { ArrowLeft, Calendar, Tag, Rocket, ChevronLeft, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ChangelogArticle } from "@/components/changelog/ChangelogArticle";
import type { Metadata } from "next";

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

async function getChangelogBySlug(slug: string): Promise<ChangelogDoc | null> {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, summary, content, version, lang, created_at, updated_at
       FROM site_docs
       WHERE slug = $1 AND doc_type = 'changelog' AND status = 'published'
       ORDER BY (lang = 'en') DESC, updated_at DESC
       LIMIT 1`,
      [slug]
    );
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getChangelogBySlug(slug);
  if (!doc) return { title: "Not Found – oMyTree" };
  const canonical = `https://www.omytree.com/changelog/${slug}`;
  return {
    title: `${doc.title} – Changelog – oMyTree`,
    description: doc.summary || `Changelog entry: ${doc.title}`,
    openGraph: {
      locale: 'en_US',
      title: `${doc.title} – Changelog – oMyTree`,
      description: doc.summary || `Changelog entry: ${doc.title}`,
    },
    alternates: {
      canonical,
      languages: {
        en: canonical,
        "zh-Hans-CN": `https://www.omytree.com/zh-Hans-CN/changelog/${slug}`,
        "x-default": canonical,
      },
    },
  };
}

export default async function ChangelogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = await getChangelogBySlug(slug);
  if (!doc) notFound();

  const { prev, next } = await getAdjacentEntries(doc.created_at);

  return (
    <MarketingLayout activeNav="changelog">
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <ChangelogArticle doc={doc} prev={prev} next={next} />
    </MarketingLayout>
  );
}
