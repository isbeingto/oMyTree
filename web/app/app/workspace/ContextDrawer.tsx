'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  X, 
  GitBranch, 
  ArrowRight, 
  FileText, 
  MessageSquare, 
  Clock,
  User,
  Bot,
  Target,
  FileCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';
import type { QANode } from '../../tree/qaClient';
import type { EvidenceItem } from '../../tree/useEvidence';
import type { EvidenceRequirement } from '../../tree/useOutcomeDraft';

/**
 * T56-2: Context Drawer
 * 
 * A slide-in drawer that shows node context when a source chip is clicked.
 * Provides:
 * - Node preview (question + answer)
 * - Related evidence/outcomes (future)
 * - Two action buttons: Continue (same branch) / Branch from here
 */

export interface ContextDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Close the drawer */
  onClose: () => void;
  /** The source that was clicked (e.g., "node:abc123", "turn:def456") */
  source: string | null;
  /** The QA node being previewed (if found) */
  node: QANode | null;
  /** Callback to continue conversation from this node (same branch) */
  onContinue?: (nodeId: string) => void;
  /** Callback to branch from this node */
  onBranch?: (nodeId: string) => void;
  /** Evidence already attached to this node */
  evidence?: EvidenceItem[];
  /** Loading state for node evidence */
  evidenceLoading?: boolean;
  /** All evidence items for this tree (for attach flow) */
  treeEvidence?: EvidenceItem[];
  /** Attach an existing evidence item to this node */
  onAttachEvidence?: (evidenceId: string) => void;
  /** Open evidence drawer */
  onEvidenceClick?: (evidenceId: string) => void;
  /** Evidence gaps from outcome draft (missing / needs material) */
  evidenceGaps?: EvidenceRequirement[];
  /** Loading state for gaps */
  evidenceGapsLoading?: boolean;
  /** Language */
  lang?: Lang;
  /** Additional class names */
  className?: string;
}

/**
 * Parse source string into type and ID
 */
function parseSource(source: string | null): { type: 'node' | 'turn' | 'keyframe' | 'tree' | 'resource' | 'outcome' | 'unknown'; id: string } {
  if (!source) return { type: 'unknown', id: '' };
  
  const colonIndex = source.indexOf(':');
  if (colonIndex === -1) return { type: 'unknown', id: source };
  
  const prefix = source.slice(0, colonIndex);
  const id = source.slice(colonIndex + 1);
  
  switch (prefix) {
    case 'node': return { type: 'node', id };
    case 'turn': return { type: 'turn', id };
    case 'keyframe': return { type: 'keyframe', id };
    case 'tree': return { type: 'tree', id };
    case 'resource': return { type: 'resource', id };
    case 'outcome': return { type: 'outcome', id };
    default: return { type: 'unknown', id: source };
  }
}

/**
 * Source type icon
 */
function SourceIcon({ type }: { type: 'node' | 'turn' | 'keyframe' | 'tree' | 'resource' | 'outcome' | 'unknown' }) {
  switch (type) {
    case 'node': return <MessageSquare className="h-4 w-4" />;
    case 'turn': return <Clock className="h-4 w-4" />;
    case 'keyframe': return <FileCheck className="h-4 w-4" />;
    case 'tree': return <GitBranch className="h-4 w-4" />;
    case 'resource': return <FileCheck className="h-4 w-4" />;
    case 'outcome': return <Target className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

/**
 * Source type label
 */
function getSourceTypeLabel(type: string, lang: Lang): string {
  const labels: Record<string, Record<Lang, string>> = {
    node: { en: 'Node', 'zh-CN': '节点' },
    turn: { en: 'Turn', 'zh-CN': '对话轮次' },
    keyframe: { en: 'Keyframe', 'zh-CN': '关键帧/批注' },
    tree: { en: 'Tree', 'zh-CN': '知识树' },
    resource: { en: 'Resource', 'zh-CN': '资源' },
    outcome: { en: 'Outcome', 'zh-CN': '成果' },
    unknown: { en: 'Source', 'zh-CN': '来源' },
  };
  return labels[type]?.[lang] || labels.unknown[lang];
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function ContextDrawer({
  isOpen,
  onClose,
  source,
  node,
  onContinue,
  onBranch,
  evidence = [],
  evidenceLoading = false,
  treeEvidence = [],
  onAttachEvidence,
  onEvidenceClick,
  evidenceGaps = [],
  evidenceGapsLoading = false,
  lang = 'en',
  className,
}: ContextDrawerProps) {
  const parsedSource = useMemo(() => parseSource(source), [source]);
  
  // Format node preview
  const nodePreview = useMemo(() => {
    if (!node) return null;
    return {
      question: node.user_text || '',
      answer: node.ai_text || '',
      provider: node.provider || null,
      model: node.model || null,
      createdAt: node.created_at || null,
    };
  }, [node]);

  // Format date
  const formattedDate = useMemo(() => {
    if (!nodePreview?.createdAt) return null;
    try {
      return new Date(nodePreview.createdAt).toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, [nodePreview?.createdAt, lang]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filteredEvidence = useMemo(() => {
    const term = search.toLowerCase();
    const list = treeEvidence || [];
    const filtered = term
      ? list.filter(
          (ev) =>
            ev.title.toLowerCase().includes(term) ||
            (ev.summary && ev.summary.toLowerCase().includes(term)) ||
            (ev.tags && ev.tags.some((tag) => tag.toLowerCase().includes(term)))
        )
      : list;
    return filtered.slice(0, 20);
  }, [treeEvidence, search]);
  useEffect(() => {
    if (!isOpen) {
      setAttachOpen(false);
      setSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        // Overlay
        'fixed inset-0 z-50',
        className
      )}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 glass-overlay" />
      
      {/* Drawer panel */}
      <div
        className={cn(
          'absolute right-0 top-0 h-full',
          'w-[380px] max-w-[90vw]',
          'glass-panel-strong rounded-none',
          'border-l',
          'shadow-2xl',
          'flex flex-col',
          // Animation
          'animate-in slide-in-from-right duration-200 ease-out'
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid="context-drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center w-7 h-7 rounded-lg',
              parsedSource.type === 'node' && 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
              parsedSource.type === 'turn' && 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
              parsedSource.type === 'tree' && 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
              parsedSource.type === 'resource' && 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400',
              parsedSource.type === 'outcome' && 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400',
              parsedSource.type === 'unknown' && 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            )}>
              <SourceIcon type={parsedSource.type} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {getSourceTypeLabel(parsedSource.type, lang)}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                {parsedSource.id.slice(0, 12)}...
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Node Preview */}
            {nodePreview ? (
              <div className="space-y-3">
                {/* Question */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{lang === 'zh-CN' ? '问题' : 'Question'}</span>
                  </div>
                  <div className="rounded-lg bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-200/40 dark:border-emerald-700/30 px-3 py-2">
                    <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                      {truncate(nodePreview.question, 200)}
                    </p>
                  </div>
                </div>

                {/* Answer */}
                {nodePreview.answer && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="h-3 w-3" />
                      <span>{lang === 'zh-CN' ? '回答' : 'Answer'}</span>
                      {nodePreview.provider && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {nodePreview.provider}
                          {nodePreview.model && ` / ${nodePreview.model}`}
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-lg bg-white/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 px-3 py-2">
                      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words line-clamp-6">
                        {truncate(nodePreview.answer, 400)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {formattedDate && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formattedDate}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {lang === 'zh-CN' ? '暂无预览' : 'No preview available'}
                </p>
              </div>
            )}

            {/* Related Evidence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {lang === 'zh-CN' ? '相关证据' : 'Related Evidence'}
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setAttachOpen((v) => !v)}
                  disabled={!treeEvidence?.length || !onAttachEvidence}
                >
                  {t(lang, 'evidence_attach_existing') || 'Attach existing evidence'}
                </Button>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                {evidenceLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t(lang, 'evidence_loading') || 'Loading evidence…'}
                  </div>
                ) : evidence && evidence.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {evidence.map((ev) => (
                      <Badge
                        key={ev.id}
                        variant="secondary"
                        className={cn(
                          'text-[11px] px-2 py-0 h-5 cursor-pointer',
                          ev.type === 'url' && 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
                          ev.type === 'text' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
                          ev.type === 'file' && 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                        )}
                        onClick={() => onEvidenceClick?.(ev.id)}
                        title={ev.title}
                      >
                        {ev.title.length > 28 ? `${ev.title.slice(0, 27)}…` : ev.title}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileCheck className="h-4 w-4" />
                    <span>{t(lang, 'evidence_attached_none') || 'Not attached yet'}</span>
                  </div>
                )}
              </div>
              {attachOpen && (
                <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-muted/30">
                  <Input
                    placeholder={t(lang, 'evidence_select_placeholder') || 'Search evidence'}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredEvidence.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t(lang, 'evidence_empty') || 'No evidence yet'}
                      </p>
                    ) : (
                      filteredEvidence.map((ev) => (
                        <button
                          key={ev.id}
                          className="w-full text-left rounded-md px-2 py-2 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition"
                          onClick={() => {
                            onAttachEvidence?.(ev.id);
                            setAttachOpen(false);
                          }}
                        >
                          <div className="text-sm font-medium text-foreground truncate">{ev.title}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                            <span>{ev.type}</span>
                            {typeof ev.attached_node_count === 'number' ? (
                              <span>
                                {(t(lang, 'evidence_attached_count') || '{count}').replace(
                                  '{count}',
                                  String(ev.attached_node_count)
                                )}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Evidence gaps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t(lang, 'outcome_gap_label') || 'Gaps'}
                </h4>
                <Badge variant="outline" className="h-6 px-2 text-[11px]">
                  {evidenceGapsLoading
                    ? (lang === 'zh-CN' ? '加载中' : 'Loading')
                    : `${evidenceGaps.length} ${lang === 'zh-CN' ? '条' : 'items'}`}
                </Badge>
              </div>
              <div
                className={cn(
                  'rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3 space-y-2',
                  'bg-slate-50/60 dark:bg-slate-900/40'
                )}
                data-testid="evidence-gaps-list"
              >
                {evidenceGapsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t(lang, 'evidence_loading') || 'Loading evidence…'}
                  </div>
                ) : evidenceGaps.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {t(lang, 'outcome_evidence_empty') || 'Evidence requirements will be listed after generation.'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {evidenceGaps.map((gap, idx) => (
                      <div
                        key={`${gap.section_key}-${idx}-${gap.title}`}
                        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 px-3 py-2 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">
                              {gap.section_key.toUpperCase()}
                            </Badge>
                            <p className="text-sm font-medium text-foreground truncate">{gap.title}</p>
                          </div>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'h-5 px-2 text-[10px]',
                              gap.status === 'missing' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
                              gap.status === 'needs_material' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                            )}
                            data-testid="evidence-gap-status"
                          >
                            {gap.status || 'missing'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {gap.needs || gap.gaps?.[0] || ''}
                        </p>
                        {gap.gaps && gap.gaps.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {gap.gaps.slice(0, 3).map((missing) => (
                              <Badge key={missing} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {missing.length > 30 ? `${missing.slice(0, 29)}…` : missing}
                              </Badge>
                            ))}
                            {gap.gaps.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                +{gap.gaps.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Related Outcomes (placeholder) */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {lang === 'zh-CN' ? '相关成果' : 'Related Outcomes'}
              </h4>
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                <Target className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {lang === 'zh-CN' ? '暂无相关成果' : 'No related outcomes yet'}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="border-t border-slate-200/60 dark:border-slate-700/60 p-4 space-y-2">
          {node && (
            <>
              <Button
                className="w-full justify-center gap-2"
                onClick={() => onContinue?.(node.id)}
                data-testid="context-drawer-continue"
              >
                <ArrowRight className="h-4 w-4" />
                {lang === 'zh-CN' ? '继续对话' : 'Continue (same branch)'}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center gap-2"
                onClick={() => onBranch?.(node.id)}
                data-testid="context-drawer-branch"
              >
                <GitBranch className="h-4 w-4" />
                {lang === 'zh-CN' ? '从此处分支' : 'Branch from here'}
              </Button>
            </>
          )}
          {!node && (
            <p className="text-center text-xs text-muted-foreground">
              {lang === 'zh-CN' ? '无法导航到此来源' : 'Cannot navigate to this source'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
