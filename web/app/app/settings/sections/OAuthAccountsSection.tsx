'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { type Lang, t } from '@/lib/i18n';
import { Loader2, Mail, Github, Trash2, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { signIn } from 'next-auth/react';
import {
  disconnectOAuthAccount,
  listOAuthAccounts,
  settingsKeys,
  type OAuthAccount,
} from '../hooks/useSettingsApi';

interface OAuthAccountsSectionProps {
  lang: Lang;
  userEmail?: string | null;
}

const PROVIDER_NAMES: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
  google: {
    name: 'Google',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    color: 'text-red-600',
  },
  github: {
    name: 'GitHub',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    color: 'text-slate-900 dark:text-slate-100',
  },
};

export function OAuthAccountsSection({ lang, userEmail }: OAuthAccountsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: settingsKeys.oauthAccounts(),
    queryFn: async () => {
      const data = await listOAuthAccounts();
      return data.accounts || [];
    },
    staleTime: 30_000,
  });
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      await disconnectOAuthAccount(provider);
      return provider;
    },
    onSuccess: (provider) => {
      queryClient.setQueryData<OAuthAccount[]>(settingsKeys.oauthAccounts(), (prev) =>
        Array.isArray(prev) ? prev.filter((item) => item.provider !== provider) : prev
      );
    },
  });
  const accounts = accountsQuery.data || [];
  const loading = accountsQuery.isLoading;
  const disconnecting = disconnectMutation.isPending ? disconnectMutation.variables : null;

  useEffect(() => {
    if (!accountsQuery.error) return;
    console.error('Error fetching OAuth accounts:', accountsQuery.error);
    toast({
      title: t(lang, 'toast_oauth_load_failed'),
      description: t(lang, 'toast_oauth_load_failed_desc'),
      variant: 'destructive',
    });
  }, [accountsQuery.error, lang, toast]);

  const handleDisconnect = async (provider: string) => {
    if (!confirm(
      t(lang, 'settings_oauth_disconnect_confirm').replace('{provider}', PROVIDER_NAMES[provider]?.name || provider)
    )) {
      return;
    }

    try {
      await disconnectMutation.mutateAsync(provider);
      toast({
        title: t(lang, 'toast_oauth_disconnected'),
        description: `${PROVIDER_NAMES[provider]?.name} ${t(lang, 'toast_oauth_disconnected_desc')}`,
      });
    } catch (error) {
      console.error('Error disconnecting account:', error);
      toast({
        title: t(lang, 'toast_oauth_disconnect_failed'),
        description: error instanceof Error ? error.message : t(lang, 'toast_oauth_disconnect_failed_desc'),
        variant: 'destructive',
      });
    }
  };

  const handleConnect = async (provider: 'google' | 'github') => {
    try {
      await signIn(provider, { redirect: false });
    } catch (error) {
      console.error('Error connecting account:', error);
      toast({
        title: t(lang, 'toast_oauth_connect_failed'),
        description: t(lang, 'toast_oauth_connect_failed_desc'),
        variant: 'destructive',
      });
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5 flex items-center justify-center min-h-[120px]">
        <Spinner size="md" />
      </div>
    );
  }

  const availableProviders = ['google', 'github'].filter(
    p => !accounts.some(a => a.provider === p)
  );

  return (
    <div className="space-y-4">
      {/* Connected Accounts */}
      <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
          {t(lang, 'settings_oauth_connected_accounts')}
        </h3>

        {accounts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'settings_oauth_empty')}
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map(account => {
              const provider = PROVIDER_NAMES[account.provider];
              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`flex-shrink-0 ${provider?.color}`}>
                      {provider?.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {provider?.name}
                      </p>
                      {account.expiresAt && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {t(lang, 'settings_oauth_expires_on')}{formatDate(account.expiresAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(account.provider)}
                    disabled={disconnecting === account.provider}
                    className="flex-shrink-0 ml-2 p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all"
                    title={t(lang, 'settings_oauth_disconnect')}
                  >
                    {disconnecting === account.provider ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Providers */}
      {availableProviders.length > 0 && (
        <div className="rounded-2xl glass-panel px-5 py-4 shadow-sm shadow-emerald-500/5">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">
            {t(lang, 'settings_oauth_add_account')}
          </h3>

          <div className="space-y-2">
            {availableProviders.map(provider => {
              const providerInfo = PROVIDER_NAMES[provider];
              return (
                <button
                  key={provider}
                  onClick={() => handleConnect(provider as 'google' | 'github')}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 text-sm font-medium transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <div className={`flex items-center gap-2 ${providerInfo?.color}`}>
                    {providerInfo?.icon}
                    <span>
                      {t(lang, 'settings_oauth_connect_with')}{providerInfo?.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
