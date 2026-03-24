import { notFound } from 'next/navigation';
import { getSafeServerSession } from '@/lib/auth';
import { Hero, BentoFeatures, Showcase, Resources } from '@/components/landing/v3';
import { Footer } from '@/components/landing/Footer';
import { isValidLocale, type SiteLocale, localeToDocLang } from '@/lib/site-i18n/locale-utils';
import { mt } from '@/lib/site-i18n/marketing';
import type { Metadata } from 'next';
import { pool } from '@/lib/db';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale === 'zh-Hans-CN') {
    const loc = locale as SiteLocale;
    return {
      title: { absolute: mt(loc, 'home_meta_title') },
      description: mt(loc, 'home_meta_description'),
      alternates: {
        canonical: 'https://www.omytree.com/zh-Hans-CN',
        languages: {
          en: 'https://www.omytree.com',
          'zh-Hans-CN': 'https://www.omytree.com/zh-Hans-CN',
        },
      },
    };
  }
  return {};
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale) || locale === 'en') {
    notFound();
  }

  const session = await getSafeServerSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const loc = locale as SiteLocale;
  const docLang = localeToDocLang(loc);

  // Fetch latest resources for the landing page
  let latestDocs = [];
  let latestChangelogs = [];

  try {
    const docsResult = await pool.query(
      `SELECT id, title, slug, summary, lang, updated_at
       FROM site_docs
       WHERE status = 'published' AND lang = $1 AND doc_type = 'article'
       ORDER BY updated_at DESC
       LIMIT 3`,
      [docLang]
    );
    latestDocs = docsResult.rows;

    const changelogsResult = await pool.query(
      `SELECT id, title, slug, summary, version, lang, updated_at
       FROM site_docs
       WHERE status = 'published' AND lang = $1 AND doc_type = 'changelog'
       ORDER BY created_at DESC
       LIMIT 3`,
      [docLang]
    );
    latestChangelogs = changelogsResult.rows;
  } catch (err) {
    console.error('[homepage] Failed to fetch resources:', err);
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/30">
      <main className="flex-1">
        <Hero isLoggedIn={isLoggedIn} locale={loc} />
        
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent pointer-events-none" />
          <BentoFeatures locale={loc} />
          <Showcase locale={loc} />
          <Resources 
            locale={loc} 
            latestDocs={latestDocs} 
            latestChangelogs={latestChangelogs} 
          />
        </div>
      </main>
      <Footer locale={loc} />
    </div>
  );
}
