/**
 * Locale utilities for oMyTree public/marketing site i18n.
 *
 * Two supported locales:
 *   - 'en'          → English (default, no URL prefix)
 *   - 'zh-Hans-CN'  → Simplified Chinese (URL prefix /zh-Hans-CN/)
 *
 * URL convention mirrors OpenAI:
 *   https://www.omytree.com/              → English
 *   https://www.omytree.com/zh-Hans-CN/   → Simplified Chinese
 */

/** Site-level locale (URL-visible) */
export type SiteLocale = 'en' | 'zh-Hans-CN';

/** All valid site locales */
export const SITE_LOCALES: SiteLocale[] = ['en', 'zh-Hans-CN'];

/** Default locale (English) — no URL prefix */
export const DEFAULT_LOCALE: SiteLocale = 'en';

/** Cookie name that persists the preferred locale */
export const LOCALE_COOKIE = 'locale';

/** Validate whether a string is a supported SiteLocale */
export function isValidLocale(v: string): v is SiteLocale {
  return (SITE_LOCALES as string[]).includes(v);
}

/**
 * Map a SiteLocale to the internal i18n lang key used by the existing
 * `lib/i18n.ts` translation system (which uses 'en' | 'zh-CN').
 */
export function siteLocaleToLang(locale: SiteLocale): 'en' | 'zh-CN' {
  return locale === 'zh-Hans-CN' ? 'zh-CN' : 'en';
}

/**
 * Map the internal i18n lang key to SiteLocale for URL purposes.
 */
export function langToSiteLocale(lang: string): SiteLocale {
  return lang === 'zh-CN' ? 'zh-Hans-CN' : 'en';
}

/**
 * Build a locale-aware path for marketing pages.
 *
 *   localePath('en', '/docs')         → '/docs'
 *   localePath('zh-Hans-CN', '/docs') → '/zh-Hans-CN/docs'
 *   localePath('zh-Hans-CN', '/')     → '/zh-Hans-CN'
 */
export function localePath(locale: SiteLocale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  if (path === '/') return `/${locale}`;
  return `/${locale}${path}`;
}

/**
 * Check whether the given path is a marketing/public page that should
 * be locale-routed.  Non-marketing paths (app, auth, admin, api, …)
 * are excluded.
 */
export function isMarketingPath(pathname: string): boolean {
  // Strip locale prefix if present
  const stripped = stripLocalePrefix(pathname);

  // Exact marketing pages
  const marketingPaths = ['/', '/about', '/docs', '/changelog', '/blog', '/pricing', '/privacy', '/terms'];
  if (marketingPaths.includes(stripped)) return true;

  // /docs/[slug] pattern
  if (stripped.startsWith('/docs/')) return true;

  // /changelog/[slug] pattern
  if (stripped.startsWith('/changelog/')) return true;

  // blog, pricing sub-paths
  if (stripped.startsWith('/blog/')) return true;

  return false;
}

/**
 * Strip the locale prefix from a pathname, if present.
 *   '/zh-Hans-CN/docs' → '/docs'
 *   '/docs'            → '/docs'
 *   '/zh-Hans-CN'      → '/'
 */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of SITE_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length);
    }
  }
  return pathname;
}

/**
 * Extract locale from pathname. Returns DEFAULT_LOCALE if no locale prefix found.
 *   '/zh-Hans-CN/docs' → 'zh-Hans-CN'
 *   '/docs'            → 'en'
 */
export function extractLocaleFromPath(pathname: string): SiteLocale {
  for (const locale of SITE_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Detect preferred locale from the Accept-Language header value.
 *
 * Returns 'zh-Hans-CN' if any Chinese variant (zh, zh-CN, zh-Hans, zh-Hans-CN, etc.)
 * is present among the preferred languages.  Otherwise returns 'en'.
 */
export function detectLocaleFromAcceptLanguage(acceptLang: string | null): SiteLocale {
  if (!acceptLang) return DEFAULT_LOCALE;

  // Parse accept-language header into weighted list
  const langs = acceptLang
    .split(',')
    .map((part) => {
      const [lang, qPart] = part.trim().split(';');
      const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1;
      return { lang: lang.trim().toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);

  // Check for any Chinese variant
  for (const { lang } of langs) {
    if (
      lang === 'zh' ||
      lang === 'zh-cn' ||
      lang === 'zh-hans' ||
      lang === 'zh-hans-cn' ||
      lang.startsWith('zh-hans') ||
      lang.startsWith('zh-cn')
    ) {
      return 'zh-Hans-CN';
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Map the DB `lang` column value for docs queries.
 *   'zh-Hans-CN' → 'zh-CN'
 *   'en'         → 'en'
 */
export function localeToDocLang(locale: SiteLocale): string {
  return locale === 'zh-Hans-CN' ? 'zh-CN' : 'en';
}
