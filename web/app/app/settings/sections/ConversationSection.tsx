'use client';

import { t, type Lang } from '@/lib/i18n';
import { Sparkles } from 'lucide-react';

interface ConversationSectionProps {
  lang: Lang;
}

export function ConversationSection({ lang }: ConversationSectionProps) {
  return (
    <div className="space-y-5">
      {/* Coming Soon Card - Compact */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80">
            <Sparkles className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {lang === 'zh-CN' ? '功能即将上线' : 'Feature coming soon'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'zh-CN' 
                ? '我们正在为对话界面开发更多自定义选项，包括树画布偏好和聊天气泡样式。'
                : 'We\'re working on more customization options for conversation UI, including tree canvas preferences and chat bubble styles.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
