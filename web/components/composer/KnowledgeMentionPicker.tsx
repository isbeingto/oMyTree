'use client';

import * as React from 'react';
import { Search, Library, Loader2, X, ArrowLeft, FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listKnowledgeBases, listKnowledgeDocuments } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeBase, KnowledgeDocument } from '@/lib/types/knowledge';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

interface KnowledgeMentionPickerProps {
  value?: {
    kbId?: string | null;
    docIds?: string[];
  };
  onApply: (selection: { kb: KnowledgeBase | null; docs: KnowledgeDocument[] }) => void;
  onClose: () => void;
  onOpenManager?: () => void;
  lang?: Lang;
  userId?: string;
  className?: string;
}

const RECENT_KEY = 'knowledge_recent_used';
const MAX_RECENT = 5;
const MAX_DOCS = 20;

function getKnowledgeBaseDocumentCount(kb: KnowledgeBase | null | undefined) {
  if (!kb) return 0;
  const maybeCount =
    (kb as any).knowledge_count ??
    (kb as any).document_count ??
    (kb as any).doc_count ??
    0;
  const n = Number(maybeCount);
  return Number.isFinite(n) ? n : 0;
}

export function KnowledgeMentionPicker({ 
  value,
  onApply,
  onClose, 
  onOpenManager,
  lang = 'en', 
  userId,
  className 
}: KnowledgeMentionPickerProps) {
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<KnowledgeBase[]>([]);
  const [search, setSearch] = React.useState('');

  const [selectedKbId, setSelectedKbId] = React.useState<string | null>(value?.kbId ? String(value.kbId) : null);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [docs, setDocs] = React.useState<KnowledgeDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = React.useState<Set<string>>(
    new Set(Array.isArray(value?.docIds) ? value!.docIds!.map(String) : [])
  );
  const [docLimitHit, setDocLimitHit] = React.useState(false);

  const isZh = lang === 'zh-CN';

  React.useEffect(() => {
    loadKBs();
  }, []);

  React.useEffect(() => {
    // Sync when parent value changes
    if (value?.kbId !== undefined) {
      const nextKbId = value.kbId ? String(value.kbId) : null;
      setSelectedKbId(nextKbId);
    }
    if (Array.isArray(value?.docIds)) {
      setSelectedDocIds(new Set(value!.docIds!.map(String)));
    }
  }, [value?.kbId, Array.isArray(value?.docIds) ? value!.docIds!.join('|') : null]);

  const loadKBs = async () => {
    setLoading(true);
    try {
      const res = await listKnowledgeBases({ userId });
      if (res.data) {
        setItems(res.data);
      }
    } catch (err) {
      console.error('Failed to load knowledge bases', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDocs = async (kbId: string) => {
    setDocsLoading(true);
    try {
      const res = await listKnowledgeDocuments(kbId, { userId });
      setDocs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load knowledge documents', err);
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const getRecentIds = () => {
    if (typeof window === 'undefined') return [] as string[];
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(String).filter(Boolean).slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  };

  const recordRecent = (kbId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const prev = getRecentIds();
      const next = [kbId, ...prev.filter((id) => id !== kbId)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const recentIds = React.useMemo(() => getRecentIds(), [items.length]);
  const byId = React.useMemo(() => new Map(items.map((kb) => [kb.id, kb])), [items]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredKbs = React.useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter(
      (kb) =>
        kb.name.toLowerCase().includes(normalizedSearch) ||
        (kb.description && kb.description.toLowerCase().includes(normalizedSearch))
    );
  }, [items, normalizedSearch]);

  const selectedKb = React.useMemo(() => {
    if (!selectedKbId) return null;
    return byId.get(selectedKbId) || null;
  }, [byId, selectedKbId]);

  const filteredDocs = React.useMemo(() => {
    if (!normalizedSearch) return docs;
    return docs.filter((d) => {
      const name = String(d.file_name || d.title || '').toLowerCase();
      return name.includes(normalizedSearch);
    });
  }, [docs, normalizedSearch]);

  const handleSelectKb = async (kb: KnowledgeBase) => {
    setDocLimitHit(false);
    setSelectedKbId(kb.id);
    setSelectedDocIds(new Set());
    await loadDocs(kb.id);
  };

  const handleToggleDoc = (doc: KnowledgeDocument) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      const id = String(doc.id);
      if (next.has(id)) {
        next.delete(id);
        setDocLimitHit(false);
        return next;
      }
      if (next.size >= MAX_DOCS) {
        setDocLimitHit(true);
        return prev;
      }
      next.add(id);
      setDocLimitHit(false);
      return next;
    });
  };

  const handleClear = () => {
    setSelectedKbId(null);
    setDocs([]);
    setSelectedDocIds(new Set());
    setDocLimitHit(false);
  };

  const handleApply = () => {
    if (!selectedKb) {
      onApply({ kb: null, docs: [] });
      return;
    }
    recordRecent(selectedKb.id);
    const selectedDocs = docs.filter((d) => selectedDocIds.has(String(d.id)));
    onApply({ kb: selectedKb, docs: selectedDocs });
  };
  
  return (
    <div className={cn(
      "flex flex-col w-full bg-popover text-popover-foreground rounded-2xl border shadow-2xl overflow-hidden max-h-[400px]",
      className
    )}>
      <div className="relative p-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2 px-3 h-10 rounded-full bg-background border border-border/50 focus-within:border-emerald-500/50 transition-colors shadow-sm">
          {selectedKb ? (
            <button
              type="button"
              onClick={() => {
                setSelectedKbId(null);
                setDocs([]);
                setSelectedDocIds(new Set());
                setDocLimitHit(false);
              }}
              className="p-1 -ml-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </button>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isZh ? "搜索知识库或文件" : "Search knowledge bases or files"}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
            onKeyDown={(e) => {
               if (e.key === 'Escape') {
                 e.preventDefault();
                 onClose();
               }
            }}
          />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }} 
            className="p-1 -mr-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 overflow-y-auto min-h-[100px]">
        <div className="p-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="md" />
              <span className="text-xs text-muted-foreground animate-pulse">
                {lang === 'zh-CN' ? '正在连接知识引擎...' : 'Connecting to knowledge engine...'}
              </span>
            </div>
          ) : !selectedKb ? (
            filteredKbs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-2">
                <Library className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search 
                  ? (lang === 'zh-CN' ? "未找到匹配的知识库" : "No matching knowledge base found.")
                  : (lang === 'zh-CN' ? "您还没有创建知识库" : "You haven't created any knowledge base yet.")
                }
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentIds.length > 0 && !normalizedSearch && (
                <div className="px-2 pt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    {isZh ? '最近使用' : 'Recent'}
                  </div>
                  <div className="space-y-0.5">
                    {recentIds
                      .map((id) => byId.get(id))
                      .filter(Boolean)
                      .map((kb) => (
                        <button
                          key={kb!.id}
                          onClick={() => handleSelectKb(kb!)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                            "hover:bg-muted/60"
                          )}
                        >
                          <div className={cn(
                            "h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0",
                            "border border-border/40"
                          )}>
                            <Library className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate">
                              {kb!.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {getKnowledgeBaseDocumentCount(kb)} {isZh ? '个文档' : 'docs'}
                              </span>
                              {kb!.status && (
                                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] rounded-full">
                                  {String(kb!.status)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="px-2 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {isZh ? '全部知识库' : 'All knowledge bases'}
                </div>
                <div className="space-y-0.5">
                  {filteredKbs.map((kb) => (
                    <button
                      key={kb.id}
                      onClick={() => handleSelectKb(kb)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                        "hover:bg-muted/60"
                      )}
                    >
                      <div className={cn(
                        "h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0",
                        "border border-border/40"
                      )}>
                        <Library className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-semibold truncate">
                          {kb.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {getKnowledgeBaseDocumentCount(kb)} {isZh ? '个文档' : 'docs'}
                          </span>
                          {kb.status && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] rounded-full">
                              {String(kb.status)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )) : (
            <div className="p-2 space-y-2">
              <div className="px-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{isZh ? '已选择知识库' : 'Selected knowledge base'}</div>
                    <div className="text-sm font-semibold truncate">{selectedKb.name}</div>
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px] shrink-0">
                    {getKnowledgeBaseDocumentCount(selectedKb)} {isZh ? '文档' : 'docs'}
                  </Badge>
                </div>
              </div>

              <div className="px-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {isZh ? '文件（可选）' : 'Files (optional)'}
                </div>
                {docsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isZh ? '加载文件列表…' : 'Loading files…'}</span>
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {normalizedSearch ? (isZh ? '未找到匹配文件' : 'No matching files') : (isZh ? '该知识库暂无文档' : 'No documents in this knowledge base')}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredDocs.map((doc) => {
                      const checked = selectedDocIds.has(String(doc.id));
                      const status = String(doc.parse_status || '').toLowerCase();
                      const isFailed = status === 'failed';
                      const isDone = status === 'completed';
                      const name = String(doc.file_name || doc.title || 'Untitled');
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleToggleDoc(doc)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors',
                            'border border-transparent',
                            'hover:bg-muted/60',
                            checked && 'bg-muted/80 border-border'
                          )}
                        >
                          <div
                            className={cn(
                              'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                              checked
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-border'
                            )}
                          >
                            {checked ? <span className="text-[10px] leading-none">✓</span> : null}
                          </div>
                          <div className="h-8 w-8 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-slate-500" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium truncate">{name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {status ? (
                                <Badge
                                  variant={isFailed ? 'destructive' : isDone ? 'secondary' : 'outline'}
                                  className="h-4 px-1.5 text-[9px] rounded-full"
                                >
                                  {status}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {docLimitHit && (
                  <div className="px-3 pt-2 text-xs text-destructive">
                    {isZh ? `最多选择 ${MAX_DOCS} 个文件` : `Select up to ${MAX_DOCS} files`}
                  </div>
                )}

                <div className="px-3 pt-2 text-[11px] text-muted-foreground">
                  {isZh
                    ? '不选择文件时：检索该知识库全部文档'
                    : 'If no files are selected: search across all documents in this knowledge base'}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="px-3 py-2 border-t border-border/50 bg-muted/30 text-[10px] text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 rounded-lg text-[11px]"
            onClick={handleClear}
          >
            {isZh ? '清空选择' : 'Clear'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 rounded-lg text-[11px]"
            onClick={() => {
              onOpenManager?.();
              onClose();
            }}
          >
            {isZh ? '去管理' : 'Manage'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 opacity-60">
            <kbd className="px-1 rounded bg-background border border-border shadow-sm">ESC</kbd>
            <span>{isZh ? '关闭' : 'Close'}</span>
          </div>
          <Button
            size="sm"
            className="h-7 px-3 rounded-lg"
            onClick={() => {
              handleApply();
              onClose();
            }}
          >
            {isZh ? '应用' : 'Apply'}
          </Button>
        </div>
      </div>
    </div>
  );
}
