'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Milestone, TriangleAlert, Check, ChevronRight, Sparkles, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';
import type { OutcomeCreateRequest, OutcomeCreateResponse, OutcomePreviewRequest, OutcomePreviewResponse } from '@/lib/api';

type InlineOutcomeCreateProps = {
  lang: string;
  treeId: string | null | undefined;
  anchorNodeId: string | null;
  /** Callback to get candidate title/preview from AI */
  preview: (payload: OutcomePreviewRequest) => Promise<OutcomePreviewResponse | null>;
  /** Callback to perform creation */
  create: (payload: OutcomeCreateRequest) => Promise<OutcomeCreateResponse | null>;
  /** Called when creation is successful */
  onCreated?: (outcomeId: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
};

/**
 * T93-UX: Persistence storage for inline outcome drafts
 */
const STORAGE_PREFIX = 'omytree_outcome_draft_';

const MAX_CONCLUSION_LEN = 500; // Increased to allow more "guidance"

const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function makeFallbackCandidates(lang: string) {
  return lang === 'zh-CN' || lang === 'zh'
    ? ['阶段性成果汇总', '当前脉络核心结果', '决策/分析报告']
    : ['Milestone Summary', 'Current Thread Outcome', 'Analysis Report'];
}

export const InlineOutcomeCreate = memo(function InlineOutcomeCreate(props: InlineOutcomeCreateProps) {
  const { lang, treeId, anchorNodeId, preview, create, onCreated, onCancel } = props;
  const { toast } = useToast();

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [draftHydrated, setDraftHydrated] = useState(false);

  const isZh = lang === 'zh-CN' || lang === 'zh';
  const titleTouchedRef = useRef(false);

  // Persistence Key
  const storageKey = useMemo(() => {
    return anchorNodeId ? `${STORAGE_PREFIX}${anchorNodeId}` : null;
  }, [anchorNodeId]);

  // Load from Persistence
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        const ts = typeof parsed?.ts === 'number' ? parsed.ts : null;
        if (ts && Date.now() - ts > DRAFT_TTL_MS) {
          localStorage.removeItem(storageKey);
        } else {
          if (Array.isArray(parsed.candidates)) setTitleCandidates(parsed.candidates);
          if (typeof parsed.title === 'string') {
            setTitle(parsed.title);
            titleTouchedRef.current = parsed.title.trim().length > 0;
          }
          if (typeof parsed.conclusion === 'string') setConclusion(parsed.conclusion);
        }
      }
    } catch (e) {
      console.warn('Failed to load outcome draft', e);
    } finally {
      setDraftHydrated(true);
    }
  }, [storageKey]);

  // Save to Persistence
  useEffect(() => {
    if (!storageKey) return;
    const data = {
      candidates: titleCandidates,
      title,
      conclusion,
      ts: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [storageKey, titleCandidates, title, conclusion]);

  // Cleanup Persistence after creation
  const clearDraft = useCallback(() => {
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  const fetchPreview = useCallback(async () => {
    if (!treeId || !anchorNodeId || isLoadingPreview) return;
    
    setIsLoadingPreview(true);
    setPreviewWarning(null);
    try {
      const res = await preview({ 
        anchor_node_id: anchorNodeId,
        // Passing current guidance (conclusion) to help AI refine suggestions
        conclusion: conclusion.trim() || undefined
      });

      const candidates = (res?.title_candidates ?? []).filter(Boolean).map((c) => String(c));
      const resolvedCandidates = candidates.slice(0, 3).length >= 1 
        ? candidates.slice(0, 3) 
        : makeFallbackCandidates(lang);

      setTitleCandidates(resolvedCandidates);
      
      // Auto-select first only if title is empty or user hasn't manually touched it much
      if (!titleTouchedRef.current || !title.trim()) {
        setTitle(resolvedCandidates[0]);
      }
      setPreviewWarning(res?.warning ? String(res.warning) : null);
    } catch (err) {
      toast({
        title: t(lang as Lang, 'toast_outcome_suggest_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  }, [treeId, anchorNodeId, isLoadingPreview, preview, conclusion, lang, isZh, toast, title]);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);
  const [hasMeasured, setHasMeasured] = useState(false);

  const measureHeight = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const next = el.scrollHeight;
    setMeasuredHeight((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => { measureHeight(); setHasMeasured(true); }, [measureHeight, previewWarning, titleCandidates.length, isLoadingPreview]);

  const canSubmit = Boolean(treeId && anchorNodeId && title.trim() && !isSubmitting);

  const handleCreate = async () => {
    if (!canSubmit || !treeId || !anchorNodeId) return;
    setIsSubmitting(true);
    try {
      const res = await create({
        anchor_node_id: anchorNodeId,
        title: title.trim(),
        conclusion: conclusion.trim(), // This is now used as guidance
      });
      if (res?.ok && res.outcome?.id) {
        toast({
          title: t(lang as Lang, 'toast_outcome_created'),
          description: t(lang as Lang, 'toast_outcome_created_desc'),
        });
        clearDraft();
        onCreated?.(res.outcome.id);
      } else {
        throw new Error('Failed to create outcome');
      }
    } catch (err) {
      toast({
        title: t(lang as Lang, 'toast_outcome_create_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: 10 }}
      animate={{ opacity: 1, height: hasMeasured ? measuredHeight : 0, y: 0 }}
      exit={{ opacity: 0, height: 0, y: 10 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="mt-4 border border-primary/20 bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-xl"
    >
      <div ref={contentRef} className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 grid place-items-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {isZh ? '新建阶段成果' : 'New Outcome'}
              </h3>
              <p className="text-[10px] text-muted-foreground opacity-60">
                {isZh ? '让 AI 帮你提炼这一脉络的决策与结论' : 'AI-powered summary for this context'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full hover:bg-muted"
            onClick={onCancel}
            title={isZh ? '收起' : 'Collapse'}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>

        {/* AI Loading Banner (always visible when generating) */}
        <AnimatePresence initial={false}>
          {isLoadingPreview && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-3 px-4 py-3 bg-primary/[0.04] rounded-2xl border border-primary/10"
            >
              <div className="h-8 w-8 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground/80">
                  {isZh ? 'AI 正在拟定标题…' : 'AI is proposing titles…'}
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {isZh ? '稍等片刻，马上给你 3 个可选方案' : 'You will get 3 options shortly'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Warning Section */}
        {previewWarning === 'no_keyframes_on_path' && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <TriangleAlert className="h-4 w-4 text-amber-500 mt-0.5" />
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                {isZh
                  ? '注意：当前脉络缺乏锚点节点，成果报告可能偏向于对对话内容的归纳。'
                  : 'Note: Current path lacks keyframes, so the report will be more descriptive.'}
              </p>
            </div>
          </div>
        )}

        {/* Title Selection (Pick-1 of 3) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 opacity-70">
              <Milestone className="h-3 w-3" />
              {isZh ? '成果标题建议' : 'Title Suggestions'}
            </label>
            {titleCandidates.length > 0 && (
              <button
                type="button"
                onClick={fetchPreview}
                disabled={isLoadingPreview || isSubmitting}
                className="flex items-center gap-1 text-[10px] font-semibold text-primary/80 hover:text-primary disabled:opacity-50 transition-colors"
                title={isZh ? '根据当前补充描述重新生成' : 'Regenerate based on current guidance'}
              >
                <Sparkles className={cn("h-3 w-3", isLoadingPreview && "animate-spin")} />
                {isZh ? '重新生成' : 'Regenerate'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {titleCandidates.length > 0
              ? titleCandidates.map((candidate, idx) => {
                  const label = typeof candidate === 'string' ? candidate : '';
                  const active = label && title === label;
                  return (
                    <button
                      key={`${idx}-${label}`}
                      type="button"
                      onClick={() => {
                        if (!label) return;
                        setTitle(label);
                        titleTouchedRef.current = true;
                      }}
                      className={cn(
                        'relative text-left px-4 py-3 rounded-2xl border transition-all duration-200 active:scale-[0.98]',
                        active
                          ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                          : 'bg-background border-border hover:border-primary/40 hover:bg-primary/[0.02]'
                      )}
                    >
                      <span className={cn(
                        'text-[11px] leading-snug font-medium line-clamp-2',
                        active ? 'text-primary' : 'text-foreground/70'
                      )}>
                        {label}
                      </span>
                      {active && (
                        <motion.div
                          layoutId="check"
                          className="absolute -top-1.5 -right-1.5 bg-primary text-white rounded-full p-0.5 shadow-sm"
                        >
                          <Check className="h-3 w-3" />
                        </motion.div>
                      )}
                    </button>
                  );
                })
              : isLoadingPreview 
                ? Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={`skeleton-${idx}`}
                      className="h-14 rounded-2xl border border-border/50 bg-muted/20 animate-pulse flex items-center justify-center"
                    >
                       <Sparkles className="h-4 w-4 text-primary/10" />
                    </div>
                  ))
                : (
                  <div className="col-span-1 sm:col-span-3">
                    <Button 
                      variant="outline"
                      type="button"
                      disabled={isLoadingPreview || isSubmitting}
                      onClick={fetchPreview}
                      className="w-full h-14 rounded-2xl bg-primary/[0.02] border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all group gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-primary group-hover:animate-pulse" />
                      <span className="text-xs font-semibold text-primary/80">
                        {isZh ? '帮我拟定标题' : 'Suggest Titles with AI'}
                      </span>
                    </Button>
                  </div>
                )}
          </div>

          <div className="relative pt-1">
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                titleTouchedRef.current = true;
              }}
              placeholder={isZh ? '选一个，再按你的习惯微调…' : 'Pick one, then refine if you like…'}
              className="h-10 rounded-xl bg-muted/40 border-border/60 focus:bg-background transition-all text-sm"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Guidance (Optional) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <label className="text-[11px] font-bold text-muted-foreground opacity-70 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              {isZh ? '补充描述 / AI 创作指令 (可选)' : 'Supplemental Guidance (Optional)'}
            </label>
          </div>
          <div className="relative">
            <Textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder={isZh
                ? '随便写点你在意的点：比如“更强调成本与落地步骤”、“用更通俗的语言”，让 AI 写得更贴近你的目的。'
                : 'Add any constraints like “focus on cost & steps” to help AI write closer to your intent.'}
              className="min-h-[100px] text-sm resize-none rounded-2xl bg-muted/40 border-border/60 focus:bg-background transition-all"
              maxLength={MAX_CONCLUSION_LEN}
              disabled={isSubmitting}
            />
            <div className="absolute bottom-2.5 right-3 px-1.5 py-0.5 rounded-md bg-zinc-200/50 dark:bg-zinc-800/50 text-[9px] font-mono text-muted-foreground tabular-nums">
              {conclusion.length} / {MAX_CONCLUSION_LEN}
            </div>
          </div>
        </div>

        {/* Footer Actions (always visible) */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-[10px] text-muted-foreground/55 max-w-[60%] leading-tight">
            {isZh
              ? '生成后会进入成果面板；你随时可以再编辑。'
              : 'It will appear in the outcomes panel; editable anytime.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 px-5 rounded-xl text-xs font-bold gap-1.5 shadow-lg shadow-primary/20"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              {isZh ? '下一步' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
