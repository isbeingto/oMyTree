"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, Calendar, Tag, ArrowRight, Sparkles, ChevronRight } from "lucide-react";
import { localePath, type SiteLocale } from "@/lib/site-i18n/locale-utils";
import { mt } from "@/lib/site-i18n/marketing";

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

/** Map SiteLocale → Intl locale string for date formatting */
function dateLocale(locale?: SiteLocale): string {
  return locale === "zh-Hans-CN" ? "zh-CN" : "en-US";
}

function formatShortDate(dateString: string, locale?: SiteLocale): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(dateLocale(locale), { month: "short", day: "numeric" }).toUpperCase();
}

/* ── Animated timeline dot ─── */
function TimelineDot({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.1 + index * 0.04, type: "spring", stiffness: 300, damping: 20 }}
      className="relative z-10 flex items-center justify-center"
    >
      {/* Outer pulse ring */}
      <span className="absolute h-5 w-5 rounded-full bg-emerald-400/20 dark:bg-emerald-500/15 animate-ping" style={{ animationDuration: '3s' }} />
      {/* Inner dot */}
      <span className="relative h-3 w-3 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30" />
    </motion.div>
  );
}

/* ── Version badge ─── */
function VersionBadge({ version }: { version: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/40 px-2.5 py-0.5 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300 backdrop-blur-sm"
    >
      <Tag className="h-3 w-3" />
      {version}
    </motion.span>
  );
}

/* ── Single changelog entry card ─── */
function ChangelogCard({ entry, index, locale }: { entry: ChangelogEntry; index: number; locale?: SiteLocale }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ delay: 0.05 + index * 0.04, duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      <Link
        href={localePath(locale ?? "en", `/changelog/${entry.slug}`)}
        className="group relative block"
      >
        {/* Card */}
        <div className="relative rounded-xl border border-white/10 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] backdrop-blur-md px-6 py-5 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 dark:hover:shadow-emerald-500/10 hover:border-emerald-500/30 dark:hover:border-emerald-400/20 transition-all duration-500 hover:-translate-y-0.5">
          {/* Subtle gradient hover effect */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/0 via-transparent to-emerald-500/0 group-hover:from-emerald-500/[0.03] group-hover:to-emerald-400/[0.02] transition-all duration-500 pointer-events-none" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Meta row: date + version */}
              <div className="flex items-center gap-3 mb-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-500 tracking-wide">
                  <Calendar className="h-3 w-3" />
                  {formatShortDate(entry.created_at, locale)}
                </span>
                {entry.version && <VersionBadge version={entry.version} />}
              </div>

              {/* Title */}
              <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300 line-clamp-2">
                {entry.title}
              </h3>

              {/* Summary */}
              {entry.summary && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {entry.summary}
                </p>
              )}
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 mt-6">
              <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-hover:translate-x-1 transition-all duration-300" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Month group header ─── */
function MonthHeader({ label, index }: { label: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="relative flex items-center gap-4 py-2"
    >
      {/* Glowing dot for month */}
      <div className="relative">
        <span className="absolute -inset-1 rounded-full bg-emerald-500/20 blur-sm" />
        <span className="relative block h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
        {label}
      </h2>
      <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/20 to-transparent" />
    </motion.div>
  );
}

/* ── Hero header ─── */
function ChangelogHero({ locale }: { locale?: SiteLocale }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="text-center space-y-6 mb-16"
    >
      {/* Animated badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 dark:bg-emerald-900/30 border border-emerald-200/50 dark:border-emerald-700/30 px-4 py-1.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5" />
          {mt(locale, 'changelog_badge')}
        </span>
      </motion.div>

      {/* Title with gradient */}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
        {`${mt(locale, 'changelog_title_1')}${locale === 'zh-Hans-CN' ? '' : ' '}${mt(locale, 'changelog_title_2')}`}
      </h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto"
      >
        {mt(locale, 'changelog_subtitle')}
      </motion.p>

      {/* Decorative line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
        className="mx-auto h-px w-32 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"
      />
    </motion.header>
  );
}

/* ── Empty state ─── */
function EmptyState({ locale }: { locale?: SiteLocale }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-dashed border-slate-300/50 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm px-8 py-20 text-center"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        <Rocket className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600" />
      </motion.div>
      <h2 className="mt-6 text-lg font-medium text-slate-900 dark:text-white">
        {mt(locale, 'changelog_empty_title')}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
        {mt(locale, 'changelog_empty_desc')}
      </p>
    </motion.div>
  );
}

/* ── Main timeline component ─── */
export function ChangelogTimeline({
  monthGroups,
  hasEntries,
  locale,
}: {
  monthGroups: MonthGroup[];
  hasEntries: boolean;
  locale?: SiteLocale;
}) {
  return (
    <>
      <ChangelogHero locale={locale} />

      {hasEntries ? (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[5px] top-0 bottom-0 w-px">
            <motion.div
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full w-full bg-gradient-to-b from-emerald-500/40 via-emerald-500/20 to-transparent origin-top"
            />
          </div>

          <div className="space-y-12 pl-8">
            {monthGroups.map((group, groupIndex) => (
              <div key={group.label}>
                <MonthHeader label={group.label} index={groupIndex} />
                <div className="mt-4 space-y-4">
                  {group.entries.map((entry, entryIndex) => (
                    <div key={entry.id} className="relative">
                      {/* Timeline dot positioned on the line */}
                      <div className="absolute -left-8 top-6 flex items-center justify-center" style={{ left: "-29px" }}>
                        <TimelineDot index={entryIndex} />
                      </div>
                      <ChangelogCard entry={entry} index={entryIndex} locale={locale} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState locale={locale} />
      )}

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap justify-center gap-4 pt-12 mt-8"
      >
        <Link
          href={localePath(locale ?? "en", "/docs")}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/50 dark:border-white/10 rounded-full transition-all duration-300"
        >
          {mt(locale, 'changelog_read_docs')}
        </Link>
        <Link
          href="/app"
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-full shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
        >
          {mt(locale, 'changelog_try_app')}
        </Link>
      </motion.div>
    </>
  );
}
