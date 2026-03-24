'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { t, type Lang } from '@/lib/i18n';
import { Loader2 } from 'lucide-react';
import { OAuthAccountsSection } from './OAuthAccountsSection';
import { updateUserPreferences, usePasswordStatusQuery } from '../hooks/useSettingsApi';

interface AccountSectionProps {
  lang: Lang;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    created_at?: string | null;
  };
}

export function AccountSection({ lang, user }: AccountSectionProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(user.name || '');
  const [hasPassword, setHasPassword] = useState(true); // 默认假设有密码
  const passwordStatusQuery = usePasswordStatusQuery(Boolean(user.id));
  const checkingPassword = passwordStatusQuery.isLoading;
  const saveNameMutation = useMutation({
    mutationFn: async (nextName: string) => {
      await updateUserPreferences({ name: nextName });
    },
  });
  const savingName = saveNameMutation.isPending;

  // 检查用户是否有密码
  useEffect(() => {
    if (typeof passwordStatusQuery.data?.hasPassword === 'boolean') {
      setHasPassword(passwordStatusQuery.data.hasPassword);
    }
    if (passwordStatusQuery.error) {
      console.error('Failed to check password status:', passwordStatusQuery.error);
      setHasPassword(true);
    }
  }, [passwordStatusQuery.data?.hasPassword, passwordStatusQuery.error]);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    try {
      await saveNameMutation.mutateAsync(name.trim());
      toast({ 
        title: t(lang, 'toast_name_updated'),
        description: t(lang, 'toast_name_updated_desc'),
      });
      // 刷新会话以获取更新的 user.name
      // 使用短延迟避免 UI 闪烁
      setTimeout(() => {
        router.refresh();
      }, 300);
    } catch (err) {
      console.error(err);
      toast({
        title: t(lang, 'toast_update_failed'),
        description: t(lang, 'toast_update_failed_desc'),
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return t(lang, 'settings_coming_soon');
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-5">
      {/* Account Info Card */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5 flex flex-col gap-4">
        {/* Email (readonly) */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'settings_email')}</Label>
          <Input 
            readOnly 
            value={user.email || '—'} 
            className="bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-700/60 text-sm"
          />
        </div>

        {/* Name (editable) */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'settings_name')}</Label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(lang, 'settings_account_name_placeholder')}
              className="flex-1 border-slate-200/60 dark:border-slate-700/60 text-sm"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || name === user.name || !name.trim()}
              className="rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 shadow-md shadow-emerald-500/30 transition-all"
            >
              {savingName ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t(lang, 'settings_account_save')
              )}
            </button>
          </div>
        </div>

        {/* Member since */}
        <div className="space-y-1">
          <Label className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'settings_member_since')}</Label>
          <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(user.created_at)}</p>
        </div>
      </div>

      {/* OAuth Accounts Section */}
      <OAuthAccountsSection lang={lang} userEmail={user.email} />

      {/* Password Card - Dynamic based on hasPassword status */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {checkingPassword ? (
                t(lang, 'settings_account_checking')
              ) : hasPassword ? (
                t(lang, 'settings_account_change_password')
              ) : (
                t(lang, 'settings_account_set_password')
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {checkingPassword ? (
                t(lang, 'settings_account_loading')
              ) : hasPassword ? (
                t(lang, 'settings_account_change_password_desc')
              ) : (
                t(lang, 'settings_account_set_password_desc')
              )}
            </p>
          </div>
          <button
            onClick={() => {
              if (hasPassword) {
                window.location.href = '/auth/forgot-password';
              } else {
                window.location.href = '/auth/set-password';
              }
            }}
            disabled={checkingPassword}
            className="rounded-full glass-field text-slate-700 dark:text-slate-200 hover:bg-slate-50/40 dark:hover:bg-slate-700/30 disabled:opacity-50 text-sm font-medium px-4 py-2 transition-all"
          >
            {checkingPassword ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasPassword ? (
              t(lang, 'settings_account_change_password')
            ) : (
              t(lang, 'settings_account_set_password')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
