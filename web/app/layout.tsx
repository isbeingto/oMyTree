import "../styles/globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import type { Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_SC } from "next/font/google";
import { cookies, headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProvider } from "@/components/session-provider";
import { Toaster } from "@/components/ui/toaster";
import { RouteTransition } from "@/components/RouteTransition";
import { FloatingNav } from "@/components/landing/FloatingNav";
import { getSafeServerSession } from "@/lib/auth";
import { normalizeLang } from "@/lib/i18n";
import {
  detectLocaleFromAcceptLanguage,
  isValidLocale,
  type SiteLocale,
} from "@/lib/site-i18n";

const appLatinFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const appCjkFont = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  variable: "--font-noto-sc",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: "oMyTree - The AI Workspace for Deep Research",
    template: "%s | oMyTree",
  },
  description:
    "Escape the chaos of linear chat. oMyTree is a tree-based AI canvas designed for researchers and deep thinkers to explore, annotate, and synthesize complex ideas.",
  keywords: [
    "omytree",
    "AI workspace",
    "deep research",
    "knowledge tree",
    "AI canvas",
    "Zettelkasten",
    "PKM",
    "personal knowledge management",
    "AI chat",
    "knowledge tree",
    "conversation tree",
    "prompt engineering IDE",
    "multi-model AI",
    "chat visualization",
    "BYOK",
    "GPT",
    "Claude",
    "Gemini",
  ],
  authors: [{ name: "oMyTree Team" }],
  creator: "oMyTree",
  publisher: "oMyTree",
  metadataBase: new URL("https://www.omytree.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.omytree.com",
    siteName: "oMyTree",
    title: "oMyTree - The AI Workspace for Deep Research",
    description:
      "Escape the chaos of linear chat. oMyTree is a tree-based AI canvas designed for researchers and deep thinkers to explore, annotate, and synthesize complex ideas.",
  },
  alternates: {
    languages: {
      en: "https://www.omytree.com",
      "zh-Hans-CN": "https://www.omytree.com/zh-Hans-CN",
    },
  },
  twitter: {
    card: "summary_large_image",
    site: "@omytree",
    creator: "@omytree",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  const session = await getSafeServerSession();
  const isLoggedIn = Boolean(session?.user?.id);

  // Determine <html lang>:
  // - Logged-in user → use their stored preference
  // - Anonymous visitors → detect from URL path, proxy header, cookie, or Accept-Language
  let lang: string;
  let siteLocale: SiteLocale;

  if (session?.user?.id) {
    lang = normalizeLang((session?.user as any)?.preferred_language);
    siteLocale = lang === "zh-CN" ? "zh-Hans-CN" : "en";
  } else {
    const headersList = await headers();
    const headerLocale = headersList.get("x-site-locale");
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("locale")?.value;

    // Best signal: URL path prefix (e.g. /zh-Hans-CN/...)
    const pathname = headersList.get("x-next-url") || headersList.get("x-invoke-path") || "";
    const urlLocale = pathname.startsWith("/zh-Hans-CN") ? "zh-Hans-CN" : null;

    if (urlLocale) {
      siteLocale = urlLocale as SiteLocale;
    } else if (headerLocale && isValidLocale(headerLocale)) {
      siteLocale = headerLocale as SiteLocale;
    } else if (cookieLocale && isValidLocale(cookieLocale)) {
      siteLocale = cookieLocale as SiteLocale;
    } else {
      siteLocale = detectLocaleFromAcceptLanguage(headersList.get("accept-language"));
    }

    lang = siteLocale === "zh-Hans-CN" ? "zh-CN" : "en";
  }

  // Use full BCP 47 locale tag for <html lang>; more precise for SEO / a11y
  const htmlLang = siteLocale === "zh-Hans-CN" ? "zh-Hans-CN" : "en";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/api/favicon" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if ('ontouchstart' in window) {
                  document.addEventListener('touchstart', function() {
                    document.body.classList.add('touching');
                  }, { passive: true });
                  document.addEventListener('touchend', function() {
                    setTimeout(function() {
                      document.body.classList.remove('touching');
                    }, 300);
                  }, { passive: true });
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${appLatinFont.variable} ${appCjkFont.variable} min-h-screen bg-background text-foreground antialiased relative`}
      >
        <SessionProvider session={session}>
          <ThemeProvider>
            <FloatingNav isLoggedIn={isLoggedIn} locale={siteLocale} />
            
            <RouteTransition>{children}</RouteTransition>
            <Toaster />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
