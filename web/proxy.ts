import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * oMyTree Proxy (Next.js 16 convention — replaces middleware.ts)
 *
 * Responsibilities:
 * 1. Block stale Server-Action requests.
 * 2. i18n locale detection & redirect for marketing pages:
 *    - Chinese-language users → 302 redirect to /zh-Hans-CN/…
 *    - English (default) → pass through, no URL prefix.
 *    - /zh-Hans-CN/… URLs → pass through, persist cookie.
 *    - Non-marketing paths (/app, /api, /auth, …) → skip locale logic.
 */

// -- i18n Constants ----------------------------------------------------------

const VALID_LOCALES = ['en', 'zh-Hans-CN'] as const;
const DEFAULT_LOCALE = 'en';
const LOCALE_COOKIE = 'locale';

/** Paths that should NOT receive locale treatment */
const SKIP_PREFIXES = [
  '/app',
  '/api',
  '/auth',
  '/admin',
  '/share',
  '/tree',
  '/_next',
  '/static',
  '/images',
  '/fonts',
  '/favicon',
];

// -- Helpers -----------------------------------------------------------------

function isSkippedPath(pathname: string): boolean {
  if (/\.\w{2,5}$/.test(pathname)) return true;
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function getLocalePrefix(pathname: string): string | null {
  for (const locale of VALID_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const prefix = `/${locale}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return locale;
    }
  }
  return null;
}

function detectLocale(acceptLang: string | null): string {
  if (!acceptLang) return DEFAULT_LOCALE;
  const langs = acceptLang
    .split(',')
    .map((part) => {
      const [lang, qPart] = part.trim().split(';');
      const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1;
      return { lang: lang.trim().toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);

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

// -- Proxy -------------------------------------------------------------------

export function proxy(req: NextRequest) {
  // ─── 1. Block stale Server-Action requests ───────────────────────────
  const actionId = req.headers.get('next-action') ?? req.headers.get('Next-Action');
  if (actionId) {
    return NextResponse.json(
      {
        error: 'This action is no longer valid. Please refresh the page and try again.',
        code: 'stale_server_action',
      },
      { status: 409 }
    );
  }

  // ─── 2. i18n locale routing for marketing pages ──────────────────────
  const { pathname } = req.nextUrl;

  // Skip non-marketing paths entirely
  if (isSkippedPath(pathname)) {
    return NextResponse.next();
  }

  // Already has locale prefix → pass through, persist cookie & header
  const existingLocale = getLocalePrefix(pathname);
  if (existingLocale) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-site-locale', existingLocale);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(LOCALE_COOKIE, existingLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  // Bare marketing path — determine preferred locale
  // a. Cookie first (returning visitor)
  let preferred = req.cookies.get(LOCALE_COOKIE)?.value;
  if (!preferred || !(VALID_LOCALES as readonly string[]).includes(preferred)) {
    // b. Accept-Language header
    preferred = detectLocale(req.headers.get('accept-language'));
  }

  // If Chinese → redirect to locale-prefixed URL
  if (preferred === 'zh-Hans-CN') {
    const target = pathname === '/' ? '/zh-Hans-CN' : `/zh-Hans-CN${pathname}`;
    const url = req.nextUrl.clone();
    url.pathname = target;
    const response = NextResponse.redirect(url, 302);
    response.cookies.set(LOCALE_COOKIE, 'zh-Hans-CN', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  // English (default) → pass through with header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-site-locale', DEFAULT_LOCALE);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
