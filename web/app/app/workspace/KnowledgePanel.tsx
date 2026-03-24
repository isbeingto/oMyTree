"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Library, 
  Plus, 
  Search, 
  MoreHorizontal, 
  Trash2, 
  FileText, 
  Database, 
  Clock, 
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertCircle,
  Upload,
  File,
  X,
  CheckCircle2,
  AlertTriangle,
  History,
  Settings as SettingsIcon,
  Play,
  MessageSquare,
  Settings2,
  Quote,
  Target,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  Pencil,
  Milestone
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { t, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { 
  createKnowledgeBase, 
  listKnowledgeBases,
  getKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeDocuments,
  listKnowledgeBaseActivity,
  uploadKnowledgeDocumentFile,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  getKnowledgeDocumentDownloadUrl,
  getKnowledgeDocumentChunks,
  searchKnowledgeBase,
  updateKnowledgeDocument
} from '@/lib/api';
import type { KnowledgeBase, KnowledgeDocument, KnowledgeSearchChunk } from '@/lib/types/knowledge';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

/** Name of the system-managed outcome assets knowledge base */
const OUTCOME_ASSETS_KB_NAME = '成果资产库';

/** Check if a KB is the special outcome assets KB */
function isOutcomeAssetsKb(kb: KnowledgeBase): boolean {
  return typeof kb.name === 'string' && kb.name.trim() === OUTCOME_ASSETS_KB_NAME;
}

interface KnowledgePanelProps {
  lang: Lang;
  onClose: () => void;
  initialBaseId?: string | null;
  initialDocId?: string | null;
  userId?: string | null;
}

/**
 * KB-1.3: Knowledge Base Card component for listing
 */
function KnowledgeBaseCard({ 
  kb, 
  lang, 
  onManage,
  onDelete,
}: { 
  kb: KnowledgeBase; 
  lang: Lang; 
  onManage: (id: string) => void;
  onDelete: (kb: KnowledgeBase) => void;
}) {
  const isOutcomeAssets = isOutcomeAssetsKb(kb);
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return t(lang, 'app_date_today');
      if (diffDays === 1) return t(lang, 'app_date_yesterday');
      if (diffDays < 7) return t(lang, 'knowledge_days_ago').replace('{count}', String(diffDays));
      
      return date.toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const isMounted = kb.status === 'ready' || kb.status === 'active';
  const docCount = Number(
    (kb as any).document_count ??
    (kb as any).knowledge_count ??
    (kb as any).knowledgeCount ??
    (kb as any).file_count ??
    0
  );

  return (
    <Card className={cn(
      "group rounded-[1.5rem] backdrop-blur-md hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition-all duration-300",
      isOutcomeAssets
        ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-900/10 hover:border-amber-500/50 hover:bg-amber-500/10 dark:hover:bg-amber-900/15 ring-1 ring-amber-500/10"
        : "border-border/40 bg-white/30 dark:bg-neutral-900/30 hover:border-primary/35 hover:bg-white/40 dark:hover:bg-neutral-900/40"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm",
                isOutcomeAssets
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25"
                  : isMounted
                    ? "bg-primary/10 text-primary border-primary/15"
                    : "bg-muted/30 text-muted-foreground border-border/40"
              )}
            >
              {isOutcomeAssets ? <Milestone className="h-5 w-5" /> : <Library className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-base font-black tracking-tight truncate">
                  {kb.name}
                </p>
                {isOutcomeAssets && (
                  <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400">
                    {t(lang, 'outcomes_capsule_label')}
                  </Badge>
                )}
                {kb.status === 'processing' && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full shrink-0">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t(lang, 'knowledge_status_processing')}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-muted-foreground/70 line-clamp-1 mt-0.5">
                {kb.description || t(lang, 'knowledge_no_description')}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-muted/60 group/more transition-colors shrink-0"
              >
                <MoreHorizontal className="h-4 w-4 transition-transform group-hover/more:rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl apple-glass shadow-xl border-border/40">
              {isOutcomeAssets ? (
                <DropdownMenuItem
                  className="text-muted-foreground rounded-xl m-1 cursor-default opacity-50"
                  onSelect={(e) => e.preventDefault()}
                  disabled
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  {t(lang, 'knowledge_system_library')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl m-1 cursor-pointer font-bold"
                  onSelect={(e) => {
                    e.preventDefault();
                    onDelete(kb);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t(lang, 'tree_delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/70">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="tabular-nums">{Number.isFinite(docCount) ? docCount : 0}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatDate(kb.updated_at || kb.created_at)}</span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl px-3 font-bold border-border/40 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
            onClick={() => onManage(kb.id)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            {t(lang, 'knowledge_manage')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KnowledgeBaseSkeleton() {
  return (
    <div className="rounded-[2rem] border border-border/40 p-6 space-y-5 bg-white/20 dark:bg-neutral-900/20 backdrop-blur-md animate-pulse">
      <div className="flex justify-between items-start">
        <div className="w-12 h-12 rounded-2xl bg-muted" />
        <div className="w-20 h-6 rounded-full bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-7 w-3/4 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded-lg bg-muted" />
      </div>
      <div className="flex gap-4">
        <div className="h-6 w-24 rounded-lg bg-muted" />
        <div className="h-6 w-24 rounded-lg bg-muted" />
      </div>
      <div className="flex gap-3 pt-2">
        <div className="h-10 flex-1 rounded-2xl bg-muted" />
        <div className="h-10 w-10 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

const DEFAULT_SEPARATORS: Array<{ label: string; value: string }> = [
  { label: '段落 (\\n\\n)', value: "\n\n" },
  { label: '换行 (\\n)', value: "\n" },
  { label: '中文句号 (。)', value: '。' },
  { label: '英文句号 (.)', value: '.' },
  { label: '问号 (?)', value: '?' },
  { label: '感叹号 (!)', value: '!' },
];

const createKbSchema = z.object({
  name: z
    .string()
    .min(1, '名称不能为空')
    .refine((v) => v.trim().length > 0, '名称不能只包含空格')
    .refine((v) => v.trim().length >= 2, '名称长度需在 2-40 字符')
    .refine((v) => v.trim().length <= 40, '名称长度需在 2-40 字符'),
  description: z.string().max(200, '描述最多 200 字符').optional().or(z.literal('')),
  chunkSize: z.number().min(100, '分块大小必须在 100-4000 之间').max(4000, '分块大小必须在 100-4000 之间'),
  overlap: z.number().min(0, '重叠大小必须在 0-500 之间').max(500, '重叠大小必须在 0-500 之间'),
  separators: z.array(z.string()).min(1, '至少选择一个分隔符'),
});

type CreateKbValues = z.infer<typeof createKbSchema>;

export function KnowledgePanel({ lang, onClose, initialBaseId = null, initialDocId = null, userId = null }: KnowledgePanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBaseId, setActiveBaseId] = useState<string | null>(initialBaseId);

  // KB-1.4: Sync activeBaseId from props (e.g. browser back button)
  useEffect(() => {
    if (initialBaseId !== activeBaseId) {
      setActiveBaseId(initialBaseId);
    }
  }, [initialBaseId]);

  // Sync activeBaseId to URL for refresh persistence (Issue 3)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const currentKb = params.get('kb') || params.get('base') || params.get('baseId');
    
    if (activeBaseId && currentKb !== activeBaseId) {
      params.set('kb', activeBaseId);
      router.replace(`${pathname}?${params.toString()}`);
    } else if (!activeBaseId && currentKb) {
      params.delete('kb');
      params.delete('base');
      params.delete('baseId');
      params.delete('doc');
      params.delete('docId');
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [activeBaseId, pathname, router, searchParams]);

  const [highlightDocId, setHighlightDocId] = useState<string | null>(
    typeof initialDocId === 'string' && initialDocId.trim().length > 0 ? initialDocId.trim() : null
  );
  
  // KB-1.5: Active base details & documents
  const [activeBase, setActiveBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('documents');
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, { prog: number, name: string }>>({});

  // KB-RENAME: Document rename state
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Document sorting & filtering (Issue 1)
  const [docFilter, setDocFilter] = useState<'all' | 'doc' | 'sheet' | 'image' | 'other'>('all');
  const [docSort, setDocSort] = useState<'name' | 'time' | 'size'>('time');
  const [docSortOrder, setDocSortOrder] = useState<'asc' | 'desc'>('desc');
  const [docSearchQuery, setDocSearchQuery] = useState('');

  const processedDocuments = useMemo(() => {
    let result = [...documents];

    // Search filter
    if (docSearchQuery.trim()) {
      const q = docSearchQuery.toLowerCase();
      result = result.filter(doc => 
        (doc.file_name || '').toLowerCase().includes(q) || 
        (doc.title || '').toLowerCase().includes(q)
      );
    }

    // Filter by type
    if (docFilter !== 'all') {
      result = result.filter(doc => {
        const ext = (doc.file_name || '').toLowerCase();
        if (docFilter === 'doc') {
          return ext.endsWith('.pdf') || ext.endsWith('.doc') || ext.endsWith('.docx') || ext.endsWith('.txt') || ext.endsWith('.md');
        }
        if (docFilter === 'sheet') {
          return ext.endsWith('.xls') || ext.endsWith('.xlsx') || ext.endsWith('.csv');
        }
        if (docFilter === 'image') {
          return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.webp');
        }
        if (docFilter === 'other') {
          const matched = ext.endsWith('.pdf') || ext.endsWith('.doc') || ext.endsWith('.docx') || ext.endsWith('.txt') || ext.endsWith('.md') ||
                          ext.endsWith('.xls') || ext.endsWith('.xlsx') || ext.endsWith('.csv') ||
                          ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.webp');
          return !matched;
        }
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (docSort === 'name') {
        comparison = (a.file_name || '').localeCompare(b.file_name || '');
      } else if (docSort === 'time') {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        comparison = timeA - timeB;
      } else if (docSort === 'size') {
        comparison = (a.file_size || 0) - (b.file_size || 0);
      }

      return docSortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [documents, docFilter, docSort, docSortOrder]);

  const getFileIcon = (doc: KnowledgeDocument) => {
    const fileName = (doc.file_name || doc.title || '').toLowerCase();
    const fileType = (doc.file_type || '').toLowerCase();
    
    if (fileName.endsWith('.pdf') || fileType === 'pdf') {
       return <FileText className="h-5 w-5 text-rose-500" />;
    }
    if (fileName.endsWith('.doc') || fileName.endsWith('.docx') || fileType === 'doc' || fileType === 'docx') {
       return <FileText className="h-5 w-5 text-blue-500" />;
    }
    if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv') || fileType === 'xlsx' || fileType === 'csv') {
       return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
    }
    if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp') || fileType === 'image') {
       return <ImageIcon className="h-5 w-5 text-amber-500" />;
    }
    if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileType === 'txt' || fileType === 'md') {
       return <FileCode className="h-5 w-5 text-slate-500" />;
    }
    return <File className="h-5 w-5 text-primary/60" />;
  };

  // KB-1.6: Playground Search
  const [playgroundQuery, setPlaygroundQuery] = useState('');
  const [playgroundResults, setPlaygroundResults] = useState<any[]>([]);
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [playgroundTopK, setPlaygroundTopK] = useState(5);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingKb, setIsDeletingKb] = useState(false);
  const [deleteTargetKb, setDeleteTargetKb] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<KnowledgeDocument | null>(null);
  const [detailChunks, setDetailChunks] = useState<KnowledgeSearchChunk[]>([]);
  const [detailChunkMeta, setDetailChunkMeta] = useState<{ page: number; page_size: number; total: number } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadingMore, setDetailLoadingMore] = useState(false);
  const [detailDownloadUrl, setDetailDownloadUrl] = useState<string | null>(null);

  const [docxPreviewDocId, setDocxPreviewDocId] = useState<string | null>(null);
  const [docxPreviewHtml, setDocxPreviewHtml] = useState<string | null>(null);
  const [docxPreviewLoading, setDocxPreviewLoading] = useState(false);
  const [docxPreviewError, setDocxPreviewError] = useState<string | null>(null);

  const [textPreviewDocId, setTextPreviewDocId] = useState<string | null>(null);
  const [textPreviewText, setTextPreviewText] = useState<string | null>(null);
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [textPreviewError, setTextPreviewError] = useState<string | null>(null);

  const [tablePreviewDocId, setTablePreviewDocId] = useState<string | null>(null);
  const [tablePreviewData, setTablePreviewData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [tablePreviewLoading, setTablePreviewLoading] = useState(false);
  const [tablePreviewError, setTablePreviewError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

  type UploadPreset = {
    key: string;
    labelZh: string;
    labelEn: string;
    descriptionZh: string;
    descriptionEn: string;
    icon: React.ElementType;
    accept: string;
  };

  const uploadPresets: UploadPreset[] = [
    {
      key: 'pdf',
      labelZh: 'PDF 文档',
      labelEn: 'PDF Document',
      descriptionZh: '论文、报告、电子书 (.pdf)',
      descriptionEn: 'Papers, reports, ebooks (.pdf)',
      icon: FileDown,
      accept: '.pdf,application/pdf',
    },
    {
      key: 'word',
      labelZh: 'Word 文件夹',
      labelEn: 'Word Document',
      descriptionZh: '文档、讲稿、书稿 (.doc, .docx)',
      descriptionEn: 'Docs, manuscripts, drafts (.doc, .docx)',
      icon: FileText,
      accept:
        '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      key: 'sheet',
      labelZh: '表格与数据',
      labelEn: 'Spreadsheets',
      descriptionZh: 'Excel、CSV 财务报表与数据表',
      descriptionEn: 'Excel, CSV financial or data sheets',
      icon: FileSpreadsheet,
      accept: '.csv,.xls,.xlsx',
    },
    {
      key: 'image',
      labelZh: '图片资料',
      labelEn: 'Images',
      descriptionZh: '支持 OCR 识别 (PNG, JPG, JPEG)',
      descriptionEn: 'OCR enabled (PNG, JPG, JPEG)',
      icon: ImageIcon,
      accept: '.png,.jpg,.jpeg,.gif,image/*',
    },
    {
      key: 'text',
      labelZh: '文本与 Markdown',
      labelEn: 'Text & Markdown',
      descriptionZh: '纯文本、代码、MD 笔记 (.txt, .md)',
      descriptionEn: 'Plain text, code, MD notes (.txt, .md)',
      icon: FileCode,
      accept: '.txt,.md,.markdown,text/plain,text/markdown',
    },
  ];

  const authRequiredMsg = lang === 'zh-CN' ? '需要登录后才能使用知识库。' : 'Please sign in to use knowledge bases.';

  const normalizeDisplayFilename = (value?: string | null) => {
    if (!value) return value;
    const s = String(value);
    if (!s) return s;
    // If it already contains CJK characters, assume it's correct.
    if (/[\u4E00-\u9FFF]/.test(s)) return s;

    // Heuristic: UTF-8 bytes interpreted as latin1 commonly yields Ã / Â sequences.
    const latin1Count = (s.match(/[\u00C0-\u00FF]/g) || []).length;
    const looksMojibake = /[ÃÂ]/.test(s) || latin1Count >= 3;
    if (!looksMojibake) return s;

    try {
      // Convert from latin1-ish string back to UTF-8.
      // escape() encodes each code unit as %xx, decodeURIComponent decodes as UTF-8.
      const recovered = decodeURIComponent(escape(s));
      return recovered || s;
    } catch {
      return s;
    }
  };

  type PreviewKind = 'pdf' | 'docx' | 'image' | 'markdown' | 'text' | 'table' | 'other';
  const detectPreviewKind = (fileTypeRaw: string, filenameRaw: string): PreviewKind => {
    const fileType = String(fileTypeRaw || '').toLowerCase();
    const filename = String(filenameRaw || '').toLowerCase();

    const isPdf = fileType.includes('pdf') || filename.endsWith('.pdf');
    if (isPdf) return 'pdf';

    const isDocx = fileType.includes('docx') || filename.endsWith('.docx');
    if (isDocx) return 'docx';

    const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|tiff)$/.test(filename);
    if (isImage) return 'image';

    const isMarkdown = fileType.includes('markdown') || /\.(md|markdown)$/.test(filename);
    if (isMarkdown) return 'markdown';

    const isCsv = fileType.includes('csv') || filename.endsWith('.csv');
    const isExcel =
      fileType.includes('excel') ||
      fileType.includes('spreadsheet') ||
      /\.(xls|xlsx)$/.test(filename);
    if (isCsv || isExcel) return 'table';

    const isText = fileType.startsWith('text/') || /\.(txt|log|json|yaml|yml)$/.test(filename);
    if (isText) return 'text';

    return 'other';
  };

  const parseCsvToGrid = (csvText: string, maxRows = 60, maxCols = 20): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    const pushCell = () => {
      if (row.length >= maxCols) {
        cell = '';
        return;
      }
      row.push(cell);
      cell = '';
    };
    const pushRow = () => {
      if (rows.length >= maxRows) {
        row = [];
        return;
      }
      // Trim trailing empty cells
      let end = row.length;
      while (end > 0 && String(row[end - 1] ?? '').trim() === '') end -= 1;
      rows.push(row.slice(0, end));
      row = [];
    };

    for (let i = 0; i < csvText.length; i += 1) {
      const ch = csvText[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = csvText[i + 1];
          if (next === '"') {
            cell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        pushCell();
      } else if (ch === '\n') {
        pushCell();
        pushRow();
        if (rows.length >= maxRows) break;
      } else if (ch === '\r') {
        // ignore
      } else {
        cell += ch;
      }
    }

    // Flush last row
    if (cell.length > 0 || row.length > 0) {
      pushCell();
      pushRow();
    }

    return rows;
  };

  const form = useForm<CreateKbValues>({
    resolver: zodResolver(createKbSchema),
    defaultValues: {
      name: '',
      description: '',
      chunkSize: 512,
      overlap: 100,
      separators: DEFAULT_SEPARATORS.slice(0, 4).map((s) => s.value),
    },
    mode: 'onChange',
  });

  const settingsForm = useForm<CreateKbValues>({
    resolver: zodResolver(createKbSchema),
    defaultValues: {
      name: '',
      description: '',
      chunkSize: 512,
      overlap: 100,
      separators: DEFAULT_SEPARATORS.slice(0, 4).map((s) => s.value),
    },
    mode: 'onChange',
  });

  const fetchKbs = async (overrideUserId?: string | null) => {
    const effectiveUserId = overrideUserId ?? userId;
    if (!effectiveUserId) {
      setKbs([]);
      setLoading(false);
      setError(authRequiredMsg);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await listKnowledgeBases({ userId: effectiveUserId });
      // listKnowledgeBases uses request<T>() which throws if response.ok is false
      setKbs(res.data || []);
    } catch (err: any) {
      console.error('[KB] Fetch error:', err);
      setError(err.message);
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_load_failed'),
        description: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbs(userId);
  }, [userId]);

  const handlePlaygroundSearch = async () => {
    if (!playgroundQuery.trim() || !activeBaseId) return;
    setPlaygroundLoading(true);
    setPlaygroundResults([]);
    try {
      const res = await searchKnowledgeBase(activeBaseId, {
        query_text: playgroundQuery.trim(),
        match_count: playgroundTopK
      }, { userId });
      setPlaygroundResults(res.data || []);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_search_failed'),
        description: err.message
      });
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const handleSendToChat = () => {
    if (!playgroundQuery.trim()) return;
    toast({
      title: t(lang, 'toast_kb_redirect_soon'),
      description: t(lang, 'toast_kb_redirect_soon_desc')
    });
  };

  // KB-1.5: Data fetching for active base
  const fetchBaseDetails = async (id: string) => {
    try {
      const res = await getKnowledgeBase(id, { userId });
      setActiveBase(res.data);
    } catch (err: any) {
      console.error('[KB] Fetch base error:', err);
    }
  };

  const fetchDocuments = async (id: string) => {
    setDocsLoading(true);
    try {
      const res = await listKnowledgeDocuments(id, { userId });
      setDocuments(res.data || []);
    } catch (err: any) {
      console.error('[KB] Fetch docs error:', err);
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_docs_load_failed'),
        description: err.message
      });
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (activeBase) {
      settingsForm.reset({
        name: activeBase.name || '',
        description: activeBase.description || '',
        chunkSize: (activeBase as any).chunk_size || 512,
        overlap: (activeBase as any).overlap || 100,
        separators: (activeBase as any).separators || DEFAULT_SEPARATORS.slice(0, 4).map((s) => s.value),
      });
    }
  }, [activeBase, settingsForm]);

  const fetchActivity = async (id: string) => {
    setActivitiesLoading(true);
    try {
      const res = await listKnowledgeBaseActivity(id, { userId });
      setActivities(res.data || []);
    } catch (err: any) {
      console.error('[KB] Fetch activity error:', err);
    } finally {
      setActivitiesLoading(false);
    }
  };

  useEffect(() => {
    if (activeBaseId) {
      fetchBaseDetails(activeBaseId);
      fetchDocuments(activeBaseId);
      fetchActivity(activeBaseId);
      setActiveTab('documents');
    } else {
      setActiveBase(null);
      setDocuments([]);
      setActivities([]);
    }
  }, [activeBaseId, userId]);

  // Polling for processing documents
  useEffect(() => {
    if (!activeBaseId || documents.length === 0) return;

    const hasProcessing = documents.some((doc) => {
      return doc.parse_status === 'pending' || doc.parse_status === 'processing' || doc.parse_status === 'indexing';
    });

    if (!hasProcessing) return;

    const timer = setInterval(() => {
      fetchDocuments(activeBaseId);
    }, 5000);

    return () => clearInterval(timer);
  }, [activeBaseId, documents]);

  useEffect(() => {
    if (!highlightDocId) return;
    if (activeTab !== 'documents') return;
    const exists = documents.some((d) => String(d.id) === String(highlightDocId));
    if (!exists) return;

    const el = typeof document !== 'undefined' ? document.getElementById(`kb-doc-${highlightDocId}`) : null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const timer = window.setTimeout(() => {
      setHighlightDocId(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [highlightDocId, documents, activeTab]);

  useEffect(() => {
    if (!createOpen) {
      setCreateError(null);
      form.reset({
        name: '',
        description: '',
        chunkSize: 512,
        overlap: 100,
        separators: DEFAULT_SEPARATORS.slice(0, 4).map((s) => s.value),
      });
    }
  }, [createOpen, form]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeBaseId) return;

    const fileList = Array.from(files);
    
    for (const file of fileList) {
      if (file.size > 50 * 1024 * 1024) {
        toast({
          variant: 'destructive',
          title: t(lang, 'toast_kb_file_too_large'),
          description: `${t(lang, 'toast_kb_file_too_large')}: ${file.name}`
        });
        continue;
      }

      const uploadId = Math.random().toString(36).substring(7);
      setUploadingFiles(prev => ({ ...prev, [uploadId]: { prog: 10, name: file.name } }));

      try {
        await uploadKnowledgeDocumentFile(activeBaseId, file, {}, { userId });
        setUploadingFiles(prev => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
        toast({
          title: t(lang, 'toast_kb_upload_success'),
          description: file.name
        });
        fetchDocuments(activeBaseId);
      } catch (err: any) {
        setUploadingFiles(prev => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });

        const status = err?.status;
        const code = err?.code;
        const detail = err?.detail;

        if (status === 409 && (code === 'duplicate_file' || String(err?.message || '').includes('duplicate_file'))) {
          const existing = (detail && typeof detail === 'object' && (detail as any).data) ? (detail as any).data : null;
          const existingId = existing?.id ? String(existing.id) : null;
          const existingName = existing?.title || existing?.file_name || existing?.fileName || file.name;

          toast({
            variant: 'destructive',
            title: t(lang, 'toast_kb_file_duplicate'),
            description: `${t(lang, 'toast_kb_file_duplicate_desc')}: ${String(existingName)}`,
            action: existingId ? (
              <ToastAction
                altText={lang === 'zh-CN' ? '定位' : 'Locate'}
                onClick={() => {
                  setActiveTab('documents');
                  setHighlightDocId(existingId);
                  fetchDocuments(activeBaseId);
                }}
              >
                {lang === 'zh-CN' ? '定位' : 'Locate'}
              </ToastAction>
            ) : undefined,
          });
          continue;
        }

        toast({
          variant: 'destructive',
          title: t(lang, 'toast_kb_upload_failed'),
          description: err.message
        });
      }
    }
    // Reset input
    if (e.target.value) e.target.value = '';
  };

  const openUploadDialog = (preset: UploadPreset) => {
    const input = uploadInputRef.current;
    if (!input) return;
    input.accept = preset.accept;
    // Allow selecting the same filename twice in a row.
    input.value = '';
    input.click();
  };

  const handleUpdateSettings = async (values: CreateKbValues) => {
    if (!activeBaseId) return;
    setIsSavingSettings(true);
    try {
      await updateKnowledgeBase(activeBaseId, values, { userId });
      toast({
        title: t(lang, 'toast_kb_settings_saved'),
        description: t(lang, 'toast_kb_settings_saved_desc'),
      });
      fetchBaseDetails(activeBaseId);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_save_failed'),
        description: err.message
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeleteKb = async () => {
    const targetId = deleteTargetKb?.id || activeBaseId;
    if (!targetId) return;
    setIsDeletingKb(true);
    try {
      await deleteKnowledgeBase(targetId, { userId });
      setDeleteConfirmOpen(false);
      setDeleteTargetKb(null);
      setDeleteConfirmName("");
      if (activeBaseId === targetId) {
        setActiveBaseId(null);
        setActiveBase(null);
      }
      fetchKbs();
      toast({
        title: t(lang, 'toast_kb_deleted'),
        description: t(lang, 'toast_kb_deleted_desc')
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_delete_failed'),
        description: err.message
      });
    } finally {
      setIsDeletingKb(false);
    }
  };

  const openDeleteConfirm = (kb: { id: string; name?: string | null }) => {
    if (!kb?.id) return;
    setDeleteTargetKb({ id: kb.id, name: kb.name ? String(kb.name) : "" });
    setDeleteConfirmName("");
    setDeleteConfirmOpen(true);
  };

  const deleteTargetName = deleteTargetKb?.name || activeBase?.name || "";
  const deleteTargetId = deleteTargetKb?.id || activeBaseId || null;

  // KB-RENAME: Handle document rename
  const handleStartRename = (doc: KnowledgeDocument) => {
    setRenameDocId(doc.id);
    // Use title first, then file_name as fallback
    setRenameValue(doc.title || doc.file_name || '');
  };

  const handleCancelRename = () => {
    setRenameDocId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async () => {
    if (!renameDocId || !renameValue.trim()) return;
    
    setIsRenaming(true);
    try {
      await updateKnowledgeDocument(renameDocId, { title: renameValue.trim() }, { userId });
      toast({
        title: t(lang, 'toast_kb_doc_renamed')
      });
      // Update local state
      setDocuments(prev => prev.map(d => 
        d.id === renameDocId 
          ? { ...d, title: renameValue.trim(), file_name: renameValue.trim() } 
          : d
      ));
      handleCancelRename();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_doc_rename_failed'),
        description: err.message
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!activeBaseId) return;
    if (!confirm(lang === 'zh-CN' ? '确定要删除此文档吗？' : 'Delete this document?')) return;

    try {
      await deleteKnowledgeDocument(activeBaseId, docId, { userId });
      toast({
        title: t(lang, 'toast_kb_doc_deleted')
      });
      fetchDocuments(activeBaseId);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_doc_delete_failed'),
        description: err.message
      });
    }
  };

  const handleViewDetail = async (doc: KnowledgeDocument) => {
    if (doc.parse_status !== 'completed' && doc.parse_status !== 'ready') {
      // Don't show detail for non-ready docs
      return;
    }
    setDetailOpen(true);
    setDetailDoc(doc);
    setDetailLoading(true);
    setDetailChunks([]);
    setDetailChunkMeta(null);
    setDetailDownloadUrl(null);
    setDocxPreviewDocId(null);
    setDocxPreviewHtml(null);
    setDocxPreviewError(null);
    setDocxPreviewLoading(false);

    setTextPreviewDocId(null);
    setTextPreviewText(null);
    setTextPreviewError(null);
    setTextPreviewLoading(false);

    setTablePreviewDocId(null);
    setTablePreviewData(null);
    setTablePreviewError(null);
    setTablePreviewLoading(false);
    try {
      // Primary doc info from WeKnora /knowledge/:id
      const [docRes, chunksRes, downloadRes] = await Promise.all([
        getKnowledgeDocument(doc.id, { userId }),
        getKnowledgeDocumentChunks(doc.id, { page: 1, page_size: 25 }, { userId }),
        getKnowledgeDocumentDownloadUrl(doc.id, { userId })
      ]);
      setDetailDoc(docRes.data);
      setDetailChunks(chunksRes.data || []);
      setDetailDownloadUrl(typeof downloadRes?.data?.url === 'string' ? downloadRes.data.url : null);
      if (chunksRes && typeof (chunksRes as any).meta === 'object' && (chunksRes as any).meta) {
        const meta = (chunksRes as any).meta as any;
        if (typeof meta.page === 'number' && typeof meta.page_size === 'number' && typeof meta.total === 'number') {
          setDetailChunkMeta({ page: meta.page, page_size: meta.page_size, total: meta.total });
        }
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_detail_load_failed'),
        description: err.message
      });
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const docId = detailDoc?.id;
    const fileType = String(detailDoc?.file_type || '').toLowerCase();
    const filename = normalizeDisplayFilename(detailDoc?.file_name || detailDoc?.title || '');
    const isDocx = fileType.includes('docx') || String(filename || '').toLowerCase().endsWith('.docx');
    const downloadUrl = detailDownloadUrl;

    if (!detailOpen || !docId || !isDocx || !downloadUrl) {
      return;
    }

    // Avoid re-processing if we already generated HTML for this doc.
    if (docxPreviewDocId === docId && typeof docxPreviewHtml === 'string' && docxPreviewHtml.trim()) {
      return;
    }

    let cancelled = false;

    (async () => {
      setDocxPreviewDocId(docId);
      setDocxPreviewLoading(true);
      setDocxPreviewError(null);
      setDocxPreviewHtml(null);

      try {
        const resp = await fetch(downloadUrl);
        if (!resp.ok) {
          throw new Error(`DOCX preview download failed (${resp.status})`);
        }

        const arrayBuffer = await resp.arrayBuffer();

        const mammothModule: any = await import('mammoth/mammoth.browser');
        const mammoth: any = mammothModule?.default || mammothModule;
        const dompurifyModule: any = await import('dompurify');
        const DOMPurify: any = dompurifyModule?.default || dompurifyModule;

        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage: mammoth.images.inline(async (image: any) => {
              const base64 = await image.read('base64');
              const contentType = typeof image?.contentType === 'string' ? image.contentType : 'application/octet-stream';
              return { src: `data:${contentType};base64,${base64}` };
            }),
          }
        );

        const html = typeof result?.value === 'string' ? result.value : '';
        const safeHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

        if (!cancelled) {
          setDocxPreviewHtml(String(safeHtml || ''));
        }
      } catch (err: any) {
        if (!cancelled) {
          setDocxPreviewError(typeof err?.message === 'string' ? err.message : 'DOCX preview failed');
        }
      } finally {
        if (!cancelled) {
          setDocxPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailOpen, detailDoc?.id, detailDoc?.file_type, detailDoc?.file_name, detailDownloadUrl, docxPreviewDocId, docxPreviewHtml]);

  useEffect(() => {
    const docId = detailDoc?.id;
    const fileType = String(detailDoc?.file_type || '').toLowerCase();
    const filename = normalizeDisplayFilename(detailDoc?.file_name || detailDoc?.title || '');
    const downloadUrl = detailDownloadUrl;

    if (!detailOpen || !docId || !downloadUrl) return;

    const kind = detectPreviewKind(fileType, String(filename || ''));
    if (kind !== 'markdown' && kind !== 'text' && kind !== 'table') return;

    let cancelled = false;

    (async () => {
      try {
        if (kind === 'markdown' || kind === 'text') {
          if (textPreviewDocId === docId && typeof textPreviewText === 'string' && textPreviewText.trim()) {
            return;
          }

          setTextPreviewDocId(docId);
          setTextPreviewLoading(true);
          setTextPreviewError(null);
          setTextPreviewText(null);

          const resp = await fetch(downloadUrl);
          if (!resp.ok) throw new Error(`Text preview download failed (${resp.status})`);

          const text = await resp.text();
          const trimmed = text.length > 200_000 ? `${text.slice(0, 200_000)}\n\n…(truncated)` : text;

          if (!cancelled) setTextPreviewText(trimmed);
          return;
        }

        if (kind === 'table') {
          if (tablePreviewDocId === docId && tablePreviewData && tablePreviewData.headers.length > 0) {
            return;
          }

          setTablePreviewDocId(docId);
          setTablePreviewLoading(true);
          setTablePreviewError(null);
          setTablePreviewData(null);

          const lowerName = String(filename || '').toLowerCase();
          const isCsv = fileType.includes('csv') || lowerName.endsWith('.csv');

          if (isCsv) {
            const resp = await fetch(downloadUrl);
            if (!resp.ok) throw new Error(`CSV preview download failed (${resp.status})`);
            const csvText = await resp.text();
            const grid = parseCsvToGrid(csvText);
            const headers = grid.length > 0 ? grid[0].map((c) => String(c ?? '')) : [];
            const rows = grid.length > 1 ? grid.slice(1).map((r) => r.map((c) => String(c ?? ''))) : [];
            if (!cancelled) setTablePreviewData({ headers, rows });
            return;
          }

          const resp = await fetch(downloadUrl);
          if (!resp.ok) throw new Error(`Spreadsheet preview download failed (${resp.status})`);
          const arrayBuffer = await resp.arrayBuffer();

          const xlsxModule: any = await import('xlsx');
          const XLSX: any = xlsxModule?.default || xlsxModule;
          const wb = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = Array.isArray(wb?.SheetNames) && wb.SheetNames.length > 0 ? wb.SheetNames[0] : null;
          if (!sheetName) throw new Error('Spreadsheet preview: no sheets');
          const ws = wb.Sheets[sheetName];
          const gridRaw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as any[];

          const grid: string[][] = (Array.isArray(gridRaw) ? gridRaw : []).slice(0, 61).map((r: any) =>
            (Array.isArray(r) ? r : []).slice(0, 20).map((c: any) => String(c ?? ''))
          );

          const headers = grid.length > 0 ? grid[0] : [];
          const rows = grid.length > 1 ? grid.slice(1) : [];
          if (!cancelled) setTablePreviewData({ headers, rows });
        }
      } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : 'Preview failed';
        if (kind === 'table') {
          if (!cancelled) setTablePreviewError(msg);
        } else {
          if (!cancelled) setTextPreviewError(msg);
        }
      } finally {
        if (!cancelled) {
          if (kind === 'table') setTablePreviewLoading(false);
          if (kind === 'markdown' || kind === 'text') setTextPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailOpen, detailDoc?.id, detailDoc?.file_type, detailDoc?.file_name, detailDownloadUrl, textPreviewDocId, textPreviewText, tablePreviewDocId, tablePreviewData]);

  const handleLoadMoreChunks = async () => {
    if (!detailDoc?.id) return;
    if (!detailChunkMeta) return;
    if (detailLoadingMore) return;

    const nextPage = detailChunkMeta.page + 1;
    setDetailLoadingMore(true);
    try {
      const res = await getKnowledgeDocumentChunks(detailDoc.id, { page: nextPage, page_size: detailChunkMeta.page_size }, { userId });
      const next = Array.isArray(res.data) ? res.data : [];
      setDetailChunks((prev) => [...prev, ...next]);

      const meta = (res as any)?.meta;
      if (meta && typeof meta.page === 'number' && typeof meta.page_size === 'number' && typeof meta.total === 'number') {
        setDetailChunkMeta({ page: meta.page, page_size: meta.page_size, total: meta.total });
      } else {
        setDetailChunkMeta((prev) => prev ? ({ ...prev, page: nextPage }) : prev);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t(lang, 'toast_kb_load_more_failed'),
        description: err.message
      });
    } finally {
      setDetailLoadingMore(false);
    }
  };

  const filteredKbs = useMemo(() => {
    const matched = kbs.filter(kb => 
      kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (kb.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    // Sort: 成果资产库 always first
    return matched.sort((a, b) => {
      const aIsOutcome = isOutcomeAssetsKb(a);
      const bIsOutcome = isOutcomeAssetsKb(b);
      if (aIsOutcome && !bIsOutcome) return -1;
      if (!aIsOutcome && bIsOutcome) return 1;
      return 0;
    });
  }, [kbs, searchQuery]);

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
             <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" 
               style={{ backgroundImage: 'linear-gradient(to right, currentColor 0.8px, transparent 0.8px), linear-gradient(to bottom, currentColor 0.8px, transparent 0.8px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(ellipse 70% 58% at center, black 62%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 58% at center, black 62%, transparent 100%)' }} />
      </div>

      <header className="relative z-20 border-b border-border/40 backdrop-blur-xl bg-background/60 px-6 py-4 flex items-center justify-between transition-all duration-300">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-2.5 rounded-[1.25rem] bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-sm hidden xs:flex items-center justify-center">
              <Library className="h-6 w-6" />
            </div>
            <div>
              {activeBaseId ? (
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setActiveBaseId(null)}
                    className="text-xs sm:text-sm font-black text-muted-foreground/70 hover:text-primary transition-colors shrink-0"
                  >
                    {lang === 'zh-CN' ? '知识库' : 'Libraries'}
                  </button>
                  <ChevronRight className="h-4 w-4 opacity-30 shrink-0" />
                  <span className="text-xs sm:text-sm font-black text-foreground/90 truncate max-w-[52vw]">
                    {activeBase?.name || (lang === 'zh-CN' ? '知识库详情' : 'Knowledge Base')}
                  </span>
                </div>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground/90">
                    {lang === 'zh-CN' ? '我的知识库' : 'Knowledge Bases'}
                  </h1>
                  <p className="text-[11px] sm:text-xs text-muted-foreground/60 font-bold flex items-center gap-3 hidden xs:flex">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-primary/60">{lang === 'zh-CN' ? '库' : 'Libraries'}:</span>
                      <span className="tabular-nums text-foreground/80">{kbs.length}</span>
                    </span>
                    <span className="opacity-30">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-primary/60">{lang === 'zh-CN' ? '文档' : 'Docs'}:</span>
                      <span className="tabular-nums text-foreground/80">
                        {kbs.reduce((acc, curr) => acc + (Number((curr as any).document_count) || 0), 0)}
                      </span>
                    </span>
                    <span className="opacity-30">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">{lang === 'zh-CN' ? '运行中' : 'Active'}</span>
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!activeBaseId && (
            <div className="relative group hidden sm:block">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                <Search className="h-3.5 w-3.5" />
              </div>
              <Input
                className="h-10 pl-9 pr-4 rounded-xl border-border/40 bg-white/40 dark:bg-neutral-900/40 text-xs font-bold placeholder:text-muted-foreground/30 focus-visible:ring-primary/20 w-[180px] transition-all duration-300 focus:w-[280px]"
                placeholder={lang === 'zh-CN' ? '搜索知识库...' : 'Search libraries...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {activeBaseId && (
            <div className="hidden lg:flex items-center gap-5 bg-white/30 dark:bg-neutral-900/30 px-5 py-2.5 rounded-[1.25rem] border border-border/40 backdrop-blur-xl shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600/55">
                  {lang === 'zh-CN' ? '文件' : 'Total'}
                </span>
                <span className="text-sm font-black tabular-nums text-foreground/85">{documents.length}</span>
              </div>
              <div className="w-[1px] h-5 bg-border/40" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600/55">
                  {lang === 'zh-CN' ? '已解析' : 'Parsed'}
                </span>
                <span className="text-sm font-black tabular-nums text-foreground/85">
                  {documents.filter(d => d.parse_status === 'completed' || d.parse_status === 'ready').length}
                </span>
              </div>
              <div className="w-[1px] h-5 bg-border/40" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-600/55">
                  {lang === 'zh-CN' ? '队列' : 'Queue'}
                </span>
                <span className="text-sm font-black tabular-nums text-foreground/85">
                  {documents.filter(d => d.parse_status === 'pending' || d.parse_status === 'processing' || d.parse_status === 'indexing').length}
                </span>
              </div>
            </div>
          )}

          {!activeBaseId && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!userId}
              className="rounded-2xl h-10 px-5 bg-foreground text-background hover:bg-foreground/90 font-bold shadow-lg transition-all duration-300 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{lang === 'zh-CN' ? '新建知识库' : 'New Library'}</span>
            </Button>
          )}
        </div>
      </header>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{lang === 'zh-CN' ? '新建知识库' : 'Create Knowledge Base'}</DialogTitle>
            <DialogDescription>
              {lang === 'zh-CN'
                ? '填写基本信息，并可选配置分块参数。'
                : 'Fill in basic info and optionally tune chunking settings.'}
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              setCreateError(null);
              setCreating(true);
              try {
                if (!userId) {
                  setCreateError(authRequiredMsg);
                  return;
                }

                const payload = {
                  name: values.name.trim(),
                  description: values.description?.trim() ? values.description.trim() : undefined,
                  chunking_config: {
                    chunk_size: values.chunkSize,
                    chunk_overlap: values.overlap,
                    separators: values.separators,
                  },
                };

                const res = await createKnowledgeBase(payload, { userId });
                toast({
                  title: t(lang, 'toast_kb_created'),
                  description: res?.data?.name ? `${res.data.name}` : undefined,
                });
                if (res?.data?.id) {
                  setActiveBaseId(res.data.id);
                }
                setCreateOpen(false);
                await fetchKbs();
              } catch (err: any) {
                const msg = typeof err?.message === 'string' ? err.message : (lang === 'zh-CN' ? '创建失败' : 'Create failed');
                setCreateError(msg);
              } finally {
                setCreating(false);
              }
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="kb-name">{lang === 'zh-CN' ? '名称' : 'Name'}</Label>
              <Input
                id="kb-name"
                placeholder={lang === 'zh-CN' ? '2-40 字符' : '2-40 characters'}
                className="rounded-xl"
                {...form.register('name')}
              />
              {form.formState.errors.name?.message && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-desc">{lang === 'zh-CN' ? '描述（可选）' : 'Description (optional)'}</Label>
              <Textarea
                id="kb-desc"
                placeholder={lang === 'zh-CN' ? '最多 200 字符' : 'Up to 200 characters'}
                className="rounded-xl min-h-[88px]"
                {...form.register('description')}
              />
              {form.formState.errors.description?.message && (
                <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="chunking" className="border-b-0">
                <AccordionTrigger className="rounded-xl px-2 hover:bg-muted/40">
                  {lang === 'zh-CN' ? '分块设置（高级）' : 'Chunking (Advanced)'}
                </AccordionTrigger>
                <AccordionContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="kb-chunk">chunk size</Label>
                      <Input
                        id="kb-chunk"
                        type="number"
                        min={100}
                        max={4000}
                        className="rounded-xl"
                        {...form.register('chunkSize', { valueAsNumber: true })}
                      />
                      {form.formState.errors.chunkSize?.message && (
                        <p className="text-xs text-destructive">{form.formState.errors.chunkSize.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="kb-overlap">overlap</Label>
                      <Input
                        id="kb-overlap"
                        type="number"
                        min={0}
                        max={500}
                        className="rounded-xl"
                        {...form.register('overlap', { valueAsNumber: true })}
                      />
                      {form.formState.errors.overlap?.message && (
                        <p className="text-xs text-destructive">{form.formState.errors.overlap.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label>{lang === 'zh-CN' ? '分隔符' : 'Separators'}</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {DEFAULT_SEPARATORS.map((opt) => {
                        const selected = form.watch('separators').includes(opt.value);
                        return (
                          <label
                            key={opt.value}
                            className={cn(
                              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer',
                              selected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border/50 hover:bg-muted/30'
                            )}
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const curr = form.getValues('separators');
                                const next = Boolean(checked)
                                  ? Array.from(new Set([...curr, opt.value]))
                                  : curr.filter((v) => v !== opt.value);
                                form.setValue('separators', next, { shouldValidate: true });
                              }}
                            />
                            <span className="text-xs sm:text-sm">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {form.formState.errors.separators?.message && (
                      <p className="text-xs text-destructive">{form.formState.errors.separators.message}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                {lang === 'zh-CN' ? '取消' : 'Cancel'}
              </Button>
              <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={creating}>
                {creating ? (lang === 'zh-CN' ? '创建中…' : 'Creating…') : (lang === 'zh-CN' ? '创建知识库' : 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* KB-RENAME: Rename document dialog */}
      <Dialog open={renameDocId !== null} onOpenChange={(open) => !open && handleCancelRename()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === 'zh-CN' ? '重命名文档' : 'Rename Document'}</DialogTitle>
            <DialogDescription>
              {lang === 'zh-CN'
                ? '输入新的文档名称。'
                : 'Enter a new name for this document.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-input">{lang === 'zh-CN' ? '文档名称' : 'Document Name'}</Label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder={lang === 'zh-CN' ? '输入文档名称' : 'Enter document name'}
                className="rounded-xl"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isRenaming) {
                    e.preventDefault();
                    handleConfirmRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelRename} disabled={isRenaming} className="rounded-xl">
              {lang === 'zh-CN' ? '取消' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleConfirmRename} 
              disabled={isRenaming || !renameValue.trim()}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
            >
              {isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {lang === 'zh-CN' ? '重命名中…' : 'Renaming…'}
                </>
              ) : (
                lang === 'zh-CN' ? '确定' : 'Confirm'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 rounded-[2rem] apple-glass shadow-2xl border-emerald-500/20">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-inner">
                <FileText className="h-6 w-6" />
              </div>
              <div className="flex flex-col min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight truncate pr-8">
                  {normalizeDisplayFilename(detailDoc?.file_name || detailDoc?.title || 'Unknown Document')}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] font-bold uppercase bg-emerald-500/5 text-emerald-600 border-emerald-500/20">
                    {detailDoc?.file_size ? `${(detailDoc.file_size / 1024).toFixed(1)} KB` : 'PDF'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {detailDoc?.updated_at ? new Date(detailDoc.updated_at).toLocaleString() : ''}
                  </span>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-8 custom-scrollbar">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Spinner size="xl" />
                <p className="text-sm font-bold text-muted-foreground animate-pulse">
                  {lang === 'zh-CN' ? '正在提取文档分块与全文...' : 'Extracting content and chunks...'}
                </p>
              </div>
            ) : (
              <>
                <Tabs defaultValue="preview" className="space-y-5">
                  <TabsList className="bg-background/40 border border-border/40 p-1 rounded-2xl apple-glass h-11">
                    <TabsTrigger value="preview" className="rounded-xl px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-emerald-500 data-[state=active]:shadow-sm transition-all duration-300">
                      <File className="h-4 w-4 mr-2" />
                      {lang === 'zh-CN' ? '阅读预览' : 'Reader'}
                    </TabsTrigger>
                    <TabsTrigger value="chunks" className="rounded-xl px-4 py-2 data-[state=active]:bg-background data-[state=active]:text-emerald-500 data-[state=active]:shadow-sm transition-all duration-300">
                      <Target className="h-4 w-4 mr-2" />
                      {(() => {
                        const total = detailChunkMeta?.total ?? detailChunks.length;
                        return lang === 'zh-CN'
                          ? `知识分块 (${detailChunks.length}/${total})`
                          : `Chunks (${detailChunks.length}/${total})`;
                      })()}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-0 space-y-4 outline-none">
                    {(() => {
                      const docId = detailDoc?.id;
                      if (!docId) {
                        return (
                          <div className="p-8 text-center rounded-3xl border border-dashed border-border/60 bg-muted/10">
                            <p className="text-sm text-muted-foreground font-medium">
                              {lang === 'zh-CN' ? '暂无可预览内容' : 'No preview available'}
                            </p>
                          </div>
                        );
                      }

                      const filename = normalizeDisplayFilename(detailDoc?.file_name || detailDoc?.title || 'document');
                      const fileType = String(detailDoc?.file_type || '').toLowerCase();
                      const kind = detectPreviewKind(fileType, String(filename || ''));
                      const downloadUrl = detailDownloadUrl || '';

                      return (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground font-medium truncate">
                              {lang === 'zh-CN' ? '原文件预览（推荐）' : 'Original file preview (recommended)'}
                            </div>
                            <Button asChild variant="outline" size="sm" className="rounded-xl">
                              <a href={downloadUrl || '#'} target="_blank" rel="noreferrer" aria-disabled={!downloadUrl}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                {lang === 'zh-CN' ? '打开原文件' : 'Open'}
                              </a>
                            </Button>
                          </div>

                          {kind === 'pdf' && downloadUrl ? (
                            <div className="rounded-3xl border border-border/40 overflow-hidden bg-background">
                              <iframe
                                title={typeof filename === 'string' ? filename : 'document'}
                                src={downloadUrl}
                                className="w-full h-[70vh]"
                              />
                            </div>
                          ) : kind === 'docx' && downloadUrl ? (
                            <div className="rounded-3xl border border-border/40 overflow-hidden bg-background">
                              {docxPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                  <Spinner size="xl" />
                                  <p className="text-sm font-bold text-muted-foreground animate-pulse">
                                    {lang === 'zh-CN' ? '正在生成 DOCX 预览…' : 'Rendering DOCX preview…'}
                                  </p>
                                </div>
                              ) : docxPreviewError ? (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? `DOCX 预览失败：${docxPreviewError}（可点击“打开原文件”下载/新标签打开）`
                                        : `DOCX preview failed: ${docxPreviewError}. Use “Open” to download/view.`}
                                    </div>
                                  </div>
                                </div>
                              ) : docxPreviewHtml ? (
                                <div className="w-full h-[70vh] overflow-auto p-6">
                                  <div
                                    className="prose prose-slate dark:prose-invert max-w-none"
                                    dangerouslySetInnerHTML={{ __html: docxPreviewHtml }}
                                  />
                                </div>
                              ) : (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? 'DOCX 预览暂不可用（可点击“打开原文件”下载/在新标签页打开）。'
                                        : 'DOCX preview is unavailable. Use “Open” to download/view.'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : kind === 'image' && downloadUrl ? (
                            <div className="rounded-3xl border border-border/40 overflow-hidden bg-background">
                              <div className="w-full h-[70vh] overflow-auto p-4 flex items-center justify-center">
                                <img
                                  src={downloadUrl}
                                  alt={typeof filename === 'string' ? filename : 'image'}
                                  className="max-h-full max-w-full object-contain rounded-2xl border border-border/40"
                                  loading="lazy"
                                />
                              </div>
                            </div>
                          ) : (kind === 'markdown' || kind === 'text') && downloadUrl ? (
                            <div className="rounded-3xl border border-border/40 overflow-hidden bg-background">
                              {textPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                  <Spinner size="xl" />
                                  <p className="text-sm font-bold text-muted-foreground animate-pulse">
                                    {lang === 'zh-CN' ? '正在生成预览…' : 'Rendering preview…'}
                                  </p>
                                </div>
                              ) : textPreviewError ? (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? `预览失败：${textPreviewError}（可点击“打开原文件”下载/新标签打开）`
                                        : `Preview failed: ${textPreviewError}. Use “Open” to download/view.`}
                                    </div>
                                  </div>
                                </div>
                              ) : typeof textPreviewText === 'string' ? (
                                <div className="w-full h-[70vh] overflow-auto p-6">
                                  {kind === 'markdown' ? (
                                    <div className="prose prose-slate dark:prose-invert max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {textPreviewText}
                                      </ReactMarkdown>
                                    </div>
                                  ) : (
                                    <pre className="text-sm leading-6 whitespace-pre-wrap break-words text-foreground/85 font-mono">
                                      {textPreviewText}
                                    </pre>
                                  )}
                                </div>
                              ) : (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? '预览暂不可用（可点击“打开原文件”下载/在新标签页打开）。'
                                        : 'Preview is unavailable. Use “Open” to download/view.'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : kind === 'table' && downloadUrl ? (
                            <div className="rounded-3xl border border-border/40 overflow-hidden bg-background">
                              {tablePreviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                  <Spinner size="xl" />
                                  <p className="text-sm font-bold text-muted-foreground animate-pulse">
                                    {lang === 'zh-CN' ? '正在生成表格预览…' : 'Rendering table preview…'}
                                  </p>
                                </div>
                              ) : tablePreviewError ? (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? `表格预览失败：${tablePreviewError}（可点击“打开原文件”下载/新标签打开）`
                                        : `Table preview failed: ${tablePreviewError}. Use “Open” to download/view.`}
                                    </div>
                                  </div>
                                </div>
                              ) : tablePreviewData && tablePreviewData.headers.length > 0 ? (
                                <div className="w-full h-[70vh] overflow-auto p-4">
                                  <div className="rounded-2xl border border-border/40 overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          {tablePreviewData.headers.map((h, i) => (
                                            <TableHead key={i} className="text-xs font-bold whitespace-nowrap">
                                              {h || (lang === 'zh-CN' ? '（空）' : '(empty)')}
                                            </TableHead>
                                          ))}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {tablePreviewData.rows.slice(0, 50).map((r, ri) => (
                                          <TableRow key={ri}>
                                            {tablePreviewData.headers.map((_, ci) => (
                                              <TableCell key={ci} className="align-top text-xs whitespace-pre-wrap break-words max-w-[18rem]">
                                                {String(r?.[ci] ?? '')}
                                              </TableCell>
                                            ))}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                  <div className="mt-3 text-[10px] text-muted-foreground font-medium">
                                    {lang === 'zh-CN' ? '仅展示前 50 行 / 前 20 列（用于快速预览）' : 'Showing first 50 rows / 20 cols (quick preview)'}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                    <div className="text-muted-foreground">
                                      {lang === 'zh-CN'
                                        ? '表格预览暂不可用（可点击“打开原文件”下载/在新标签页打开）。'
                                        : 'Table preview is unavailable. Use “Open” to download/view.'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-6 rounded-3xl bg-muted/30 border border-border/40 text-sm leading-7">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                <div className="text-muted-foreground">
                                  {!downloadUrl
                                    ? (lang === 'zh-CN'
                                      ? '预览链接生成中/不可用（请稍后重试或刷新）。'
                                      : 'Preview link is still loading/unavailable. Please retry or refresh.')
                                    : (lang === 'zh-CN'
                                      ? '当前文件类型暂不支持内嵌阅读器预览（目前支持 PDF / DOCX / 图片 / Markdown / 表格；建议点击“打开原文件”下载/在新标签页打开）。'
                                      : 'Inline reader supports PDF/DOCX/Images/Markdown/Tables. Use “Open” to download/view.')}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </TabsContent>

                  <TabsContent value="chunks" className="mt-0 space-y-4 outline-none">
                    {detailChunkMeta && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground font-medium">
                          {lang === 'zh-CN'
                            ? `第 ${detailChunkMeta.page} 页 / 每页 ${detailChunkMeta.page_size} / 共 ${detailChunkMeta.total} 块`
                            : `Page ${detailChunkMeta.page} · ${detailChunkMeta.page_size}/page · total ${detailChunkMeta.total}`}
                        </div>
                        <Badge variant="secondary" className="bg-muted text-[10px] font-mono">
                          loaded {detailChunks.length}
                        </Badge>
                      </div>
                    )}
                    <div className="grid gap-4">
                      {detailChunks.length === 0 ? (
                        <div className="p-8 text-center rounded-3xl border border-dashed border-border/60 bg-muted/10">
                          <p className="text-sm text-muted-foreground font-medium">
                            {lang === 'zh-CN' ? '未找到分块数据' : 'No chunks found'}
                          </p>
                        </div>
                      ) : (
                        detailChunks.map((chunk, idx) => (
                          <div key={chunk.id || idx} className="group p-5 rounded-3xl apple-glass border border-border/40 hover:border-emerald-500/40 hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                                {idx + 1}
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                Chunk ID: {typeof chunk.id === 'string' ? chunk.id.slice(0, 8) : '...'}
                              </span>
                              {typeof chunk?.chunk_index === 'number' && (
                                <Badge variant="outline" className="text-[9px] border-border/60 text-muted-foreground">
                                  index: {chunk.chunk_index}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm leading-7 whitespace-pre-wrap break-words text-foreground/85 font-medium">
                              {chunk.content || (lang === 'zh-CN' ? '（空）' : '(empty)')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {(() => {
                      const total = detailChunkMeta?.total;
                      const canLoadMore = typeof total === 'number' ? detailChunks.length < total : false;
                      if (!canLoadMore) return null;

                      return (
                        <div className="pt-2 flex justify-center">
                          <Button
                            variant="outline"
                            className="rounded-2xl"
                            onClick={handleLoadMoreChunks}
                            disabled={detailLoadingMore}
                          >
                            {detailLoadingMore ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {lang === 'zh-CN' ? '加载中…' : 'Loading…'}
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-4 w-4 mr-2" />
                                {lang === 'zh-CN' ? '加载更多' : 'Load more'}
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-2xl font-bold" onClick={() => setDetailOpen(false)}>
              {lang === 'zh-CN' ? '关闭' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="relative z-10 flex-1 overflow-auto p-6 sm:p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-10">
          {!activeBaseId ? (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {loading && filteredKbs.length === 0 ? null : filteredKbs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
                  <div className="p-8 rounded-[2.5rem] bg-muted/20 border border-dashed border-border/60 relative group overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Library className="h-16 w-16 text-muted-foreground/30 relative z-10" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold tracking-tight text-foreground/80">{lang === 'zh-CN' ? '未找到相关知识库' : 'No Libraries Found'}</p>
                    <p className="text-sm text-muted-foreground max-w-xs">{lang === 'zh-CN' ? '您可以尝试更换关键词，或者新建一个知识库开始使用。' : 'Try a different keyword or create a new library to get started.'}</p>
                  </div>
                  <Button variant="outline" className="rounded-2xl" onClick={() => setCreateOpen(true)}>
                     <Plus className="h-4 w-4 mr-2" />
                     {lang === 'zh-CN' ? '立即新建' : 'Create New One'}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredKbs.map((kb) => (
                    <KnowledgeBaseCard
                      key={kb.id}
                      kb={kb}
                      lang={lang}
                      onManage={setActiveBaseId}
                      onDelete={openDeleteConfirm}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                  <TabsList className="bg-white/40 dark:bg-neutral-900/40 border border-border/40 p-1 rounded-[1.5rem] backdrop-blur-md h-12 shadow-sm">
                  <TabsTrigger value="documents" className="rounded-2xl px-5 flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md transition-all duration-300 font-bold">
                    <FileText className="h-4 w-4" />
                    {lang === 'zh-CN' ? '文档管理' : 'Documents'}
                  </TabsTrigger>
                  <TabsTrigger value="search" className="rounded-2xl px-5 flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-blue-500 data-[state=active]:shadow-md transition-all duration-300 font-bold">
                    <Play className="h-4 w-4" />
                    {lang === 'zh-CN' ? '搜索实验室' : 'Playground'}
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="rounded-2xl px-5 flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-purple-500 data-[state=active]:shadow-md transition-all duration-300 font-bold">
                    <History className="h-4 w-4" />
                    {lang === 'zh-CN' ? '操作历史' : 'Activity'}
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-2xl px-5 flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-amber-500 data-[state=active]:shadow-md transition-all duration-300 font-bold">
                    <SettingsIcon className="h-4 w-4" />
                    {lang === 'zh-CN' ? '配置中心' : 'Settings'}
                  </TabsTrigger>
                </TabsList>

                {activeTab === 'documents' && (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input 
                        type="file" 
                        ref={uploadInputRef}
                        className="hidden" 
                        multiple 
                        onChange={handleUpload}
                      />

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button className="rounded-[1.25rem] h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 transition-all font-bold">
                            <Plus className="h-4 w-4 mr-2" />
                            {lang === 'zh-CN' ? '上传文档' : 'Upload Files'}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl apple-glass min-w-[320px] p-2 shadow-2xl border-white/20 dark:border-white/10" style={{ backdropFilter: 'blur(20px) saturate(160%)' }}>
                          <div className="px-3 py-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
                              {lang === 'zh-CN' ? '选择上传类型' : 'Select Category'}
                            </span>
                          </div>
                          {uploadPresets.map((preset) => {
                            const Icon = preset.icon;
                            return (
                              <DropdownMenuItem
                                key={preset.key}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  openUploadDialog(preset);
                                }}
                                className="group flex items-center gap-4 p-3 rounded-xl transition-all duration-300 hover:bg-emerald-500/10 focus:bg-emerald-500/10 cursor-pointer"
                              >
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-500">
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col gap-0.5 overflow-hidden">
                                  <span className="text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-emerald-600">
                                    {lang === 'zh-CN' ? preset.labelZh : preset.labelEn}
                                  </span>
                                  <span className="text-[11px] font-medium text-muted-foreground/60 truncate max-w-[200px]">
                                    {lang === 'zh-CN' ? preset.descriptionZh : preset.descriptionEn}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator className="mx-2 my-2 bg-white/10" />
                          <div className="px-4 py-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 m-1 flex items-start gap-3">
                            <AlertCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] leading-relaxed text-emerald-600/80 font-medium">
                                {lang === 'zh-CN' 
                                  ? '注意：内容或文件名一致的文件会返回 409 (Conflict)。' 
                                  : 'Note: files with identical content or names return 409 (Conflict).'}
                              </p>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}
              </div>

              <TabsContent value="documents" className="mt-0 space-y-6 outline-none">
                {/* Enhanced Filter & Action Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-6 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white/40 dark:bg-neutral-900/40 border border-border/40 rounded-[1.25rem] backdrop-blur-md shadow-sm">
                    {[
                      { id: 'all', label: lang === 'zh-CN' ? '全部' : 'All', icon: Library },
                      { id: 'doc', label: lang === 'zh-CN' ? '文档' : 'Docs', icon: FileText },
                      { id: 'sheet', label: lang === 'zh-CN' ? '表格' : 'Sheets', icon: FileSpreadsheet },
                      { id: 'image', label: lang === 'zh-CN' ? '图片' : 'Images', icon: ImageIcon },
                      { id: 'other', label: lang === 'zh-CN' ? '其他' : 'Others', icon: File }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setDocFilter(cat.id as any)}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-300",
                          docFilter === cat.id 
                            ? "bg-white dark:bg-neutral-800 text-primary shadow-[0_4px_12px_rgba(0,0,0,0.05)] scale-[1.02]" 
                            : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
                        )}
                      >
                        <cat.icon className={cn("h-3.5 w-3.5", docFilter === cat.id ? "text-primary" : "text-muted-foreground/40")} />
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 lg:ml-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 whitespace-nowrap">
                        {lang === 'zh-CN' ? '排序' : 'Sort'}
                      </span>
                      <Select value={docSort} onValueChange={(v: any) => setDocSort(v)}>
                        <SelectTrigger className="h-10 w-[130px] rounded-xl border-border/40 bg-white/40 dark:bg-neutral-900/40 font-bold text-xs focus:ring-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl apple-glass shadow-2xl border-border/40">
                          <SelectItem value="time" className="rounded-xl m-1 font-bold text-xs">{lang === 'zh-CN' ? '最后更新' : 'Updated'}</SelectItem>
                          <SelectItem value="name" className="rounded-xl m-1 font-bold text-xs">{lang === 'zh-CN' ? '名称' : 'Name'}</SelectItem>
                          <SelectItem value="size" className="rounded-xl m-1 font-bold text-xs">{lang === 'zh-CN' ? '容量' : 'Size'}</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 rounded-xl hover:bg-muted/60"
                        onClick={() => setDocSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      >
                        <div className={cn("transition-transform duration-500", docSortOrder === 'desc' ? "rotate-0" : "rotate-180")}>
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </Button>
                    </div>

                    <div className="h-8 w-[1px] bg-border/40 hidden sm:block" />

                    {/* Quick search within current KB - Designer pick */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                        <Search className="h-3.5 w-3.5" />
                      </div>
                      <Input
                        className="h-10 pl-9 pr-4 rounded-xl border-border/40 bg-white/40 dark:bg-neutral-900/40 text-xs font-bold placeholder:text-muted-foreground/30 focus-visible:ring-primary/20 w-[180px] transition-all focus:w-[240px]"
                        placeholder={lang === 'zh-CN' ? '查找到文档...' : 'Find document...'}
                        value={docSearchQuery}
                        onChange={(e) => setDocSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {Object.keys(uploadingFiles).length > 0 && (
                  <div className="space-y-4">
                    {Object.entries(uploadingFiles).map(([id, info]) => (
                      <div key={id} className="p-5 rounded-[1.5rem] bg-emerald-500/5 border border-emerald-500/20 backdrop-blur-md shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shadow-inner">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                            <div>
                               <span className="text-sm font-bold truncate block max-w-[240px]">{info.name}</span>
                               <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Uploading...</span>
                            </div>
                          </div>
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">{info.prog}%</span>
                        </div>
                        <Progress value={info.prog} className="h-2 bg-emerald-500/10 rounded-full" indicatorClassName="bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-[2rem] border border-border/40 overflow-hidden bg-white/40 dark:bg-neutral-900/40 backdrop-blur-xl shadow-xl">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="w-[140px] font-black text-[10px] uppercase tracking-widest pl-6">{lang === 'zh-CN' ? '解析状态' : 'Status'}</TableHead>
                        <TableHead className="font-black text-[10px] uppercase tracking-widest">{lang === 'zh-CN' ? '文档名称' : 'Document'}</TableHead>
                        <TableHead className="text-right font-black text-[10px] uppercase tracking-widest">{lang === 'zh-CN' ? '文件容量' : 'Size'}</TableHead>
                        <TableHead className="text-right font-black text-[10px] uppercase tracking-widest pr-10">{lang === 'zh-CN' ? '最后更新' : 'Updated'}</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docsLoading && documents.length === 0 ? null : documents.length === 0 ? (
                        <TableRow className="border-none">
                          <TableCell colSpan={5} className="h-80 text-center">
                            <div className="flex flex-col items-center justify-center space-y-6 opacity-40">
                              <div className="p-8 rounded-[2rem] bg-muted/30 border border-dashed border-border/60">
                                <FileText className="h-16 w-16 text-muted-foreground/40" />
                              </div>
                              <div className="space-y-2">
                                <p className="text-xl font-bold tracking-tight">{lang === 'zh-CN' ? '虚位以待' : 'Awaiting Content'}</p>
                                <p className="text-sm font-medium">{lang === 'zh-CN' ? '上传您的第一份文档，开启智能分析之旅' : 'Upload your first document to start the journey'}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        processedDocuments.map((doc) => {
                          const isError = doc.parse_status === 'failed';
                          const isProcessing = doc.parse_status === 'pending' || doc.parse_status === 'processing' || doc.parse_status === 'indexing';
                          const isHighlighted = Boolean(highlightDocId && String(doc.id) === String(highlightDocId));
                          const isReady = !isError && !isProcessing;
                          
                          return (
                            <TableRow
                              key={doc.id}
                              id={`kb-doc-${doc.id}`}
                              onClick={() => isReady && handleViewDetail(doc)}
                              className={cn(
                                "group transition-all duration-300 border-border/20",
                                isReady ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/10",
                                isHighlighted && "bg-primary/10 ring-1 ring-primary/30"
                              )}
                            >
                              <TableCell className="pl-6">
                                <div className="flex items-center gap-2">
                                  {isError ? (
                                    <Badge variant="secondary" className="rounded-lg px-2 py-0.5 h-6 flex items-center bg-destructive/10 text-destructive border-none font-bold text-[9px] uppercase tracking-wider">
                                      <AlertTriangle className="h-3 w-3 mr-1.5" />
                                      {lang === 'zh-CN' ? '解析失败' : 'Failed'}
                                    </Badge>
                                  ) : isProcessing ? (
                                    <Badge variant="secondary" className="rounded-lg px-2 py-0.5 h-6 flex items-center bg-amber-500/10 text-amber-600 border-none font-bold text-[9px] uppercase tracking-wider">
                                      <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                                      {lang === 'zh-CN' ? '索引中' : 'Indexing'}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="rounded-lg px-2 py-0.5 h-6 flex items-center bg-emerald-500/10 text-emerald-600 border-none font-bold text-[9px] uppercase tracking-wider">
                                      <CheckCircle2 className="h-3 w-3 mr-1.5" />
                                      {lang === 'zh-CN' ? '已就绪' : 'Parsed'}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[360px]">
                                <div className="flex items-center gap-4">
                                  <div className={cn(
                                    "p-2.5 rounded-xl border transition-all duration-300 shadow-sm",
                                    isError ? "bg-destructive/5 border-destructive/10 text-destructive" :
                                    isProcessing ? "bg-amber-500/5 border-amber-500/10 text-amber-500" :
                                    "bg-white dark:bg-neutral-800 border-border/40 text-primary whitespace-nowrap"
                                  )}>
                                    {getFileIcon(doc)}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-sm tracking-tight truncate group-hover:text-primary transition-colors">
                                      {normalizeDisplayFilename(doc.file_name || doc.title || 'Untitled')}
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] uppercase font-bold text-muted-foreground/40 tracking-widest bg-muted/50 px-1 rounded">
                                        {(doc.file_type || 'DOC').toUpperCase()}
                                      </span>
                                      {isError && doc.error_message && (
                                        <span className="text-[10px] text-destructive font-bold truncate">
                                          {doc.error_message}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono font-bold text-muted-foreground/70">
                                {doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(2)} MB` : '-'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground font-bold pr-10">
                                {doc.updated_at ? new Date(doc.updated_at).toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                              </TableCell>
                              <TableCell className="text-right px-6">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-9 w-9 rounded-xl hover:bg-muted opacity-0 group-hover:opacity-100 transition-all duration-300"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartRename(doc);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      {lang === 'zh-CN' ? '重命名' : 'Rename'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteDoc(doc.id);
                                      }}
                                      className="cursor-pointer text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      {lang === 'zh-CN' ? '删除' : 'Delete'}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="search" className="mt-0 space-y-6 outline-none">
                <div className="flex flex-col space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold ml-1">{lang === 'zh-CN' ? '搜索查询' : 'Search Query'}</Label>
                    <div className="relative group">
                      <Textarea
                        placeholder={lang === 'zh-CN' ? '输入问题或关键词来测试检索质量...' : 'Enter query or keywords to test retrieval...'}
                        className="min-h-[100px] rounded-2xl apple-glass focus-visible:ring-emerald-500/50 resize-none pr-12 transition-all duration-300"
                        value={playgroundQuery}
                        onChange={(e) => setPlaygroundQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handlePlaygroundSearch();
                          }
                        }}
                      />
                      <div className="absolute right-3 bottom-3 flex items-center gap-2">
                         <div className="text-[10px] text-muted-foreground font-medium opacity-0 group-focus-within:opacity-100 transition-opacity mr-2">
                           Ctrl + Enter
                         </div>
                         <Button 
                          size="icon" 
                          className="h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                          onClick={handlePlaygroundSearch}
                          disabled={playgroundLoading || !playgroundQuery.trim()}
                        >
                          {playgroundLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border/40">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-bold text-muted-foreground">{lang === 'zh-CN' ? '搜索设置' : 'Search Settings'}</span>
                    </div>
                    <div className="h-4 w-px bg-border/60 mx-1" />
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-medium">{lang === 'zh-CN' ? '返回结果数 (Top K):' : 'Return Count (Top K):'}</Label>
                      <div className="flex items-center gap-1 bg-background/50 rounded-lg p-1 border">
                        {[1, 3, 5, 10].map((val) => (
                          <Button
                            key={val}
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-3 rounded-md text-[10px] font-bold transition-all",
                              playgroundTopK === val ? "bg-emerald-500 text-white shadow-sm" : "hover:bg-emerald-500/10 text-muted-foreground"
                            )}
                            onClick={() => setPlaygroundTopK(val)}
                          >
                            {val}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-bold">{lang === 'zh-CN' ? '检索结果' : 'Search Results'}</h4>
                      {playgroundResults.length > 0 && (
                        <Badge variant="secondary" className="rounded-full bg-emerald-500/10 text-emerald-600 border-none font-bold text-[10px]">
                          {playgroundResults.length} {lang === 'zh-CN' ? '条记录' : 'Items'}
                        </Badge>
                      )}
                    </div>
                    {playgroundResults.length > 0 && (
                      <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5" onClick={handleSendToChat}>
                        <MessageSquare className="h-3 w-3 mr-2" />
                        {lang === 'zh-CN' ? '发送到对话' : 'Send to Chat'}
                      </Button>
                    )}
                  </div>

                  {playgroundLoading ? null : playgroundResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-3xl bg-muted/5">
                      <div className="p-3 rounded-full bg-muted/30 mb-4">
                        <Quote className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {playgroundQuery ? (lang === 'zh-CN' ? '没有匹配的结果' : 'No matching results') : (lang === 'zh-CN' ? '输入查询以测试效果' : 'Enter a query to test results')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-4">
                      {playgroundResults.map((result, idx) => (
                        <Card key={idx} className="rounded-[1.75rem] border-border/40 overflow-hidden bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md hover:shadow-xl transition-all duration-500 hover:-translate-y-1">
                          <CardHeader className="p-5 bg-muted/20 flex-row items-center justify-between space-y-0 border-b border-border/10">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-primary-foreground text-[11px] font-black shadow-lg shadow-primary/20">
                                {idx + 1}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight truncate max-w-[200px]">
                                  {result.document_name || (lang === 'zh-CN' ? '来源文档' : 'Source Doc')}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <Badge variant="outline" className="text-[9px] font-mono border-border/40 text-muted-foreground/60 px-1.5 h-4">
                                     ID: {result.document_id?.substring(0, 8)}
                                   </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-end mr-1">
                                <span className="text-[9px] text-muted-foreground/60 font-black uppercase tracking-widest">{lang === 'zh-CN' ? '置信度' : 'Score'}</span>
                                <span className="text-sm font-mono font-black text-primary">{(result.score * 100).toFixed(1)}%</span>
                              </div>
                              <div className="h-10 w-1.5 bg-muted/40 rounded-full overflow-hidden self-center">
                                <div className="bg-primary h-full transition-all duration-1000" style={{ height: `${result.score * 100}%` }} />
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-5 text-sm leading-relaxed text-foreground/85 font-medium relative">
                             <Quote className="absolute -left-1 -top-1 h-12 w-12 text-primary/5 -rotate-12 pointer-events-none" />
                             <p className="whitespace-pre-wrap relative z-10">{result.content}</p>
                          </CardContent>
                          <CardFooter className="p-4 bg-muted/5 border-t border-border/10 flex justify-between items-center">
                             <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60 font-bold uppercase tracking-wider">
                               <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg">
                                 <FileText className="h-3 w-3" />
                                 {result.content?.length} chars
                               </div>
                               {result.metadata?.page && (
                                 <div className="flex items-center gap-1.5 bg-primary/5 text-primary px-2 py-1 rounded-lg">
                                   <Target className="h-3 w-3" />
                                   Page {result.metadata.page}
                                 </div>
                               )}
                             </div>
                             <Button variant="ghost" size="sm" className="h-8 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 hover:text-primary transition-all pr-3" onClick={() => {
                               // Future: Link to original doc
                             }}>
                               {lang === 'zh-CN' ? '定位原文' : 'Locate'}
                               <ChevronRight className="h-3 w-3 ml-1" />
                             </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-0 space-y-8 outline-none animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Basic Info */}
                    <Card className="rounded-3xl border-border/40 overflow-hidden apple-glass">
                      <CardHeader className="bg-muted/30">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Library className="h-4 w-4 text-emerald-500" />
                          {lang === 'zh-CN' ? '基本信息' : 'Basic Information'}
                        </CardTitle>
                        <CardDescription>
                          {lang === 'zh-CN' ? '修改知识库的名称和描述' : 'Update the name and description of your knowledge base'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-6 space-y-6">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold ml-1">{lang === 'zh-CN' ? '知识库名称' : 'Database Name'}</Label>
                            <Input 
                              {...settingsForm.register('name')}
                              placeholder={lang === 'zh-CN' ? '例如：我的研究文档' : 'e.g. My Research Papers'}
                              className="rounded-xl apple-glass focus-visible:ring-emerald-500/50"
                            />
                            {settingsForm.formState.errors.name && (
                              <p className="text-[10px] text-destructive font-bold ml-1">{settingsForm.formState.errors.name.message}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold ml-1">{lang === 'zh-CN' ? '描述 (可选)' : 'Description (Optional)'}</Label>
                            <Textarea 
                              {...settingsForm.register('description')}
                              placeholder={lang === 'zh-CN' ? '描述这个知识库里主要包含什么内容' : 'What is this knowledge base about?'}
                              className="rounded-xl apple-glass focus-visible:ring-emerald-500/50 min-h-[100px] resize-none"
                            />
                            {settingsForm.formState.errors.description && (
                              <p className="text-[10px] text-destructive font-bold ml-1">{settingsForm.formState.errors.description.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground bg-emerald-500/5 rounded-2xl p-4 border border-emerald-500/10">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold uppercase tracking-wider text-[9px] text-emerald-600 dark:text-emerald-400">{lang === 'zh-CN' ? '创建时间' : 'Created At'}</span>
                            <span className="font-mono">{activeBase?.created_at ? new Date(activeBase.created_at).toLocaleString() : '-'}</span>
                          </div>
                          <div className="w-px h-8 bg-emerald-500/20" />
                          <div className="flex flex-col gap-1">
                            <span className="font-bold uppercase tracking-wider text-[9px] text-emerald-600 dark:text-emerald-400">{lang === 'zh-CN' ? '更新时间' : 'Updated At'}</span>
                            <span className="font-mono">{activeBase?.updated_at ? new Date(activeBase.updated_at).toLocaleString() : '-'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Chunking Config */}
                    <Card className="rounded-3xl border-border/40 overflow-hidden apple-glass">
                      <CardHeader className="bg-muted/30">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-emerald-500" />
                          {lang === 'zh-CN' ? '分块策略' : 'Chunking Strategy'}
                        </CardTitle>
                        <CardDescription>
                          {lang === 'zh-CN' ? '配置文档是如何被切分和索引的' : 'Configure how documents are split and indexed'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <Label className="text-xs font-bold">{lang === 'zh-CN' ? '分块大小 (Chunk Size)' : 'Chunk Size'}</Label>
                                <span className="text-xs font-mono font-bold text-emerald-600">{settingsForm.watch('chunkSize')}</span>
                              </div>
                              <input
                                type="range"
                                disabled
                                value={settingsForm.watch('chunkSize')}
                                min={100}
                                max={4000}
                                step={1}
                                className="w-full h-1.5 appearance-none bg-emerald-500/10 rounded-full cursor-not-allowed opacity-50"
                              />
                              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                                {lang === 'zh-CN' ? '* 目前暂不支持修改现有知识库的分块策略' : '* Changing chunking strategy is not supported for existing bases yet'}
                              </p>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <Label className="text-xs font-bold">{lang === 'zh-CN' ? '重叠大小 (Overlap)' : 'Overlap'}</Label>
                                <span className="text-xs font-mono font-bold text-emerald-600">{settingsForm.watch('overlap')}</span>
                              </div>
                              <input
                                type="range"
                                disabled
                                value={settingsForm.watch('overlap')}
                                min={0}
                                max={500}
                                step={1}
                                className="w-full h-1.5 appearance-none bg-emerald-500/10 rounded-full cursor-not-allowed opacity-50"
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <Label className="text-xs font-bold">{lang === 'zh-CN' ? '文本分隔符' : 'Text Separators'}</Label>
                            <div className="grid grid-cols-1 gap-2">
                              {DEFAULT_SEPARATORS.map((sep) => (
                                <div key={sep.value} className="flex items-center space-x-2 p-2 rounded-xl bg-muted/20 border border-transparent hover:border-border/40 transition-all opacity-60">
                                  <Checkbox
                                    id={`settings-sep-${sep.value}`}
                                    checked={settingsForm.watch('separators')?.includes(sep.value)}
                                    disabled
                                  />
                                  <label
                                    htmlFor={`settings-sep-${sep.value}`}
                                    className="text-xs font-medium leading-none cursor-not-allowed"
                                  >
                                    {sep.label}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    <Card className="rounded-3xl border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                      <div className="p-6 space-y-4">
                        <Button 
                          className="w-full rounded-2xl h-12 bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-500/20"
                          onClick={() => settingsForm.handleSubmit(handleUpdateSettings)()}
                          disabled={isSavingSettings || !settingsForm.formState.isDirty}
                        >
                          {isSavingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {lang === 'zh-CN' ? '保存更改' : 'Save Changes'}
                        </Button>
                        <p className="text-[10px] text-center text-muted-foreground font-medium px-4 leading-relaxed">
                          {lang === 'zh-CN' ? '点击保存以应用对基本信息的更新。分块设置由于索引限制在此处为只读。' : 'Basic info edits will be applied. Chunking config is read-only for stability.'}
                        </p>
                      </div>
                    </Card>

                    <Card className="rounded-3xl border-destructive/20 bg-destructive/5 overflow-hidden">
                      <CardHeader>
                        <CardTitle className="text-sm font-bold text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {lang === 'zh-CN' ? '危险区域' : 'Danger Zone'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-6 pb-6 space-y-4">
                        <div className="space-y-4">
                          <div className="p-3 rounded-2xl bg-muted/50 border border-border/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold">{lang === 'zh-CN' ? '重建索引' : 'Rebuild Index'}</span>
                              <Badge variant="outline" className="text-[9px] uppercase font-bold opacity-50">{lang === 'zh-CN' ? '开发中' : 'Soon'}</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {lang === 'zh-CN' ? '清空所有索引并重新解析所有文档。' : 'Wipe all chunks and re-parse every document.'}
                            </p>
                            <Button variant="outline" size="sm" className="w-full mt-3 rounded-xl text-[10px] font-bold opacity-50" disabled>
                              <RefreshCw className="h-3 w-3 mr-2" />
                              {lang === 'zh-CN' ? '开始重建' : 'Start Rebuild'}
                            </Button>
                          </div>

                          <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/10">
                            <span className="text-xs font-bold text-destructive">{lang === 'zh-CN' ? '删除知识库' : 'Delete Database'}</span>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {lang === 'zh-CN' ? '此操作不可撤销。所有文档和索引将被永久删除。' : 'Once deleted, all files and vectors are gone forever.'}
                            </p>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="w-full mt-3 rounded-xl text-[10px] font-bold"
                              onClick={() => openDeleteConfirm({ id: String(activeBaseId || ""), name: activeBase?.name })}
                            >
                              <Trash2 className="h-3 w-3 mr-2" />
                              {lang === 'zh-CN' ? '彻底删除' : 'Delete Forever'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-0 outline-none animate-in fade-in slide-in-from-top-2">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-bold">{lang === 'zh-CN' ? '全部动态' : 'All Activity'}</h4>
                    </div>
                  </div>

                  {activitiesLoading && activities.length === 0 ? null : activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-3xl bg-muted/5">
                      <History className="h-10 w-10 text-muted-foreground/30 mb-4" />
                      <p className="text-sm text-muted-foreground">{lang === 'zh-CN' ? '暂无操作记录' : 'No activity records yet'}</p>
                    </div>
                  ) : (
                    <div className="relative space-y-0 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                      {activities.map((item, idx) => {
                        const isSuccess = item.status === 'success';
                        const isError = item.status === 'failed';
                        const isUpload = item.action === 'upload';
                        const isParse = item.action === 'parse';
                        
                        return (
                          <div key={item.id} className="relative pl-12 pb-8 last:pb-0 group">
                            <div className={cn(
                              "absolute left-0 top-1 w-10 h-10 rounded-full border-4 border-background flex items-center justify-center z-10 transition-transform group-hover:scale-110",
                              isUpload ? "bg-emerald-500 text-white" :
                              isParse && isSuccess ? "bg-emerald-500 text-white" :
                              isParse && isError ? "bg-destructive text-white" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {isUpload ? <Upload className="h-4 w-4" /> :
                               isParse && isSuccess ? <CheckCircle2 className="h-4 w-4" /> :
                               isParse && isError ? <AlertTriangle className="h-4 w-4" /> :
                               <Clock className="h-4 w-4" />}
                            </div>
                            
                            <div className="p-4 rounded-2xl apple-glass border border-border/40 hover:border-emerald-500/20 transition-all duration-300">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold">
                                    {isUpload ? (lang === 'zh-CN' ? '上传文档' : 'Uploaded') :
                                     isParse ? (lang === 'zh-CN' ? '文档解析' : 'Parsed') : 
                                     item.action}
                                  </span>
                                  {isError ? (
                                    <Badge variant="destructive" className="rounded-full px-2 py-0 h-5 text-[9px] font-bold uppercase tracking-wider">
                                      FAILED
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="rounded-full px-2 py-0 h-5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border-none">
                                      SUCCESS
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground italic">
                                  {new Date(item.time).toLocaleString()}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                                <FileText className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-md">{item.object}</span>
                              </div>
                              
                              {isError && item.error_reason && (
                                <div className="mt-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                                  <p className="text-[10px] text-destructive font-bold leading-relaxed">
                                    {item.error_reason}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </main>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open);
          if (!open) {
            setDeleteTargetKb(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <DialogContent className="rounded-3xl apple-glass">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {lang === 'zh-CN' ? '确认删除知识库？' : 'Delete Knowledge Base?'}
            </DialogTitle>
            <DialogDescription className="py-4">
              {lang === 'zh-CN' ? (
                <>
                  您正在删除 <span className="font-bold text-foreground">"{deleteTargetName || '-'}"</span>。
                  此操作将清除所有已上传的文档和检索索引，且无法恢复。
                </>
              ) : (
                <>
                  You are deleting <span className="font-bold text-foreground">"{deleteTargetName || '-'}"</span>. This
                  will permanently remove all documents and vectors. This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label className="text-xs font-bold">{lang === 'zh-CN' ? '输入知识库名称以确认：' : 'Type name to confirm:'}</Label>
            <Input
              placeholder={deleteTargetName}
              className="rounded-xl border-destructive/20 h-10"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} className="rounded-xl font-bold">
              {lang === 'zh-CN' ? '取消' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeletingKb || !deleteTargetId || !deleteTargetName || deleteConfirmName !== deleteTargetName}
              onClick={handleDeleteKb}
              className="rounded-xl font-bold bg-destructive hover:bg-destructive/90"
            >
              {isDeletingKb && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {lang === 'zh-CN' ? '确认删除' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
