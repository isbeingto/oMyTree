"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Twitter, Mail, Github } from "lucide-react";
import { mt } from "@/lib/site-i18n/marketing";
import { localePath, type SiteLocale } from "@/lib/site-i18n/locale-utils";

export function Footer({ locale = 'en' as SiteLocale }: { locale?: SiteLocale }) {
  const [emailMenuOpen, setEmailMenuOpen] = useState(false);
  const emailMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emailMenuRef.current && !emailMenuRef.current.contains(event.target as Node)) {
        setEmailMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <footer className="relative pt-16 pb-8">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      <div className="container mx-auto px-4 md:px-6">
        {/* Main content */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
          {/* Logo & tagline */}
          <div className="text-center md:text-left">
            <Link
              href={localePath(locale, '/')}
              className="inline-flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white mb-2"
            >
              <img
                src="/images/logo.png"
                alt="oMyTree"
                className="h-8 w-auto select-none"
                draggable={false}
              />
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              {mt(locale, 'footer_tagline')}
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm">
            <Link
              href={localePath(locale, '/docs')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_docs')}
            </Link>
            <Link
              href={localePath(locale, '/changelog')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_changelog')}
            </Link>
            <Link
              href={localePath(locale, '/about')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_about')}
            </Link>
            <Link
              href={localePath(locale, '/pricing')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_pricing')}
            </Link>
            <Link
              href={localePath(locale, '/privacy')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_privacy')}
            </Link>
            <Link
              href={localePath(locale, '/terms')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_terms')}
            </Link>
            <Link
              href={localePath(locale, '/refund')}
              className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {mt(locale, 'footer_refund')}
            </Link>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/isbeingto/oMyTree"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
            <a
              href="https://x.com/omytree"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              aria-label="X (Twitter)"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a
              href="https://www.producthunt.com/products/omytree?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-omytree"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              aria-label="Product Hunt"
            >
              <img
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1048034&theme=neutral&t=1765352121610"
                alt="oMyTree - Turn AI chats into structured knowledge trees. | Product Hunt"
                style={{ width: '250px', height: '54px' }}
                width="250"
                height="54"
              />
            </a>
            <div className="relative" ref={emailMenuRef}>
              <button
                onClick={() => setEmailMenuOpen(!emailMenuOpen)}
                className="p-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                aria-label="Email contacts"
              >
                <Mail className="w-5 h-5" />
              </button>
              {emailMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl glass-dropdown shadow-[0_8px_32px_rgba(15,23,42,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-2 z-50">
                  <a
                    href="mailto:isbeingto@gmail.com"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-14">Founder</span>
                    <span>isbeingto@gmail.com</span>
                  </a>
                  <a
                    href="mailto:contact@omytree.com"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-14">Contact</span>
                    <span>contact@omytree.com</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-200 dark:bg-white/10 mb-6" />

        {/* Bottom row */}
        <div className="flex items-center justify-center">
          {/* Copyright */}
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {mt(locale, 'footer_rights').replace('{year}', String(new Date().getFullYear()))}
          </p>
        </div>
      </div>
    </footer>
  );
}
