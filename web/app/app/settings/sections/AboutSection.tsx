'use client';

import { t, type Lang } from '@/lib/i18n';
import { Github, Mail, ExternalLink, Leaf, Heart } from 'lucide-react';

interface AboutSectionProps {
  lang: Lang;
}

export function AboutSection({ lang }: AboutSectionProps) {
  return (
    <div className="space-y-5">
      {/* App Info Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <Leaf className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">oMyTree</h3>
            <span className="text-xs text-slate-500">{t(lang, 'settings_about_version')}: 0.1.0</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {lang === 'zh-CN'
            ? 'oMyTree 是一个树状思维工具，帮助你组织和探索想法。'
            : 'oMyTree is a tree-based thinking tool that helps you organize and explore ideas.'}
        </p>
      </div>

      {/* Links Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">{t(lang, 'settings_about_links')}</h3>
        <div className="space-y-2">
          <a
            href="https://github.com/omytree/omytree"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
          <a
            href="mailto:support@omytree.com"
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <Mail className="h-4 w-4" />
            <span>{t(lang, 'settings_about_contact')}</span>
          </a>
        </div>
      </div>

      {/* Made with love */}
      <div className="text-center pt-2">
        <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
          Made with <Heart className="h-3 w-3 text-red-400" /> in China
        </span>
      </div>
    </div>
  );
}
