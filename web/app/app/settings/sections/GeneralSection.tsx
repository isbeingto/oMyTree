'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useSession } from 'next-auth/react';
import { t, type Lang } from '@/lib/i18n';
import { Sun, Moon, Monitor } from 'lucide-react';
import { updateUserPreferences } from '../hooks/useSettingsApi';

interface GeneralSectionProps {
  lang: Lang;
  preferredLanguage: string;
}

export function GeneralSection({ lang, preferredLanguage: initialLang }: GeneralSectionProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { update: updateSession } = useSession();
  const [preferredLanguage, setPreferredLanguage] = useState(initialLang);
  const saveLanguageMutation = useMutation({
    mutationFn: async () => {
      await updateUserPreferences({ preferred_language: preferredLanguage });
    },
  });
  const savingLang = saveLanguageMutation.isPending;

  const handleSaveLanguage = async () => {
    try {
      await saveLanguageMutation.mutateAsync();

      // 关键：NextAuth 的 session 在客户端可能有缓存/轮询间隔。
      // 这里主动触发一次 session 刷新，确保全局 lang 立即一致。
      try {
        await updateSession();
      } catch (e) {
        console.warn('[settings] failed to update session after language change', e);
      }

      // 显示成功提示，但不刷新页面
      // router.refresh() 会导致页面重新加载，用户体验不好
      toast({ 
        title: t(lang, 'settings_language_updated'), 
        description: t(lang, 'settings_language_updated_desc'),
        duration: 2000,
      });
      // 延迟调用刷新，让用户看到成功提示
      setTimeout(() => {
        router.refresh();
      }, 500);
    } catch (err) {
      console.error(err);
      toast({
        title: t(lang, 'settings_language_failed'),
        description: t(lang, 'settings_language_failed_desc'),
        variant: 'destructive',
      });
    }
  };

  const themeOptions = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <div className="space-y-5">
      {/* Theme Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(lang, 'settings_theme')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t(lang, 'settings_theme_desc')}</p>
        </div>
        
        {/* Segmented Control */}
        <div className="inline-flex rounded-full bg-slate-100/80 dark:bg-slate-800/80 p-1 gap-0.5 md:gap-1">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex items-center gap-0.5 md:gap-1.5 px-2 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-all ${
                theme === value
                  ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Language Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{t(lang, 'settings_language')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t(lang, 'settings_language_desc')}</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 max-w-xs">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 block">
              {t(lang, 'settings_language_label')}
            </Label>
            <select
              className="w-full rounded-xl glass-field px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </div>
          
          <button
            onClick={handleSaveLanguage}
            disabled={savingLang}
            className="rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 shadow-md shadow-emerald-500/30 transition-all"
          >
            {savingLang ? t(lang, 'settings_language_saving') : t(lang, 'settings_language_save')}
          </button>
        </div>
      </div>
    </div>
  );
}
