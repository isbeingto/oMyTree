'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Milestone, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  History, 
  Quote, 
  CheckCircle2, 
  ArrowRight,
  Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { t, type Lang } from '@/lib/i18n';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import {
  publishOutcome,
  unpublishOutcome,
  type OutcomeAsset,
  type OutcomeDetailResponse
} from '@/lib/api';

/**
 * T93-11/T93-17: Outcome Detail View
 * 
 * Displays the structured report from an Outcome.
 * Supports folding for ancestor summaries (inherited insights).
 * Provides jump links back to nodes/turns/keyframes.
 */

interface OutcomeDetailProps {
  /** The outcome detail data */
  detail: OutcomeDetailResponse;
  /** Current tree id for publish/unpublish actions */
  treeId?: string | null;
  /** Current session user id */
  userId?: string | null;
  /** Language for labels */
  lang?: string;
  /** Callback for source click (anchored jump-back) */
  onSourceClick?: (source: string) => void;
  /** Callback when detail data is updated in-place */
  onDetailChange?: (detail: OutcomeDetailResponse) => void;
  /** Optional callback to close/return to chat */
  onClose?: () => void;
  /** Class name for container */
  className?: string;
}

export function OutcomeDetail({
  detail,
  treeId = null,
  userId = null,
  lang = 'zh-CN',
  onSourceClick,
  onDetailChange,
  onClose,
  className
}: OutcomeDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { outcome } = detail;
  if (!outcome) return null;

  const report = outcome.report_json as any;
  const sections = report?.sections || [];
  const [asset, setAsset] = useState<OutcomeAsset | null>(detail.asset ?? null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  useEffect(() => {
    setAsset(detail.asset ?? null);
  }, [detail]);
  
  const createdDate = outcome.created_at ? new Date(outcome.created_at) : null;
  const dateStr = createdDate?.toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const applyAssetChange = useCallback((nextAsset: OutcomeAsset | null) => {
    setAsset(nextAsset);
    if (onDetailChange) {
      onDetailChange({
        ...detail,
        asset: nextAsset,
      });
    }
  }, [detail, onDetailChange]);

  const handlePublish = useCallback(async () => {
    const outcomeId = outcome?.id;
    if (!treeId || !outcomeId) return;
    setIsPublishing(true);
    try {
      const data = await publishOutcome(treeId, outcomeId, { userId });
      const nextAsset = data?.asset ?? null;
      applyAssetChange(nextAsset);
      toast({
        title: t(lang as Lang, 'toast_outcome_published'),
        description: t(lang as Lang, 'toast_outcome_published_desc'),
        duration: 2200,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'publish_failed');
      toast({
        variant: 'destructive',
        title: t(lang as Lang, 'toast_outcome_publish_failed'),
        description: msg,
        duration: 3200,
      });
    } finally {
      setIsPublishing(false);
    }
  }, [applyAssetChange, lang, outcome?.id, toast, treeId, userId]);

  const handleUnpublish = useCallback(async () => {
    const outcomeId = outcome?.id;
    if (!treeId || !outcomeId) return;
    setIsUnpublishing(true);
    try {
      await unpublishOutcome(treeId, outcomeId, { userId });
      applyAssetChange(null);
      toast({
        title: t(lang as Lang, 'toast_outcome_unpublished'),
        description: t(lang as Lang, 'toast_outcome_unpublished_desc'),
        duration: 2200,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'unpublish_failed');
      toast({
        variant: 'destructive',
        title: t(lang as Lang, 'toast_outcome_unpublish_failed'),
        description: msg,
        duration: 3200,
      });
    } finally {
      setIsUnpublishing(false);
    }
  }, [applyAssetChange, lang, outcome?.id, toast, treeId, userId]);

  const handleOpenDocument = useCallback(() => {
    const kbId = typeof asset?.knowledge_base_id === 'string' ? asset.knowledge_base_id.trim() : '';
    const docId = typeof asset?.document_id === 'string' ? asset.document_id.trim() : '';
    if (!kbId || !docId) return;
    router.push(`/app?panel=knowledge&kb=${encodeURIComponent(kbId)}&doc=${encodeURIComponent(docId)}`);
  }, [asset?.document_id, asset?.knowledge_base_id, router]);

  return (
    <div className={cn("flex flex-col h-full glass-panel-soft", className)}>
      {/* Header Panel */}
      <div className="shrink-0 p-6 md:px-8 border-b border-white/10 flex flex-col gap-4 bg-white/5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-xl ring-1 ring-primary/30">
              <Milestone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wider bg-white/5 border-white/10 font-bold text-muted-foreground/60">
                  {lang === 'zh-CN' ? '成果归档' : 'Archive'}
                </Badge>
                <Badge variant="outline" className={cn(
                  "h-5 px-1.5 text-[10px] uppercase tracking-wider border",
                  asset
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-white/5 border-white/10 text-muted-foreground/60"
                )}>
                  {asset ? (lang === 'zh-CN' ? '已入库' : 'Published') : (lang === 'zh-CN' ? '未入库' : 'Unpublished')}
                </Badge>
                {dateStr && (
                  <span className="text-[10px] font-mono text-muted-foreground/40">{dateStr}</span>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
                {outcome.title || (lang === 'zh-CN' ? '分析报告' : 'Analysis Report')}
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {asset ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs gap-1.5"
                  onClick={handleOpenDocument}
                  disabled={isPublishing || isUnpublishing}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {lang === 'zh-CN' ? '打开文档' : 'Open Doc'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={handleUnpublish}
                  disabled={isPublishing || isUnpublishing}
                >
                  {isUnpublishing
                    ? (lang === 'zh-CN' ? '撤回中...' : 'Unpublishing...')
                    : (lang === 'zh-CN' ? '撤回' : 'Unpublish')}
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="h-8 rounded-full text-xs"
                onClick={handlePublish}
                disabled={isPublishing || isUnpublishing || !treeId || !outcome?.id}
              >
                {isPublishing
                  ? (lang === 'zh-CN' ? '同步中...' : 'Syncing...')
                  : (lang === 'zh-CN' ? '同步到知识库' : 'Sync to KB')}
              </Button>
            )}

            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 rounded-full text-xs gap-2 hover:bg-white/10"
              onClick={onClose}
            >
              <ArrowRight className="h-4 w-4" />
              {lang === 'zh-CN' ? '返回树' : 'Back'}
            </Button>
          </div>
        </div>

        {/* Conclusion Box */}
        <div className="relative overflow-hidden group">
          <div className="absolute inset-0 glass-panel rounded-2xl bg-primary/5 border border-primary/20" />
          <div className="relative p-4 md:px-5 flex items-start gap-4">
            <div className="shrink-0 mt-1">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-primary/70 uppercase tracking-widest mb-1">
                {lang === 'zh-CN' ? '核心结论' : 'Conclusion'}
              </div>
              <p className="text-sm md:text-md font-medium leading-relaxed italic text-foreground/90">
                "{outcome.conclusion}"
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Report Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div className="max-w-4xl mx-auto p-6 md:p-8 relative">
          {/* Timeline vertical line */}
          <div className="absolute left-6 md:left-8 top-8 bottom-8 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent hidden sm:block" />
          
          <div className="space-y-8 sm:pl-8 relative">
            {sections.map((section: any, idx: number) => (
              <div key={idx} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-8 top-2.5 h-2 w-2 -translate-x-[0.5px] rounded-full bg-primary/40 ring-4 ring-background hidden sm:block" />
                <SectionRenderer 
                  section={section} 
                  lang={lang} 
                  onSourceClick={onSourceClick}
                />
              </div>
            ))}
            
            {/* Generation Metadata */}
            {report?.generation_meta && (
              <div className="pt-12 border-t border-white/5 relative">
                <div className="absolute -left-8 top-14 h-1.5 w-1.5 -translate-x-[0.5px] rounded-full bg-muted-foreground/20 ring-4 ring-background hidden sm:block" />
                <div className="flex flex-col gap-1 opacity-20 text-[10px] font-mono">
                  <div>Model: {report.generation_meta.model}</div>
                  <div>Prompt: {report.generation_meta.prompt_version}</div>
                  <div>Generated: {report.generation_meta.generated_at}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionRenderer({ section, lang, onSourceClick }: { section: any, lang: string, onSourceClick?: (s: string) => void }) {
  const type = section.type;
  
  if (type === 'ancestor_summary') {
    return <AncestorSummaryFolding section={section} lang={lang} onSourceClick={onSourceClick} />;
  }
  
  if (type === 'evidence') {
    return <EvidenceFolding section={section} lang={lang} onSourceClick={onSourceClick} />;
  }

  // Standard step or other info-type sections
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-3"
    >
      <div className="prose prose-sm dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/80 font-normal">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {section.text}
        </ReactMarkdown>
      </div>
      
      {section.sources && section.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {section.sources.map((src: string) => (
            <SourceChip key={src} source={src} onClick={() => onSourceClick?.(src)} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/** T93-17: Ancestor folding with big tech polish */
function AncestorSummaryFolding({ section, lang, onSourceClick }: { section: any, lang: string, onSourceClick?: (s: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 md:px-5 group transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary/60" />
          <span className="text-[12px] font-bold text-primary/80 uppercase tracking-widest">
            {lang === 'zh-CN' ? '继承自祖先成果' : 'Inherited Summary'}
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2.5 rounded-lg text-xs gap-1.5 text-primary/70 hover:bg-primary/10 transition-all font-medium"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <>
              {lang === 'zh-CN' ? '收起背景' : 'Collapse'}
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              {lang === 'zh-CN' ? '展开祖先摘要' : 'View Ancestor Summary'}
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pl-4 border-l-2 border-primary/20 mb-4 py-1">
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground/80 leading-relaxed italic text-[14px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {section.text}
                </ReactMarkdown>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex flex-wrap gap-1.5">
                {section.sources?.map((src: string) => (
                  <SourceChip key={src} source={src} onClick={() => onSourceClick?.(src)} isSpecial />
                ))}
              </div>
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-primary/60 hover:text-primary text-[11px] gap-1"
                onClick={() => {
                  const src = section.sources?.find((s: string) => typeof s === 'string' && s.startsWith('outcome:'))
                    ?? section.sources?.[0];
                  if (src) onSourceClick?.(src);
                }}
              >
                {lang === 'zh-CN' ? '查看完整祖先成果' : 'View Full Ancestor'}
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EvidenceFolding({ section, lang, onSourceClick }: { section: any, lang: string, onSourceClick?: (s: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-white/10 rounded-2xl bg-muted/20 overflow-hidden shadow-sm">
      <button 
        className="w-full flex items-center justify-between px-4 py-3 group hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2.5">
          <Quote className="h-3.5 w-3.5 text-muted-foreground/40 rotate-180" />
          <span className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">
            {lang === 'zh-CN' ? '关键证据 / 原始详情' : 'Evidence / Detail'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] font-medium">{isOpen ? (lang === 'zh-CN' ? '收起' : 'Hide') : (lang === 'zh-CN' ? '浏览' : 'Expand')}</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4">
              <div className="p-4 rounded-xl bg-background/40 border border-white/5 shadow-inner">
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground/90 leading-6 text-[14px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.text}
                  </ReactMarkdown>
                </div>
              </div>
              
              {section.sources && section.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {section.sources.map((src: string) => (
                    <SourceChip key={src} source={src} onClick={() => onSourceClick?.(src)} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SourceChip({ source, onClick, isSpecial }: { source: string, onClick: () => void, isSpecial?: boolean }) {
  const [prefix, id] = source.split(':');
  
  const icon = useMemo(() => {
    switch (prefix) {
      case 'node': return <div className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:bg-blue-500" />;
      case 'turn': return <History className="h-2.5 w-2.5 text-orange-400 group-hover:text-orange-500" />;
      case 'keyframe': return <div className="w-2 h-2 rotate-45 border-2 border-primary/50 group-hover:border-primary" />;
      case 'outcome': return <Milestone className="h-2.5 w-2.5 text-purple-400 group-hover:text-purple-500" />;
      default: return <Info className="h-2.5 w-2.5" />;
    }
  }, [prefix]);

  const label = useMemo(() => {
    const shortId = id?.slice(0, 6);
    switch (prefix) {
      case 'node': return `Node ${shortId}`;
      case 'turn': return `Turn ${shortId}`;
      case 'keyframe': return `Pin ${shortId}`;
      case 'outcome': return isSpecial ? 'Ancestor' : `Outcome ${shortId}`;
      default: return source;
    }
  }, [prefix, id, source, isSpecial]);

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono tracking-tight transition-all duration-200",
        isSpecial 
          ? "bg-primary/20 border border-primary/30 text-primary-foreground/90 hover:bg-primary/30 active:scale-95 shadow-sm"
          : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-foreground active:scale-95"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
