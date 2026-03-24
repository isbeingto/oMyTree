'use client';

import React from 'react';
import Link from 'next/link';
import { motion, Variants } from 'framer-motion';
import { BookOpen, Zap, ArrowRight, FileText, Calendar } from 'lucide-react';
import { mt } from '@/lib/site-i18n/marketing';
import { type SiteLocale, localePath } from '@/lib/site-i18n/locale-utils';

interface ResourceItem {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  updated_at: string;
  version?: string | null;
}

interface ResourcesProps {
  locale: SiteLocale;
  latestDocs: ResourceItem[];
  latestChangelogs: ResourceItem[];
}

function formatResourceDate(updatedAt: string, locale: SiteLocale) {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return locale === 'zh-Hans-CN' ? `${y}/${m}/${day}` : `${m}/${day}/${y}`;
}

export function Resources({ locale, latestDocs, latestChangelogs }: ResourcesProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {mt(locale, 'resources_title')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {mt(locale, 'resources_subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Docs Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {mt(locale, 'latest_docs_title')}
                </h3>
              </div>
              <Link 
                href={localePath(locale, '/docs')}
                className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 group"
              >
                {mt(locale, 'latest_docs_view_all')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="space-y-4">
              {latestDocs.map((doc) => (
                <motion.div key={doc.id} variants={itemVariants}>
                  <Link
                    href={localePath(locale, `/docs/${doc.slug}`)}
                    className="block p-5 rounded-2xl glass-panel hover:bg-white dark:hover:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all duration-300 group"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {doc.title}
                        </h4>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                          {doc.summary || (locale === 'zh-Hans-CN' ? '阅读完整指南...' : 'Read the full guide...')}
                        </p>
                      </div>
                      <FileText className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
              {latestDocs.length === 0 && (
                 <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-slate-400">
                    {mt(locale, 'docs_empty_title')}
                 </div>
              )}
            </div>
          </motion.div>

          {/* Changelog Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                   {mt(locale, 'nav_changelog')}
                </h3>
              </div>
              <Link 
                href={localePath(locale, '/changelog')}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 group"
              >
                {mt(locale, 'resources_view_all_updates')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="space-y-4">
              {latestChangelogs.map((log) => (
                <motion.div key={log.id} variants={itemVariants}>
                  <Link
                    href={localePath(locale, `/changelog/${log.slug}`)}
                    className="block p-5 rounded-2xl glass-panel hover:bg-white dark:hover:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all duration-300 group"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {log.version && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                              v{log.version}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatResourceDate(log.updated_at, locale)}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {log.title}
                        </h4>
                      </div>
                      <Zap className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              ))}
              {latestChangelogs.length === 0 && (
                 <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-slate-400">
                    {mt(locale, 'changelog_empty_title')}
                 </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* Decorative background element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none overflow-hidden opacity-20">
         <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[128px] rounded-full" />
         <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 blur-[128px] rounded-full" />
      </div>
    </section>
  );
}
