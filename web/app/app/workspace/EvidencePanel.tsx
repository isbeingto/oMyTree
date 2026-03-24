'use client';

import { useMemo, useState } from 'react';
import { FilePlus2, RefreshCw, Link2, FileText, Upload, Loader2, ChevronRight, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { t, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
  EvidenceItem,
  EvidenceType,
  CreateEvidencePayload,
  UploadEvidencePayload,
} from '../../tree/useEvidence';

const TYPE_ICON: Record<EvidenceType, React.ElementType> = {
  url: Link2,
  text: FileText,
  file: Upload,
};

function EvidenceCard({
  item,
  onSelect,
  onAttach,
  isAttaching,
  currentNodeLabel,
  lang,
}: {
  item: EvidenceItem;
  onSelect?: (id: string) => void;
  onAttach?: (id: string) => Promise<void> | void;
  isAttaching?: boolean;
  currentNodeLabel?: string | null;
  lang?: Lang;
}) {
  const Icon = TYPE_ICON[item.type] || FileText;
  const attachedCount = item.attached_node_count ?? 0;
  const created = item.created_at
    ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <div
      className="rounded-lg border border-border/70 bg-white/70 dark:bg-slate-900/50 shadow-sm p-3 hover:border-primary/40 transition cursor-pointer"
      onClick={() => onSelect?.(item.id)}
      data-testid="evidence-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-2 py-1 text-[11px]">
              <Icon className="h-3.5 w-3.5" />
              {t(lang, `evidence_type_${item.type}` as any) || item.type}
            </Badge>
            <span className="text-xs text-muted-foreground">{created}</span>
          </div>
          <div className="font-semibold text-sm text-foreground truncate" title={item.title}>
            {item.title}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.summary ||
              (item.type === 'url' ? item.source_url : item.type === 'text' ? item.text_content : item.file_name) ||
              t(lang, 'evidence_drawer_preview') ||
              ''}
          </p>
          {item.tags && item.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  #{tag}
                </Badge>
              ))}
              {item.tags.length > 4 ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  +{item.tags.length - 4}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {onAttach ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs gap-1 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onAttach(item.id);
            }}
            disabled={isAttaching}
          >
            {isAttaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className="h-3.5 w-3.5" />}
            <span>{t(lang, 'evidence_attach') || 'Attach'}</span>
            {currentNodeLabel ? (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-1">
                {currentNodeLabel}
              </Badge>
            ) : null}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span>
          {attachedCount > 0
            ? (t(lang, 'evidence_attached_count') || 'Attached to {count} nodes').replace('{count}', String(attachedCount))
            : t(lang, 'evidence_attached_none') || 'Not attached yet'}
        </span>
        <div className="flex items-center gap-1 text-xs text-primary">
          <span>{t(lang, 'evidence_drawer_preview') || 'Preview'}</span>
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

export interface EvidencePanelProps {
  evidence: EvidenceItem[];
  isLoading?: boolean;
  currentNodeId?: string | null;
  currentNodeLabel?: string | null;
  guideAttach?: boolean;
  onRefresh?: () => void;
  onCreateEvidence?: (payload: CreateEvidencePayload) => Promise<EvidenceItem | null>;
  onUploadEvidence?: (payload: UploadEvidencePayload) => Promise<EvidenceItem | null>;
  onAttachToCurrentNode?: (evidenceId: string) => Promise<void> | void;
  onSelectEvidence?: (evidenceId: string) => void;
  lang?: Lang;
}

export function EvidencePanel({
  evidence,
  isLoading = false,
  currentNodeId,
  currentNodeLabel,
  guideAttach = false,
  onRefresh,
  onCreateEvidence,
  onUploadEvidence,
  onAttachToCurrentNode,
  onSelectEvidence,
  lang = 'en',
}: EvidencePanelProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeType, setActiveType] = useState<EvidenceType>('url');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [selectionText, setSelectionText] = useState('');

  const sortedEvidence = useMemo(() => {
    return [...evidence].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [evidence]);

  const selectionPreview = useMemo(() => {
    if (!selectionText) return '';
    const normalized = selectionText.replace(/\s+/g, ' ').trim();
    return normalized.length > 140 ? `${normalized.slice(0, 138)}…` : normalized;
  }, [selectionText]);

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setUrl('');
    setTextContent('');
    setTags('');
    setFile(null);
    setActiveType('url');
  };

  const captureSelection = () => {
    if (typeof window === 'undefined' || !window.getSelection) {
      setSelectionText('');
      return;
    }
    const selected = window.getSelection()?.toString() ?? '';
    setSelectionText(selected.trim());
  };

  const handleUseSelection = () => {
    if (!selectionText) return;
    const trimmed = selectionText.trim();
    if (!trimmed) return;
    const limited = trimmed.slice(0, 10000);
    setActiveType('text');
    setTextContent(limited);
    if (!title.trim()) {
      const titleCandidate = trimmed.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (titleCandidate) {
        setTitle(titleCandidate);
      }
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectionText('');
    }
  };

  const handleCreate = async () => {
    if (!onCreateEvidence && !onUploadEvidence) return;

    // T58-9-0: URL type - only url required, title auto-fills from domain
    if (activeType === 'url') {
      if (!url.trim()) {
        toast({ title: t(lang, 'evidence_url'), variant: 'destructive' });
        return;
      }
    } else if (activeType === 'text') {
      // Text type - title and content required
      if (!title.trim()) {
        toast({ title: t(lang, 'toast_evidence_title_required'), variant: 'destructive' });
        return;
      }
      if (!textContent.trim()) {
        toast({ title: t(lang, 'evidence_text'), variant: 'destructive' });
        return;
      }
    } else {
      // File type - title required
      if (!title.trim()) {
        toast({ title: t(lang, 'toast_evidence_title_required'), variant: 'destructive' });
        return;
      }
    }
    setIsSaving(true);
    const tagsArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      let created: EvidenceItem | null = null;
      if (activeType === 'file') {
        if (!file) {
          toast({ title: t(lang, 'toast_evidence_file_required'), variant: 'destructive' });
        } else if (onUploadEvidence) {
          created = await onUploadEvidence({
            title: title.trim(),
            summary: summary.trim() || undefined,
            file,
            tags: tagsArray,
          });
        }
      } else if (onCreateEvidence) {
        // T58-9-0: Auto-fill title from URL domain if empty
        let effectiveTitle = title.trim();
        if (activeType === 'url' && !effectiveTitle) {
          try {
            const urlObj = new URL(url.trim());
            effectiveTitle = urlObj.hostname.replace(/^www\./, '');
          } catch {
            effectiveTitle = url.trim().slice(0, 50);
          }
        }
        created = await onCreateEvidence({
          type: activeType,
          title: effectiveTitle,
          source_url: activeType === 'url' ? url.trim() : undefined,
          text_content: activeType === 'text' ? textContent : undefined,
        });
      }

      if (created) {
        // T58-9-0: Better toast with attach hint
        toast({
          title: t(lang, 'evidence_created'),
          description: t(lang, 'evidence_attach_hint'),
        });
        handleDialogOpenChange(false);
        onSelectEvidence?.(created.id);
        resetForm();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAttach = async (evidenceId: string) => {
    if (!onAttachToCurrentNode) return;
    if (!currentNodeId) {
      toast({ title: t(lang, 'evidence_select_placeholder'), variant: 'destructive' });
      return;
    }
    setAttachingId(evidenceId);
    try {
      await onAttachToCurrentNode(evidenceId);
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{t(lang, 'tab_evidence') || 'Evidence'}</h3>
          <p className="text-xs text-muted-foreground">
            {currentNodeLabel
              ? `${t(lang, 'evidence_current_node') || 'Current node'}: ${currentNodeLabel}`
              : t(lang, 'evidence_select_placeholder') || 'Select a node to attach evidence'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-8 gap-2"
            onMouseDown={captureSelection}
            onClick={() => setDialogOpen(true)}
          >
            <FilePlus2 className="h-4 w-4" />
            {t(lang, 'evidence_new') || 'New Evidence'}
          </Button>
        </div>
      </div>

      {guideAttach && (
        <div className="mx-4 mb-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 px-3 py-2 text-[11px] text-blue-900 dark:text-blue-100 shrink-0">
          {t(lang, 'outcome_attach_prompt') || 'Attach evidence to the current node, then refresh to update gaps.'}
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 px-4 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t(lang, 'evidence_loading') || 'Loading evidence…'}
            </div>
          ) : sortedEvidence.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              {t(lang, 'evidence_empty') || 'No evidence yet'}
            </div>
          ) : (
            sortedEvidence.map((item) => (
              <EvidenceCard
                key={item.id}
                item={item}
                onSelect={onSelectEvidence}
                onAttach={onAttachToCurrentNode ? handleAttach : undefined}
                isAttaching={attachingId === item.id}
                currentNodeLabel={currentNodeLabel}
                lang={lang}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(lang, 'evidence_new') || 'New Evidence'}</DialogTitle>
            <DialogDescription className="sr-only">
              Add a new piece of evidence to your research
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectionText ? (
              <div className="rounded-md border border-dashed border-border/70 bg-slate-50/60 dark:bg-slate-900/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {t(lang, 'evidence_use_selection_hint') || 'Selected text detected'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={handleUseSelection}
                    data-testid="evidence-use-selection"
                  >
                    <FileText className="h-3 w-3" />
                    {t(lang, 'evidence_use_selection') || 'Use selected text'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{selectionPreview}</p>
              </div>
            ) : null}
            <Tabs value={activeType} onValueChange={(val) => setActiveType(val as EvidenceType)}>
              <TabsList className="grid grid-cols-3 h-9">
                <TabsTrigger value="url">{t(lang, 'evidence_new_url') || 'URL'}</TabsTrigger>
                <TabsTrigger value="text">{t(lang, 'evidence_new_text') || 'Text'}</TabsTrigger>
                <TabsTrigger value="file">{t(lang, 'evidence_new_file') || 'File'}</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-3 pt-3">
                <Input
                  placeholder={t(lang, 'evidence_url') || 'Source URL (required)'}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder={t(lang, 'evidence_title_optional') || 'Title (optional - auto-fills from URL)'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="text" className="space-y-3 pt-3">
                <Input
                  placeholder={t(lang, 'evidence_title') || 'Title (required)'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <Textarea
                  placeholder={t(lang, 'evidence_text') || 'Text content (required)'}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={5}
                  maxLength={10000}
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {textContent.length}/10000
                </p>
              </TabsContent>
              <TabsContent value="file" className="space-y-3 pt-3">
                <Input
                  placeholder={t(lang, 'evidence_title') || 'Title (required)'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => handleDialogOpenChange(false)} disabled={isSaving}>
              {t(lang, 'cancel') || 'Cancel'}
            </Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t(lang, 'save') || 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EvidencePanel;
