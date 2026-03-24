"use client";

import React from "react";
import { Footer } from "@/components/landing/Footer";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";

interface MarketingLayoutProps {
  children: React.ReactNode;
  /** Which nav item should be highlighted (used by FloatingNav in root layout) */
  activeNav?: "features" | "docs" | "about" | "pricing" | "changelog";
  locale?: SiteLocale;
}

/**
 * Marketing layout shell with dot grid background and footer.
 * The floating nav is rendered by the root layout (FloatingNav).
 */
export function MarketingLayout({ children, activeNav, locale = 'en' }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-100 font-sans">
      {/* Main content with background */}
      <main className="flex-1 relative pt-24 sm:pt-28">
        {/* Radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_20%,_var(--tw-gradient-stops))] from-emerald-400/10 via-transparent to-transparent dark:from-emerald-500/8 pointer-events-none" />

        {/* Content container */}
        <div className="relative z-10 container mx-auto px-4 md:px-6 pb-16">
          {children}
        </div>
      </main>

      {/* Footer */}
      <Footer locale={locale} />
    </div>
  );
}
