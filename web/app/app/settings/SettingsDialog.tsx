'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { t, normalizeLang, type Lang } from '@/lib/i18n';
import { useSession } from 'next-auth/react';
import { X, Settings, Key, User, CreditCard, Database, Info } from 'lucide-react';
import {
  GeneralSection,
  AccountSection,
  BillingSection,
  DataSection,
  AboutSection,
} from './sections';
import ModelsSettingsContent from './models/ModelsSettingsContent';
import { SharedTreesPanel } from './SharedTreesPanel';

type SettingsTab = 'general' | 'models' | 'account' | 'billing' | 'data' | 'about';

interface NavItem {
  id: SettingsTab;
  labelKey: 'settings_nav_general' | 'settings_nav_models' | 'settings_nav_account' | 'settings_nav_billing' | 'settings_nav_data' | 'settings_nav_about';
  icon: typeof Settings;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { id: 'general', labelKey: 'settings_nav_general', icon: Settings },
  { id: 'models', labelKey: 'settings_nav_models', icon: Key },
  { id: 'account', labelKey: 'settings_nav_account', icon: User },
  { id: 'billing', labelKey: 'settings_nav_billing', icon: CreditCard },
  { id: 'data', labelKey: 'settings_nav_data', icon: Database, comingSoon: true },
  { id: 'about', labelKey: 'settings_nav_about', icon: Info },
];

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Which tab to activate when the dialog opens */
  initialTab?: SettingsTab;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    preferred_language?: string | null;
    created_at?: string | null;
  };
};

export function SettingsDialog({ open, onOpenChange, initialTab, user }: SettingsDialogProps) {
  const { data: session } = useSession();
  const sessionPreferredLanguage = (session?.user as any)?.preferred_language as string | undefined;
  const effectivePreferredLanguage = sessionPreferredLanguage ?? user.preferred_language ?? 'en';
  const lang: Lang = normalizeLang(effectivePreferredLanguage);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isMobile, setIsMobile] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Set active tab when dialog opens: use initialTab if provided, otherwise 'general'
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab || 'general');
    }
  }, [open, initialTab]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleTabChange = (tab: SettingsTab) => {
    if (tab === activeTab) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTransitioning(false);
    }, 100);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSection lang={lang} preferredLanguage={effectivePreferredLanguage} />;
      case 'models':
        return <ModelsSettingsContent lang={lang} />;
      case 'account':
        return (
          <div className="space-y-5">
            <AccountSection lang={lang} user={user} />
            <SharedTreesPanel userId={user.id} lang={lang} />
          </div>
        );
      case 'billing':
        return <BillingSection lang={lang} userId={user.id} />;
      case 'data':
        return <DataSection lang={lang} userId={user.id} />;
      case 'about':
        return <AboutSection lang={lang} />;
      default:
        return null;
    }
  };

  const getSectionTitle = () => {
    const item = navItems.find(n => n.id === activeTab);
    return item ? t(lang, item.labelKey) : '';
  };

  const getSectionDesc = () => {
    const descKeys: Record<SettingsTab, string> = {
      general: 'settings_general_desc',
      models: 'models_subtitle',
      account: 'settings_account_desc',
      billing: 'settings_billing_desc',
      data: 'settings_data_desc',
      about: 'settings_about_desc',
    };
    return t(lang, descKeys[activeTab] as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        hideClose
        overlayClassName="glass-overlay"
        className={cn(
          "p-0 overflow-hidden gap-0",
          "rounded-3xl apple-glass",
          "shadow-[0_8px_60px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_60px_-12px_rgba(0,0,0,0.5)]",
          "ring-1 ring-black/5 dark:ring-white/5",
          // 响应式尺寸：小屏紧凑，大屏充分利用空间
          "w-[95vw] h-[90vh]",
          "md:w-[85vw] md:h-[85vh]",
          "lg:w-[75vw] lg:max-w-5xl",
          "xl:w-[70vw] xl:max-w-6xl"
        )}
      >
        {/* A11y: satisfy Radix Dialog requirement without changing UI */}
        <DialogTitle className="sr-only">{getSectionTitle()}</DialogTitle>
        <DialogDescription className="sr-only">{getSectionDesc()}</DialogDescription>

        {/* Background glow effect */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Custom close button (desktop only; mobile has dedicated button to avoid overlap with select) */}
        {!isMobile && (
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        )}

        <div className="relative flex h-full overflow-hidden">
          {/* Sidebar - Desktop */}
          {!isMobile && (
            <nav 
              className="w-52 flex-shrink-0 border-r border-white/10 dark:border-white/[0.06] bg-slate-50/30 dark:bg-slate-900/30 p-3 overflow-y-auto"
              data-scroll-hz="true"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="space-y-0.5">
                {navItems.map(({ id, labelKey, icon: Icon, comingSoon }) => (
                  <button
                    key={id}
                    onClick={() => handleTabChange(id)}
                    data-testid={`settings-tab-${id}`}
                    className={cn(
                      "w-full min-w-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                      activeTab === id
                        ? "bg-muted/80 text-foreground border border-border"
                        : "text-muted-foreground hover:bg-muted/60 border border-transparent"
                    )}
                  >
                    <Icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      activeTab === id ? "text-foreground" : "text-muted-foreground"
                    )} />
                    <span className="min-w-0 truncate font-medium">{t(lang, labelKey)}</span>
                    {comingSoon && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">
            {/* Mobile tab selector */}
            {isMobile && (
              <div className="border-b border-white/10 dark:border-white/[0.06] px-4 py-3 bg-slate-50/30 dark:bg-slate-900/30 flex items-center gap-3">
                <select
                  value={activeTab}
                  onChange={(e) => handleTabChange(e.target.value as SettingsTab)}
                  className="flex-1 min-w-0 rounded-xl glass-field px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {navItems.map(({ id, labelKey, comingSoon }) => (
                    <option key={id} value={id} data-testid={`settings-tab-${id}`}>
                      {t(lang, labelKey)}{comingSoon ? ' (Soon)' : ''}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => onOpenChange(false)}
                  className="flex-shrink-0 rounded-full p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            )}

            {/* Section header */}
            <div className={cn("px-6 pt-5 pb-4 flex-shrink-0", !isMobile && "pr-14")}>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{getSectionTitle()}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 break-words">{getSectionDesc()}</p>
            </div>

            {/* Section content */}
            <div 
              className="flex-1 overflow-y-auto overflow-x-hidden"
              data-scroll-hz="true"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="px-6 pb-6">
                <div className="max-w-3xl">
                  <div 
                    className={cn(
                      "transition-all duration-200",
                      isTransitioning ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
                    )}
                  >
                    {renderContent()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
