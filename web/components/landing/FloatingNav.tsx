"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { mt } from "@/lib/site-i18n/marketing";
import { isValidLocale, localePath, extractLocaleFromPath, type SiteLocale } from "@/lib/site-i18n/locale-utils";

interface FloatingNavProps {
  isLoggedIn?: boolean;
  locale?: SiteLocale;
}

export function FloatingNav({ isLoggedIn = false, locale: propLocale }: FloatingNavProps) {
  const pathname = usePathname();

  function getCookieLocale(): SiteLocale | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (!cookie.startsWith("locale=")) continue;
      const val = cookie.slice("locale=".length);
      if (isValidLocale(val)) return val;
      return null;
    }
    return null;
  }
  
  // URL locale prefix takes top priority (user explicitly navigated to /zh-Hans-CN/...);
  // then server-provided prop; then cookie; then default.
  const localeFromUrl = extractLocaleFromPath(pathname);
  const locale: SiteLocale =
    (localeFromUrl !== "en" ? localeFromUrl : null) ??
    propLocale ??
    getCookieLocale() ??
    "en";
  
  // Hide nav on app and admin routes
  const isAppRoute = pathname.startsWith("/app") || pathname.startsWith("/admin");
  if (isAppRoute) return null;

  const navLinks = [
    { name: mt(locale, 'nav_docs'), href: localePath(locale, '/docs') },
    { name: mt(locale, 'nav_changelog'), href: localePath(locale, '/changelog') },
    { name: mt(locale, 'nav_pricing'), href: localePath(locale, '/pricing') },
    { name: mt(locale, 'nav_about'), href: localePath(locale, '/about') },
  ];

  return (
    <header className="fixed top-4 sm:top-6 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none">
      <nav 
        className="flex items-center gap-3 sm:gap-6 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white/70 dark:bg-slate-900/70 border border-white/30 dark:border-white/10 shadow-xl shadow-black/10 dark:shadow-black/30 transition-all duration-300 pointer-events-auto"
        style={{ 
          backdropFilter: 'blur(24px) saturate(120%)',
          WebkitBackdropFilter: 'blur(24px) saturate(120%)'
        }}
      >
        {/* Logo */}
        <Link href={localePath(locale, "/")} className="flex items-center gap-2">
          <img
            src="/images/logo.png"
            alt="oMyTree"
            className="h-7 w-auto select-none -mt-1"
            draggable={false}
          />
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-5 text-sm font-medium ml-4">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`transition-colors ${
                  isActive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 ml-2 sm:ml-4">
          <ThemeToggle />
          <Link
            href={isLoggedIn ? "/app" : "/auth/register?next=/app"}
            className="inline-flex items-center justify-center px-4 sm:px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all duration-300"
          >
            {isLoggedIn ? mt(locale, 'nav_open_app') : mt(locale, 'nav_start')}
          </Link>
        </div>
      </nav>
    </header>
  );
}
