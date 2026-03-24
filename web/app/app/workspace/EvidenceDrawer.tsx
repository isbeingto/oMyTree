'use client';

import { useMemo } from 'react';
import { Link2, FileText, File, Tag, Clock, X, ExternalLink, Pin, CheckCircle2, Layers } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { t, type Lang } from '@/lib/i18n';
import type { EvidenceItem, EvidenceNodeLink } from '../../tree/useEvidence';
import { cn } from '@/lib/utils';

const TYPE_STYLES: Record<string, { icon: React.ElementType; gradient: string; accent: string; badge: string }> = {
  url: {
    icon: Link2,
    gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent',
    accent: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-0'
  },
  text: {
    icon: FileText,
    gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
    accent: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0'
  },
  file: {
    icon: File,
    gradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
    accent: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0'
  },
};

function formatBytes(bytes?: number | null): string | null {
  if (!bytes || Number.isNaN(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string | null, lang?: Lang): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getPreviewSnippet(evidence?: EvidenceItem | null): string | null {
  if (!evidence) return null;
  if (evidence.summary && evidence.summary.trim()) return evidence.summary.trim();
  if (evidence.type === 'text' && evidence.text_content) {
    const snippet = evidence.text_content.replace(/\s+/g, ' ').trim();
    return snippet.length > 180 ? `${snippet.slice(0, 178)}…` : snippet;
  }
  if (evidence.type === 'url' && evidence.source_url) {
    return evidence.source_url;
  }
  if (evidence.file_name) return evidence.file_name;
  return null;
}

function EvidenceTypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] || TYPE_STYLES.text;
  const Icon = style.icon;
  return (
    <Badge className={cn('px-3 py-1.5 text-xs font-medium shadow-sm gap-1.5', style.badge)}>
      <Icon className="h-3.5 w-3.5" />
      {type.toUpperCase()}
    </Badge>
  );
}

function NodeChip({
  node,
  onClick,
  lang,
}: {
  node: EvidenceNodeLink;
  onClick?: (source: string) => void;
  lang?: Lang;
}) {
  const label = useMemo(() => {
    if (node.text) {
      const trimmed = node.text.trim();
      return trimmed.length > 32 ? `${trimmed.slice(0, 30)}…` : trimmed;
    }
    return `Node ${node.id.slice(0, 6)}`;
  }, [node]);
  const attachedAt = formatDate(node.attached_at, lang) || (node.attached_at ?? null);

  return (
    <button
      type="button"
      data-testid="evidence-node-chip"
      onClick={() => onClick?.(`node:${node.id}`)}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800/50",
        "border border-slate-200/80 dark:border-slate-700/80",
        "hover:border-primary/40 hover:shadow-sm",
        "transition-all duration-200 cursor-pointer text-left"
      )}
      title={node.text || node.id}
    >
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm text-foreground/90 group-hover:text-foreground truncate block">
          {label}
        </span>
        {attachedAt && (
          <span className="text-[11px] text-muted-foreground block">
            {(lang === 'zh-CN' ? '挂载时间 ' : 'Attached ')}
            {attachedAt}
          </span>
        )}
      </div>
    </button>
  );
}

export interface EvidenceDrawerProps {
  evidence: EvidenceItem | null;
  nodes?: EvidenceNodeLink[];
  isOpen: boolean;
  onClose: () => void;
  onAttach?: () => void;
  onSourceClick?: (source: string) => void;
  isLoadingNodes?: boolean;
  currentNodeLabel?: string | null;
  lang?: Lang;
}

export function EvidenceDrawer({
  evidence,
  nodes = [],
  isOpen,
  onClose,
  onAttach,
  onSourceClick,
  isLoadingNodes = false,
  currentNodeLabel,
  lang = 'en',
}: EvidenceDrawerProps) {
  const createdAt = formatDate(evidence?.created_at, lang);
  const previewSnippet = useMemo(() => getPreviewSnippet(evidence), [evidence]);
  const showPreviewCard = Boolean(previewSnippet && (!evidence?.summary || previewSnippet !== evidence.summary));
  const createdAtDisplay = createdAt || evidence?.created_at || null;
  const linkedNodesCount =
    nodes.length || (typeof evidence?.attached_node_count === 'number' ? evidence.attached_node_count || 0 : 0);
  const style = evidence?.type ? TYPE_STYLES[evidence.type] || TYPE_STYLES.text : TYPE_STYLES.text;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "w-[400px] sm:w-[460px] p-0 overflow-hidden",
          "bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950",
          "border-l border-slate-200/60 dark:border-slate-800"
        )}
      >
        {/* Header with gradient */}
        <div className={cn("relative px-6 pt-6 pb-5 bg-gradient-to-br", style.gradient)}>
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 rounded-full glass-panel-soft shadow-sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          <SheetHeader className="space-y-4 pr-10">
            {evidence?.type && <EvidenceTypeBadge type={evidence.type} />}
            <SheetTitle className="text-xl font-bold text-foreground leading-tight">
              {evidence ? evidence.title : 'Evidence'}
            </SheetTitle>
            <SheetDescription className="sr-only">Evidence details</SheetDescription>
            {evidence?.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{evidence.summary}</p>
            )}
          </SheetHeader>
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="px-6 py-5 space-y-5">
            {showPreviewCard && (
              <div
                className={cn(
                  "rounded-xl border border-slate-200/70 dark:border-slate-800/60",
                  "bg-white/80 dark:bg-slate-900/60 shadow-sm p-4 space-y-2"
                )}
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{t(lang, 'evidence_summary') || 'Summary / preview'}</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed break-words">
                  {previewSnippet}
                </p>
              </div>
            )}

            {/* URL Card */}
            {evidence?.type === 'url' && evidence.source_url && (
              <div className="space-y-2">
                <a
                  href={evidence.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "group flex items-center gap-3 p-4 rounded-xl",
                    "bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20",
                    "border border-blue-200/60 dark:border-blue-800/40",
                    "hover:border-blue-300 dark:hover:border-blue-700",
                    "hover:shadow-md shadow-blue-500/5",
                    "transition-all duration-200"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm">
                    <Link2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-0.5">
                      {t(lang, 'evidence_url') || 'Source URL'}
                    </p>
                    <p className="text-sm text-foreground truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                      {evidence.source_url}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </a>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full justify-center gap-2 text-xs",
                    "border-blue-200/70 text-blue-700 hover:bg-blue-50/60",
                    "dark:border-blue-800/70 dark:text-blue-200 dark:hover:bg-blue-900/30"
                  )}
                >
                  <a
                    href={evidence.source_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="evidence-open-original"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t(lang, 'evidence_open_original') || 'Open original'}
                  </a>
                </Button>
              </div>
            )}

            {/* File Card */}
            {evidence?.type === 'file' && (
              <div className={cn(
                "p-4 rounded-xl",
                "bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/20",
                "border border-amber-200/60 dark:border-amber-800/40"
              )}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                    <File className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100 truncate">
                      {evidence.file_name || t(lang, 'evidence_type_file')}
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      {[formatBytes(evidence.file_size), evidence.mime_type].filter(Boolean).join(' · ') || 'File'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Text Preview */}
            {evidence?.type === 'text' && evidence.text_content && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{t(lang, 'evidence_drawer_preview') || 'Content Preview'}</span>
                </div>
                <div className={cn(
                  "max-h-48 overflow-auto rounded-xl p-4",
                  "bg-gradient-to-br from-emerald-50/80 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20",
                  "border border-emerald-200/60 dark:border-emerald-800/40"
                )}>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {evidence.text_content}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata */}
            {(createdAtDisplay || (evidence?.tags && evidence.tags.length > 0) || linkedNodesCount > 0) && (
              <div
                className={cn(
                  "rounded-xl border border-slate-200/70 dark:border-slate-800/60",
                  "bg-slate-50/60 dark:bg-slate-900/40 shadow-sm p-4 space-y-3"
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{t(lang, 'evidence_created_time') || 'Created'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {createdAtDisplay && (
                    <Badge variant="outline" className="gap-1 px-2 py-1 text-xs">
                      <Clock className="h-3 w-3" />
                      {createdAtDisplay}
                    </Badge>
                  )}
                  {linkedNodesCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="gap-1 px-2 py-1 text-[11px] bg-primary/10 text-primary border-primary/20"
                    >
                      <Layers className="h-3 w-3" />
                      {(t(lang, 'evidence_attached_count') || 'Attached to {count} nodes').replace(
                        '{count}',
                        String(linkedNodesCount)
                      )}
                    </Badge>
                  )}
                  {evidence?.tags?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1.5 text-xs px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Attach CTA */}
            {onAttach && (
              <div className="pt-2">
                <Button
                  type="button"
                  data-testid="evidence-attach-current"
                  onClick={onAttach}
                  className={cn(
                    "w-full h-12 gap-3 text-sm font-medium",
                    "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
                    "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30",
                    "transition-all duration-200"
                  )}
                >
                  <Pin className="h-4 w-4" />
                  {t(lang, 'evidence_attach') || 'Attach to current node'}
                  {currentNodeLabel && (
                    <Badge
                      variant="secondary"
                      className="ml-2 bg-white/20 text-white border-0 text-[10px] px-2"
                    >
                      {currentNodeLabel.length > 20 ? `${currentNodeLabel.slice(0, 18)}…` : currentNodeLabel}
                    </Badge>
                  )}
                </Button>
              </div>
            )}

            {/* Attached Nodes */}
            <div className="pt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span>{t(lang, 'evidence_drawer_nodes') || 'Attached to'}</span>
                {linkedNodesCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                    {linkedNodesCount} {linkedNodesCount === 1 ? 'node' : 'nodes'}
                  </Badge>
                )}
              </div>

              {isLoadingNodes ? (
                <div className="text-sm text-muted-foreground animate-pulse">
                  {t(lang, 'evidence_loading') || 'Loading...'}
                </div>
              ) : nodes.length > 0 ? (
                <div className="space-y-2">
                  {nodes.map((node) => (
                    <NodeChip key={node.id} node={node} onClick={onSourceClick} lang={lang} />
                  ))}
                </div>
              ) : (
                <div className={cn(
                  "flex items-center justify-center py-6 rounded-xl",
                  "bg-slate-50/50 dark:bg-slate-900/30",
                  "border border-dashed border-slate-200 dark:border-slate-800",
                  "text-sm text-muted-foreground"
                )}>
                  {t(lang, 'evidence_attached_none') || 'Not attached to any nodes yet'}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default EvidenceDrawer;
