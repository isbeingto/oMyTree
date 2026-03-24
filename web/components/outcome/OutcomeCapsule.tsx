'use client';

import { useMemo, useState, forwardRef, useCallback, useImperativeHandle } from 'react';
import { Loader2, Milestone, Trash2, RotateCw, ChevronRight, Calendar, Sparkles, Apple } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

import { useOutcomes } from '@/app/tree/useOutcomes';
import type { Outcome, OutcomeDetailResponse } from '@/lib/api';

type OutcomeCapsuleProps = {
  treeId: string | null | undefined;
  userId?: string | null;
  lang: string;
  anchorNodeId: string | null;
  expanded?: boolean;
  onSelectOutcome?: (outcomeId: string, detail: OutcomeDetailResponse) => void;
  onRequestCreate?: () => void;
};

export type OutcomeCapsuleHandle = {
  openCreate: () => void;
};

function formatRelativeTime(lang: string, value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  
  const now = new Date();
  const diffInSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSec < 60) return t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_time_just_now');
  if (diffInSec < 3600) return t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_time_min_ago').replace('{count}', String(Math.floor(diffInSec / 60)));
  if (diffInSec < 86400) return t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_time_hour_ago').replace('{count}', String(Math.floor(diffInSec / 3600)));
  
  return date.toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric'
  });
}

function byCreatedAtDesc(a: Outcome, b: Outcome) {
  const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

export const OutcomeCapsule = forwardRef<OutcomeCapsuleHandle, OutcomeCapsuleProps>(function OutcomeCapsule(props, ref) {
  const { treeId, userId, lang, anchorNodeId, expanded = true, onSelectOutcome, onRequestCreate } = props;

  const outcomesApi = useOutcomes(treeId, {
    userId,
    enabled: Boolean(treeId),
    autoFetch: expanded,
  });

  const [activeOutcomeId, setActiveOutcomeId] = useState<string | null>(null);

  const handleOpenCreate = useCallback(() => {
    if (onRequestCreate) {
      onRequestCreate();
    }
  }, [onRequestCreate]);

  useImperativeHandle(ref, () => ({
    openCreate: handleOpenCreate,
  }), [handleOpenCreate]);

  const sortedOutcomes = useMemo(() => {
    return [...(outcomesApi.outcomes ?? [])].sort(byCreatedAtDesc);
  }, [outcomesApi.outcomes]);

  const activeOutcome = useMemo(() => {
    if (!activeOutcomeId) return null;
    return (outcomesApi.outcomesById.get(activeOutcomeId) as Outcome | undefined) ?? null;
  }, [activeOutcomeId, outcomesApi.outcomesById]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <div className="rounded-3xl apple-glass border border-white/40 dark:border-white/[0.08] shadow-2xl shadow-black/5 overflow-hidden p-5 flex flex-col gap-6">
      {/* Header Area */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="bg-primary/20 p-1.5 rounded-lg ring-1 ring-primary/30">
              <Apple className="h-4 w-4 text-primary" />
            </div>
            {outcomesApi.isLoading && (
              <div className="absolute -top-1 -right-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-wide">
              {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_archive_title')}
            </div>
            <div className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-widest">
              {sortedOutcomes.length} {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcomes_count_unit')}
            </div>
          </div>
        </div>

        <div />
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-2 pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {outcomesApi.isLoading && sortedOutcomes.length === 0 ? (
          <div className="grid gap-3 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted/20 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : sortedOutcomes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-3 opacity-40">
            <div className="bg-muted/40 p-4 rounded-full">
              <Apple className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">{t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_empty_title')}</div>
              <p className="text-xs max-w-[180px]">
                {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_empty_desc')}
              </p>
            </div>
          </div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid gap-2.5 p-0.5"
          >
            {sortedOutcomes.map((o) => {
              const isActive = activeOutcomeId === o.id;
              const isPublished = o.asset_published === true;
              const timeStr = formatRelativeTime(lang, o.created_at);
              const anchorPreview = o.anchor_node_id?.slice(0, 6);

              return (
                <motion.div
                  key={o.id}
                  variants={itemVariants}
                  layout
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-2xl border transition-all duration-300 overflow-hidden",
                    isActive 
                      ? "bg-primary/[0.04] border-primary/30 ring-1 ring-primary/20 shadow-lg shadow-primary/5" 
                      : "bg-muted/10 border-white/5 hover:bg-muted/20 hover:border-white/10"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left p-4"
                    onClick={async () => {
                      if (!o.id) return;
                      setActiveOutcomeId(o.id);
                      const detail = await outcomesApi.getDetail(o.id);
                      if (detail?.ok) {
                        onSelectOutcome?.(o.id, detail);
                        // Optional: trigger scroll to detail view logic here
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className={cn(
                          "text-sm font-semibold truncate transition-colors",
                          isActive ? "text-primary" : "text-foreground/90"
                        )}>
                          {o.title || t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_untitled')}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isPublished && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[9px] rounded-full bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          >
                            已入库
                          </Badge>
                        )}
                        <div className="flex items-center gap-1.5 opacity-40 text-[10px] font-mono tracking-tighter">
                          <Calendar className="h-3 w-3" />
                          {timeStr}
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-2 italic mb-3">
                      "{o.conclusion}"
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-auto border-t border-white/5 pt-2.5">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/40 border border-white/5">
                        <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-tighter">Anchor</span>
                        <span className="text-[10px] font-mono text-muted-foreground/80">{anchorPreview}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-primary/80 font-medium">
                          {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_detail')}
                        </span>
                        <ChevronRight className="h-3 w-3 text-primary/60" />
                      </div>
                    </div>
                  </button>

                  {/* Actions Overlay for Item (Hover only to keep list clean) */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg glass-panel-soft text-muted-foreground hover:text-primary active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (o.id) void outcomesApi.regenerate(o.id);
                      }}
                      disabled={outcomesApi.isMutating}
                    >
                      <RotateCw className={cn("h-3.5 w-3.5", outcomesApi.isMutating && "animate-spin")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg glass-panel-soft text-muted-foreground hover:text-destructive active:scale-90"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (o.id) void outcomesApi.remove(o.id);
                      }}
                      disabled={outcomesApi.isMutating}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Selected Helper Info */}
      <AnimatePresence>
        {activeOutcome && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-2 p-3 rounded-2xl glass-panel-soft bg-primary/5 border border-primary/20 shadow-inner"
          >
            <div className="flex items-center gap-2">
              <div className="bg-primary/20 p-1.5 rounded-full">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-primary/80 truncate">
                  {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_report_ready')}
                </div>
                <div className="text-[9px] text-muted-foreground/60 leading-none mt-1">
                  {t(lang === 'zh-CN' ? 'zh-CN' : 'en', 'outcome_rendering_hint')}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

OutcomeCapsule.displayName = 'OutcomeCapsule';

export default OutcomeCapsule;
