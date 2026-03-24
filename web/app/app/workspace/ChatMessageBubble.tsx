import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';
import { Bot, User, MessageCircle, Pencil, Trash2, Copy, Check, Plus, ChevronDown, ChevronRight, Milestone, Download, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { MessageAttachmentList, type MessageAttachment } from '@/components/message/MessageAttachmentCard';
import { UploadChip, UploadChipsContainer } from '@/components/composer/UploadChip';
import type { UploadStatus } from '@/components/composer/UploadChip';
import { ReasoningBlock } from './ReasoningBlock';
import { GroundingBlock } from './GroundingBlock';
import { InlineAnnotationToolbar } from './InlineAnnotationToolbar';
import { AnnotationHighlight } from './AnnotationHighlight';
import { AnnotationPreviewCard } from './AnnotationPreviewCard';
import { AnnotationNotePopover } from './AnnotationNotePopover';
import { type InlineAnnotationSelection, type InlineAnnotation, normalizeKeyframeAnnotations } from '@/lib/annotations';
import { InlineOutcomeCreate } from '@/components/outcome/InlineOutcomeCreate';
import type { OutcomeCreateRequest, OutcomeCreateResponse, OutcomePreviewRequest, OutcomePreviewResponse } from '@/lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import type { Citation } from './types';

export type ChatRole = 'user' | 'ai' | 'system' | 'root';

const NOOP = () => {};

export interface MessageKnowledge {
  baseId: string;
  baseName?: string;
  documentIds?: string[];
  documentCount?: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** DeepSeek Reasoning: raw reasoning/thinking text (optional) */
  reasoning?: string;
  /** DeepSeek Reasoning: whether reasoning block is expanded */
  reasoningVisible?: boolean;
  /** Gemini Grounding: raw grounding metadata (optional) */
  groundingMetadata?: any;
  /** Gemini Grounding: whether grounding block is expanded */
  groundingVisible?: boolean;
  /** DeepSeek Reasoning: whether we have seen any reasoning token in this stream */
  reasoningStarted?: boolean;
  /** DeepSeek Reasoning: whether we have started receiving/displaying answer tokens */
  answerStarted?: boolean;
  /** DeepSeek Reasoning: elapsed thinking time (ms), best-effort */
  thinkingMs?: number | null;
  /** Whether the selected model supports showing reasoning (best-effort) */
  reasoningSupported?: boolean;
  level?: number | null;
  isCurrent?: boolean;
  isRoot?: boolean;
  provider?: string | null;
  model?: string | null;
  isByok?: boolean | null;
  sourceLabel?: string | null;
  isStreaming?: boolean;
  error?: string | null;
  /** T88: Attachments associated with this message/turn */
  attachments?: MessageAttachment[];

  /** KB-3.x: Selected knowledge base for this message */
  knowledge?: MessageKnowledge;

  /** KB-3.x: Citations for this AI message (best-effort) */
  citations?: Citation[];
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHighlightTerms(queryText: string | null | undefined): string[] {
  const q = typeof queryText === 'string' ? queryText.trim() : '';
  if (!q) return [];

  // If the query has obvious word boundaries, highlight keywords.
  // For CJK/no-spaces queries, highlight the whole query only when it's not too long.
  const hasSpaces = /\s/.test(q);
  if (!hasSpaces) {
    if (q.length > 0 && q.length <= 18) return [q];
    return [];
  }

  const rawTerms = q
    .split(/[\s\p{P}\p{S}]+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const uniq: string[] = [];
  for (const term of rawTerms) {
    if (term.length < 2) continue;
    if (uniq.includes(term)) continue;
    uniq.push(term);
    if (uniq.length >= 8) break;
  }
  return uniq;
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const safeText = typeof text === 'string' ? text : '';
  if (!safeText || !Array.isArray(terms) || terms.length === 0) {
    return <>{safeText}</>;
  }
  const escaped = terms.map(escapeRegExp).filter(Boolean);
  if (escaped.length === 0) return <>{safeText}</>;
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = safeText.split(regex);
  return (
    <>
      {parts.map((part, idx) => {
        const matched = regex.test(part);
        // Reset lastIndex for safety on global regex.
        regex.lastIndex = 0;
        return matched ? (
          <mark
            key={idx}
            className="rounded px-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          >
            {part}
          </mark>
        ) : (
          <span key={idx}>{part}</span>
        );
      })}
    </>
  );
}

function splitThinkingTags(rawText: string): { answerText: string; reasoningText: string; found: boolean } {
  const text = typeof rawText === 'string' ? rawText : '';
  if (!text) return { answerText: '', reasoningText: '', found: false };

  const reasoningParts: string[] = [];

  // Closed blocks: <思考>...</思考> / <think>...</think> / <analysis>...</analysis> / <thought>...</thought>
  // Also handle escaped forms (&lt;...&gt;).
  const closedBlockRegexes = [
    /<思考[\s\S]*?<\/思考>/gi,
    /<think[\s\S]*?<\/think>/gi,
    /<analysis[\s\S]*?<\/analysis>/gi,
    /<thought[\s\S]*?<\/thought>/gi,
  ];
  
  let answerText = text;
  for (const regex of closedBlockRegexes) {
    answerText = answerText.replace(regex, (matched) => {
      const inner = matched.replace(/^<[^>]+>|<\/[^>]+>$/g, '');
      const trimmed = inner.trim();
      if (trimmed) reasoningParts.push(trimmed);
      return '';
    });
  }

  // Partially streamed/unclosed tag: if we see an opening tag without its closing tag,
  // treat the remaining tail as reasoning and remove it from the answer.
  const openTagRegexes = [
    /<思考[^>]*>(?![\s\S]*<\/思考)/gi,
    /<think[^>]*>(?![\s\S]*<\/think)/gi,
    /<analysis[^>]*>(?![\s\S]*<\/analysis)/gi,
    /<thought[^>]*>(?![\s\S]*<\/thought)/gi,
  ];
  
  for (const openTagRegex of openTagRegexes) {
    const openMatch = answerText.match(openTagRegex);
    if (openMatch && typeof openMatch.index === 'number') {
      const start = openMatch.index;
      const openLen = openMatch[0].length;
      const tail = answerText.slice(start + openLen);
      // Heuristic: if the model streams an opening tag but never closes it,
      // often the first non-empty line is the thought, and subsequent lines include the final answer.
      const lines = tail.split('\n');
      const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
      if (firstNonEmptyIdx >= 0) {
        const head = lines[firstNonEmptyIdx].trim();
        const rest = lines.slice(firstNonEmptyIdx + 1).join('\n');
        if (head) reasoningParts.push(head);
        answerText = answerText.slice(0, start) + rest;
      } else {
        // Nothing useful in tail; just drop it from answer.
        answerText = answerText.slice(0, start);
      }
    }
  }

  const reasoningText = reasoningParts.filter(Boolean).join('\n\n');

  // Keep formatting reasonable but avoid aggressive trimming.
  answerText = answerText.replace(/\n{3,}/g, '\n\n');
  answerText = answerText.replace(/^\n+/, '');
  answerText = answerText.trimEnd();

  // 'found' should be true if we detected any tags at all, not just if we have reasoning content
  // (even empty/whitespace-only tags should be detected and removed)
  const found = text !== answerText || reasoningText.trim().length > 0;
  return { answerText, reasoningText, found };
}

function isDeepSeekReasoner(provider?: string | null, model?: string | null) {
  const p = (provider || '').toLowerCase();
  const m = (model || '').toLowerCase();
  return p.includes('deepseek') && m.includes('reasoner');
}

function extractFirstGeneratedImageDownloadUrl(text: string): string | null {
  const raw = typeof text === 'string' ? text : '';
  if (!raw) return null;

  // Matches Markdown image syntax: ![alt](/api/upload/<id>/download)
  // Keep it intentionally strict to avoid false positives.
  const match = raw.match(/!\[[^\]]*\]\((\/api\/upload\/[^)\s]+\/download)\)/i);
  return match?.[1] ?? null;
}

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** KB-3.x: The user query that produced this AI message (best-effort) */
  knowledgeQueryText?: string | null;
  /** T28-1: Show action menu for user messages (not root) */
  showActions?: boolean;
  /** T93-13: Create Layer2 Outcome (anchor is current node, handled by parent) */
  onCreateOutcome?: (messageId: string) => void;
  /** T93-UX: Inline outcome creation mode */
  isInlineCreatingOutcome?: boolean;
  onCancelInlineOutcome?: () => void;
  onOutcomeCreated?: (outcomeId: string) => void;
  outcomePreview?: (payload: OutcomePreviewRequest) => Promise<OutcomePreviewResponse | null>;
  outcomeCreate?: (payload: OutcomeCreateRequest) => Promise<OutcomeCreateResponse | null>;
  treeId?: string | null;

  /** T28-1: Callback when "Edit question" is clicked */
  onEditQuestion?: (messageId: string, currentText: string) => void;
  /** T28-1: Inline edit state for user questions */
  isEditing?: boolean;
  /** T28-1: Current edit draft */
  editValue?: string;
  /** T28-1: Update edit draft */
  onEditChange?: (value: string) => void;
  /** T28-1: Cancel inline edit */
  onEditCancel?: () => void;
  /** T28-1: Confirm inline edit */
  onEditConfirm?: () => void;
  /** T28-1: Edit submission state */
  editSubmitting?: boolean;
  /** T28-1: Callback when "Delete from here" is clicked */
  onDeleteFrom?: (messageId: string) => void;
  /** T28-1: Whether actions are disabled (e.g., during loading) */
  actionsDisabled?: boolean;

  /** P2-2: Map of all keyframes for rendering annotations */
  keyframesMap?: Record<string, any>;
  /** P2-2: Callback when user creates inline annotation from text selection */
  onCreateInlineAnnotation?: (payload: InlineAnnotationSelection) => void;
  /** P2-2: Callback when user updates an annotation */
  onUpdateInlineAnnotation?: (messageId: string, annotationId: string, note: string) => void;
  /** P2-2: Callback when user deletes an annotation */
  onDeleteInlineAnnotation?: (messageId: string, annotationId: string) => void;
  /** T59-2: Language preference */
  lang?: 'zh' | 'en';
  /** T88: Callback when attachment preview is clicked */
  onPreviewAttachment?: (attachment: MessageAttachment) => void;

  /** DeepSeek Reasoning: toggle reasoning visibility (controlled by parent) */
  onToggleReasoningVisible?: (messageId: string, nextVisible: boolean) => void;

  /** Gemini Grounding: toggle grounding visibility (controlled by parent) */
  onToggleGroundingVisible?: (messageId: string, nextVisible: boolean) => void;

  /** Edit-mode: attachments selected for this edit */
  editAttachments?: MessageAttachment[];
  /** Edit-mode: uploads currently uploading/failed (show in edit bubble) */
  editPendingUploads?: Array<{ id: string; fileName: string; sizeBytes?: number; status: UploadStatus; errorMessage?: string }>;
  /** Edit-mode: remove an attachment from this edit */
  onEditRemoveAttachment?: (attachmentId: string) => void;
  /** Edit-mode: upload files and attach to this edit */
  onEditUploadFiles?: (files: FileList) => void;
  /** Edit-mode: remove a pending/failed upload */
  onEditRemovePendingUpload?: (uploadId: string) => void;
  /** Edit-mode: retry a failed upload */
  onEditRetryPendingUpload?: (uploadId: string) => void;
}

// Streaming-friendly Markdown renderer.
// Streaming playback is handled upstream (TreeWorkspace) to decouple SSE ingress from UI reveal cadence.
// Uses CSS-only cursor indicator on :last-child for streaming feedback without content flicker.
const StreamingMarkdown = memo(function StreamingMarkdown({
  text,
  isStreaming,
  components,
  className,
}: {
  text: string;
  isStreaming: boolean;
  components: any;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'leading-relaxed',
        isStreaming ? 'streaming-markdown-live' : null,
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components as any}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

function ChatMessageBubbleImpl({
  message,
  knowledgeQueryText = null,
  showActions = false,
  onCreateOutcome,
  isInlineCreatingOutcome = false,
  onCancelInlineOutcome,
  onOutcomeCreated,
  outcomePreview,
  outcomeCreate,
  treeId,
  onEditQuestion,
  isEditing = false,
  editValue,
  onEditChange,
  onEditCancel,
  onEditConfirm,
  editSubmitting = false,
  onDeleteFrom,
  actionsDisabled = false,
  keyframesMap,
  onCreateInlineAnnotation,
  onUpdateInlineAnnotation,
  onDeleteInlineAnnotation,
  lang = 'zh',
  onPreviewAttachment,
  onToggleReasoningVisible,
  onToggleGroundingVisible,
  editAttachments,
  editPendingUploads,
  onEditRemoveAttachment,
  onEditUploadFiles,
  onEditRemovePendingUpload,
  onEditRetryPendingUpload,
}: ChatMessageBubbleProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<InlineAnnotation | null>(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | undefined>();
  const [annotationRectsById, setAnnotationRectsById] = useState<Record<string, DOMRect>>({});
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const previewCloseTimerRef = useRef<number | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<InlineAnnotation | null>(null);
  const [editingAnchorRect, setEditingAnchorRect] = useState<DOMRect | undefined>();
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  // P2-2: Ref for AI message content (for selection monitoring)
  const aiContentRef = useRef<HTMLDivElement | null>(null);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'ai';
  const isSystem = message.role === 'system';
  const isRoot = message.role === 'root' || message.isRoot;
  const isStreaming = Boolean(message.isStreaming);
  const locale: Lang = lang === 'zh' ? 'zh-CN' : 'en';

  const citations = useMemo(() => {
    return Array.isArray(message.citations) ? message.citations : [];
  }, [message.citations]);
  const showReferences = Boolean(isAssistant && message.knowledge && message.knowledge.baseId);
  const [citationsOpen, setCitationsOpen] = useState(() => showReferences);
  const didAutoOpenCitationsRef = useRef(false);
  useEffect(() => {
    if (!showReferences) return;
    if (didAutoOpenCitationsRef.current) return;
    setCitationsOpen(true);
    didAutoOpenCitationsRef.current = true;
  }, [showReferences]);
  const [citationSheetOpen, setCitationSheetOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const highlightTerms = useMemo(() => buildHighlightTerms(knowledgeQueryText), [knowledgeQueryText]);

  const firstGeneratedImageDownloadUrl = useMemo(() => {
    return extractFirstGeneratedImageDownloadUrl(message.text);
  }, [message.text]);

  const isImageModelResult = useMemo(() => {
    const model = (message.model || '').toLowerCase();
    return model.includes('image');
  }, [message.model]);

  const isGeneratedImageResult = Boolean(isAssistant && (isImageModelResult || firstGeneratedImageDownloadUrl));

  const annotations = useMemo(() => {
    if (!isAssistant) return [];
    const kf = keyframesMap?.[message.id];
    if (!kf) return [];
    return normalizeKeyframeAnnotations(kf.annotation);
  }, [keyframesMap, message.id, isAssistant]);

  const sortedAnnotations = useMemo(() => {
    const list = [...annotations];
    list.sort((a, b) => {
      const aStart = typeof a.anchor?.start === 'number' ? a.anchor.start : Number.POSITIVE_INFINITY;
      const bStart = typeof b.anchor?.start === 'number' ? b.anchor.start : Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      const aTs = a.created_at ? Date.parse(a.created_at) : 0;
      const bTs = b.created_at ? Date.parse(b.created_at) : 0;
      return aTs - bTs;
    });
    return list;
  }, [annotations]);

  const hoveredIndex = useMemo(() => {
    if (!hoveredAnnotation) return -1;
    return sortedAnnotations.findIndex((a) => a.id === hoveredAnnotation.id);
  }, [hoveredAnnotation, sortedAnnotations]);

  const clearPreviewCloseTimer = useCallback(() => {
    if (previewCloseTimerRef.current !== null) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
  }, []);

  const scheduleClosePreview = useCallback(() => {
    clearPreviewCloseTimer();
    previewCloseTimerRef.current = window.setTimeout(() => {
      if (isPreviewHovered) return;
      setHoveredAnnotation(null);
      setHoverAnchorRect(undefined);
    }, 180);
  }, [clearPreviewCloseTimer, isPreviewHovered]);

  useEffect(() => {
    return () => {
      clearPreviewCloseTimer();
    };
  }, [clearPreviewCloseTimer]);

  const hasError = Boolean(message.error);
  const isInlineEditing = Boolean(isEditing && (isUser || isRoot));
  const editDisabled = actionsDisabled || editSubmitting;
  const editText = typeof editValue === 'string' ? editValue : message.text;
  const editAttachDisabled = editDisabled;
  const editAttachList = Array.isArray(editAttachments) ? editAttachments : [];
  const editPendingList = Array.isArray(editPendingUploads) ? editPendingUploads : [];
  const hasUploadingEditAttachments = editPendingList.some((u) => u.status === 'uploading');
  const editConfirmDisabled = Boolean(editDisabled || !editText.trim() || hasUploadingEditAttachments);
  const editNotice =
    lang === 'en'
      ? 'Editing will delete the current answer and later content. AI will regenerate the reply.'
      : '修改问题后，当前回答及后续内容将被删除，AI 将重新生成回答。';

  // ROOT is the user's first question, so it should align right like user messages
  const isUserSide = isUser || isRoot;

  // Copy text to clipboard
  const handleCopy = useCallback(async () => {
    if (!message.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.text]);

  const handleRectsUpdate = useCallback((rects: Record<string, DOMRect>) => {
    setAnnotationRectsById(rects);
    // CRITICAL: Update hovered/editing anchor rects on scroll/resize to prevent "drifting"
    if (hoveredAnnotation && rects[hoveredAnnotation.id]) {
      setHoverAnchorRect(rects[hoveredAnnotation.id]);
    }
    if (editingAnnotation && rects[editingAnnotation.id]) {
      setEditingAnchorRect(rects[editingAnnotation.id]);
    }
  }, [hoveredAnnotation, editingAnnotation]);

  const handleHoverAnnotation = useCallback((anno: InlineAnnotation | null, rect?: DOMRect) => {
    if (!anno) {
      scheduleClosePreview();
      return;
    }
    clearPreviewCloseTimer();
    setHoveredAnnotation(anno);
    setHoverAnchorRect(rect);
  }, [scheduleClosePreview, clearPreviewCloseTimer]);

  const handleClickAnnotation = useCallback((anno: InlineAnnotation, rect: DOMRect) => {
    clearPreviewCloseTimer();
    setHoveredAnnotation(anno);
    setHoverAnchorRect(rect);
    setIsPreviewHovered(true); // Treat as hovered to prevent auto-close
  }, [clearPreviewCloseTimer]);

  // P2-2: Handle inline annotation creation from text selection
  const handleAnnotate = useCallback((payload: InlineAnnotationSelection) => {
    if (onCreateInlineAnnotation) {
      onCreateInlineAnnotation(payload);
    }
  }, [onCreateInlineAnnotation]);

  // T32-1: Root messages can show edit/delete buttons (but disabled)
  // Allows UI consistency with other user messages, even though root is immutable
  const canShowActions = showActions && isUserSide && (onCreateOutcome || onEditQuestion || onDeleteFrom);
  const areActionsDisabled = actionsDisabled || isRoot;
  const outcomeActionDisabled = actionsDisabled;

  // T29-1: Different styles for user (bubble) vs AI (content block)
  // User messages: compact bubbles, right-aligned
  // AI messages: full-width content blocks, left-aligned (like ChatGPT/Gemini)

  const bubbleClass = cn(
    'relative',
    // T20260127: Removed the ultra-short duration-75 max-height transition during streaming
    // as it creates "judder" (the scroll/browser and CSS animation fighting).
    // Let the smooth character reveal handle growth naturally.
    {
      'transition-[max-height,opacity,transform] duration-200 ease-in-out': !isStreaming,
      // === User & Root messages: classic chat bubble style ===
      // Keep user questions as bubbles, right-aligned.
      // Use w-fit + max width percentage to avoid "full-width" bubbles on long prompts.
      'rounded-xl px-4 py-2.5 border w-fit': isUserSide,
      'max-w-[70%]': isUserSide,
      // Inline edit: keep similar footprint to normal bubble, but slightly wider for editing
      'w-[min(70%,36rem)] min-w-[240px]': isUserSide && isInlineEditing,
      // Light mode: matcha green (matching sidebar active state)
      'bg-muted/60 text-slate-900 border-border/50': isUserSide && !isInlineEditing,
      // Dark mode: subtle dark green
      'dark:bg-muted/20 dark:text-slate-100 dark:border-border/30': isUserSide && !isInlineEditing,
      // Inline edit mode: slightly stronger contrast
      'bg-muted/80 text-slate-900 border-border': isUserSide && isInlineEditing,
      'dark:bg-muted/40 dark:text-slate-100 dark:border-border/50': isUserSide && isInlineEditing,
      'shadow-sm': isUserSide,

      // === AI messages: full-width content, no bubble background (OpenAI-like) ===
      'w-full max-w-none px-1 py-2 text-slate-800 dark:text-slate-100': isAssistant,

      // === System messages: keep readable, but no background card ===
      'px-1 py-2': isSystem,
      'max-w-[80%] md:max-w-[70%] text-slate-700 dark:text-slate-200': isSystem,
    },
  );

  useEffect(() => {
    if (!isInlineEditing || !editTextareaRef.current) return;
    const el = editTextareaRef.current;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [isInlineEditing]);

  useEffect(() => {
    if (!isInlineEditing || !editTextareaRef.current) return;
    const el = editTextareaRef.current;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [editText, isInlineEditing]);

  // Alignment container - add more padding on sides
  // T30: Add consistent spacing between message groups
  // - Root messages get no bottom margin (AI response follows closely)
  // - Non-root user messages get mt-4 to create visual separation after AI responses  
  // - AI messages get mt-4 for consistent spacing after user questions (both root and non-root)
  const alignClass = isUserSide ? 'justify-end' : 'justify-start';
  const wrapperClass = cn(
    'flex w-full',
    alignClass,
    isRoot && 'mb-0',
    isUser && !isRoot && 'mt-4',
    isAssistant && 'mt-4'  // Consistent spacing for all AI messages
  );

  // T28-1: Show action buttons only for user messages (including root)
  // Root messages show buttons but they are disabled

  // T29-QA-3: Root question's first AI answer is at level=1, should not be favoritable
  // (root user question is level=0, its AI answer is level=1)
  const isRootAnswer = isAssistant && message.level === 1;

  // Markdown components for AI messages
  // T20260127: Wrapped in useMemo to prevent unnecessary re-renders of the markdown tree during streaming
  const markdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-xl font-bold mt-5 mb-3 text-slate-900 dark:text-white first:mt-0">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-lg font-semibold mt-5 mb-2.5 text-slate-900 dark:text-white first:mt-0">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-base font-medium mt-4 mb-2 text-slate-900 dark:text-white first:mt-0">{children}</h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-sm font-medium mt-3 mb-1.5 text-slate-800 dark:text-slate-100 first:mt-0">{children}</h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-4 pl-5 list-disc space-y-3 first:mt-0 last:mb-0 [&_ul]:my-2 [&_ul]:space-y-1.5 [&_ol]:my-2 [&_ol]:space-y-1.5">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="my-4 pl-5 list-decimal space-y-3 first:mt-0 last:mb-0 [&_ul]:my-2 [&_ul]:space-y-1.5 [&_ol]:my-2 [&_ol]:space-y-1.5">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-7 [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</li>
    ),
    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[13px] font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
            {children}
          </code>
        );
      }
      return (
        <code className="block text-[13px] font-mono whitespace-pre">
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre className="my-3 p-3.5 rounded-lg bg-slate-100 dark:bg-slate-900/80 overflow-x-auto text-[13px] first:mt-0 last:mb-0 whitespace-pre">
        {children}
      </pre>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="my-3 pl-3.5 border-l-3 border-emerald-500 italic text-slate-600 dark:text-slate-400 first:mt-0 last:mb-0">
        {children}
      </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        className="text-emerald-600 dark:text-emerald-400 hover:underline"
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    ),
    hr: () => <hr className="my-4 border-slate-200 dark:border-slate-700" />,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-slate-100 dark:bg-slate-800">{children}</thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="border-b border-slate-200 dark:border-slate-700">{children}</tr>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 text-left font-semibold text-slate-900 dark:text-white">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{children}</td>
    ),
  }), []);

  const renderContent = () => {
    // For AI messages: show optional reasoning block + normal answer stream
    if (isAssistant) {
      const hasReasoning = typeof message.reasoning === 'string' && message.reasoning.length > 0;
      const isReasoner = isDeepSeekReasoner(message.provider, message.model);
      const tagSplit = splitThinkingTags(message.text || '');
      const supportsReasoning = Boolean(message.reasoningSupported ?? (isReasoner || hasReasoning || tagSplit.found));
      const answerStarted = Boolean(message.answerStarted || (typeof message.text === 'string' && message.text.length > 0));
      const showReasoningContent = supportsReasoning && Boolean(message.reasoningVisible);
      const isReasoningStreaming = Boolean(isStreaming && !answerStarted);

      const effectiveReasoning = hasReasoning ? (message.reasoning as string) : (tagSplit.found ? tagSplit.reasoningText : '');
      const effectiveText = (() => {
        if (!tagSplit.found) return message.text;
        // Only strip tags when we still have a non-empty answer; otherwise:
        // - streaming: show empty answer (cursor/dots) instead of leaking <思考>
        // - non-streaming: keep original text to avoid hiding the only content
        const stripped = tagSplit.answerText;
        if (stripped.trim().length > 0) return stripped;
        return isStreaming ? '' : message.text;
      })();

      const groundingChunks = (message.groundingMetadata && Array.isArray(message.groundingMetadata.groundingChunks))
        ? message.groundingMetadata.groundingChunks
        : [];
      const hasGrounding = Boolean(groundingChunks.length > 0 || message.groundingMetadata?.searchEntryPoint);
      const showGroundingContent = Boolean(hasGrounding && message.groundingVisible);

      return (
        <div className="flex flex-col">
          {supportsReasoning && (
            <ReasoningBlock
              reasoning={effectiveReasoning}
              visible={Boolean(message.reasoningVisible)}
              isStreaming={Boolean(message.reasoningVisible) ? isReasoningStreaming : false}
              emptyBodyHint={isStreaming ? t(locale, 'ai_thinking') : t(locale, 'chat_reasoning_empty')}
              lang={locale}
            />
          )}

          {isStreaming && !effectiveText && !showReasoningContent ? (
            <div className="flex items-center gap-2.5 pt-1.5 pb-2.5">
              {/* oMyTree Thinking Indicator: Growing seed → sprouting animation */}
              <div className="relative flex items-center justify-center w-5 h-5">
                <span className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping" style={{ animationDuration: '1.8s' }} />
                <span className="absolute inset-[3px] rounded-full bg-emerald-500/25 animate-pulse" style={{ animationDuration: '1.2s' }} />
                <span className="relative w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]" />
              </div>
              <span className="text-xs text-muted-foreground/70 tracking-wide" style={{
                background: 'linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 80%)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 2s ease-in-out infinite',
              }}>{t(locale, 'chat_tree_growing')}</span>
              <style>{`@keyframes shimmer { 0%,100%{background-position:200% 0} 50%{background-position:-200% 0} }`}</style>
            </div>
          ) : effectiveText ? (
            <StreamingMarkdown
              text={effectiveText}
              isStreaming={isStreaming}
              components={markdownComponents}
              className="streaming-markdown streaming-text"
            />
          ) : (
            <div className="text-muted-foreground italic">(空消息)</div>
          )}

          {showGroundingContent && (
            <div className="mt-3">
              <GroundingBlock groundingMetadata={message.groundingMetadata} visible={true} />
            </div>
          )}

          {showReferences && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setCitationsOpen((v) => !v)}
                >
                  <span className="mr-1">参考内容</span>
                  <span className="text-[11px] text-muted-foreground/80">({citations.length})</span>
                  {citationsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  )}
                </Button>
              </div>

              {citationsOpen && (
                <div className="mt-2 rounded-xl border border-border/50 bg-muted/20 p-2.5 space-y-2">
                  {citations.length > 0 ? (
                    citations.slice(0, 8).map((c, idx) => (
                      <div
                        key={`${c.docId}-${idx}`}
                        className="rounded-lg border border-border/40 bg-background/30 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{c.docName || 'Unknown'}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                              {typeof c.snippet === 'string' && c.snippet.trim() ? c.snippet : '(无片段)'}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 rounded-lg text-xs"
                              onClick={() => {
                                setActiveCitation(c);
                                setCitationSheetOpen(true);
                              }}
                            >
                              查看片段
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 rounded-lg text-xs"
                              onClick={() => {
                                const kbId = c.kbId;
                                if (!kbId) return;
                                window.dispatchEvent(new CustomEvent('omytree:open-knowledge', {
                                  detail: { kbId, docId: c.docId },
                                }));
                              }}
                              disabled={!c.kbId}
                              title={!c.kbId ? '缺少 kbId，无法跳转' : '打开知识库'}
                            >
                              打开文档
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-muted-foreground px-1">
                      已选择知识库，但本次回答没有返回可展示的参考内容。
                    </div>
                  )}

                  {citations.length > 8 && (
                    <div className="text-[11px] text-muted-foreground px-1">
                      仅展示前 8 条引用（共 {citations.length} 条）
                    </div>
                  )}
                </div>
              )}

              <Sheet
                open={citationSheetOpen}
                onOpenChange={(open) => {
                  setCitationSheetOpen(open);
                  if (!open) setActiveCitation(null);
                }}
              >
                <SheetContent side="bottom" className="p-0">
                  <SheetHeader className="px-6 pt-5 pb-3">
                    <SheetTitle className="text-base">
                      {activeCitation?.docName || '引用片段'}
                    </SheetTitle>
                  </SheetHeader>
                  <div className="px-6 pb-6">
                    <ScrollArea className="max-h-[60vh] rounded-xl border border-border/50 bg-muted/10">
                      <div className="p-4 text-sm leading-7 whitespace-pre-wrap">
                        <HighlightedText text={activeCitation?.snippet || ''} terms={highlightTerms} />
                      </div>
                    </ScrollArea>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setCitationSheetOpen(false)}
                      >
                        关闭
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl"
                        onClick={() => {
                          const kbId = activeCitation?.kbId;
                          const docId = activeCitation?.docId;
                          if (!kbId || !docId) return;
                          setCitationSheetOpen(false);
                          setCitationsOpen(false);
                          window.dispatchEvent(new CustomEvent('omytree:open-knowledge', {
                            detail: { kbId, docId },
                          }));
                        }}
                        disabled={!activeCitation?.kbId || !activeCitation?.docId}
                      >
                        去查看文档
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      );
    }

    // For user messages, plain text
    return message.text || '(空消息)';
  };

  const tagSplitForSupport = isAssistant ? splitThinkingTags(message.text || '') : { found: false, reasoningText: '', answerText: '' };
  const hasReasoningForSupport = isAssistant && typeof message.reasoning === 'string' && message.reasoning.length > 0;
  const isReasoner = isAssistant ? isDeepSeekReasoner(message.provider, message.model) : false;
  const supportsReasoning = isAssistant
    ? Boolean(message.reasoningSupported ?? (isReasoner || hasReasoningForSupport || tagSplitForSupport.found))
    : false;
  const canToggleReasoning = isAssistant && supportsReasoning;
  const isReasoningVisible = Boolean(message.reasoningVisible);

  const groundingChunks = (message.groundingMetadata && Array.isArray(message.groundingMetadata.groundingChunks))
    ? message.groundingMetadata.groundingChunks
    : [];
  const hasGrounding = isAssistant && Boolean(groundingChunks.length > 0 || message.groundingMetadata?.searchEntryPoint);
  const canToggleGrounding = Boolean(hasGrounding);
  const isGroundingVisible = Boolean(message.groundingVisible);

  return (
    <div className={wrapperClass} data-message-id={message.id}>
      {/* User/Root messages: bubble with action icons outside bottom-right */}
      {isUserSide ? (
        <div className="group flex flex-col items-end w-full">
          {/* T88: Show attachment cards first (ChatGPT/Gemini style) */}
          {/* Moved outside bubble per user request for better UI/UX */}
          {(message.attachments && message.attachments.length > 0 || message.knowledge) && !isInlineEditing && (
            <div className="flex flex-col items-end gap-2 mb-2">
              {message.knowledge && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100/50 dark:border-indigo-800/30 text-[11px] font-medium transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/30 shadow-sm shadow-indigo-200/20 dark:shadow-none">
                  <Database className="w-3.5 h-3.5" />
                  <span>{message.knowledge.baseName || '知识库'}</span>
                  {typeof message.knowledge.documentCount === 'number' && message.knowledge.documentCount > 0 && (
                    <span className="opacity-60 ml-0.5">({message.knowledge.documentCount} {lang === 'zh' ? '个文档' : 'docs'})</span>
                  )}
                </div>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachmentList
                  attachments={message.attachments}
                  lang={lang === 'zh' ? 'zh-CN' : 'en'}
                  onPreview={onPreviewAttachment}
                  className="w-full"
                />
              )}
            </div>
          )}

          <div className={bubbleClass}>
            {/* T31-3: Removed "当前" indicator from user messages - only show on AI bubbles */}

            {/* Message content */}
            {isInlineEditing ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-white/75 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/50 px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
                  <textarea
                    ref={editTextareaRef}
                    value={editText}
                    onChange={(e) => onEditChange?.(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.nativeEvent as any)?.isComposing) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!editConfirmDisabled && editText.trim()) {
                          onEditConfirm?.();
                        }
                      }
                    }}
                    placeholder="输入新的问题..."
                    className="w-full min-h-[96px] max-h-[240px] resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-slate-400/80"
                    disabled={editDisabled}
                  />
                </div>

                {/* Edit-mode attachments (add/remove) */}
                {(onEditUploadFiles || (onEditRemoveAttachment && editAttachList.length > 0) || editAttachList.length > 0 || editPendingList.length > 0) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500/80 dark:text-slate-400/80">附件</span>
                      {onEditUploadFiles && (
                        <>
                          <input
                            ref={editFileInputRef}
                            type="file"
                            className="hidden"
                            multiple
                            onChange={(e) => {
                              const files = e.currentTarget.files;
                              if (files && files.length > 0) {
                                onEditUploadFiles(files);
                              }
                              // allow selecting the same file again
                              e.currentTarget.value = '';
                            }}
                            disabled={editAttachDisabled}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 px-2.5 gap-1',
                              editAttachDisabled && 'opacity-60 cursor-not-allowed'
                            )}
                            onClick={() => {
                              if (editAttachDisabled) return;
                              editFileInputRef.current?.click();
                            }}
                            disabled={editAttachDisabled}
                            title="新增文件"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="text-xs">新增文件</span>
                          </Button>
                        </>
                      )}
                    </div>

                    {(editPendingList.length > 0 || editAttachList.length > 0) && (
                      <UploadChipsContainer>
                        {editPendingList.map((u) => (
                          <UploadChip
                            key={u.id}
                            uploadId={u.id}
                            fileName={u.fileName}
                            sizeBytes={u.sizeBytes}
                            status={u.status}
                            errorMessage={u.errorMessage}
                            onRetry={
                              u.status === 'error' && onEditRetryPendingUpload
                                ? () => onEditRetryPendingUpload(u.id)
                                : undefined
                            }
                            onRemove={
                              onEditRemovePendingUpload
                                ? () => onEditRemovePendingUpload(u.id)
                                : undefined
                            }
                            removeDisabled={editAttachDisabled}
                          />
                        ))}
                        {editAttachList.map((att) => (
                          <UploadChip
                            key={att.id}
                            uploadId={att.id}
                            fileName={att.fileName}
                            sizeBytes={att.sizeBytes}
                            status="success"
                            onPreview={() => onPreviewAttachment?.(att)}
                            onRemove={
                              onEditRemoveAttachment
                                ? () => onEditRemoveAttachment(att.id)
                                : undefined
                            }
                            removeDisabled={editAttachDisabled}
                          />
                        ))}
                      </UploadChipsContainer>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-slate-500/80 dark:text-slate-400/80">
                  {editNotice}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-3"
                    onClick={onEditCancel}
                    disabled={editDisabled}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-3"
                    onClick={onEditConfirm}
                    disabled={editConfirmDisabled}
                  >
                    {editSubmitting ? '更新中...' : '更新'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {renderContent()}
              </div>
            )}
          </div>

          {/* Action icons outside bubble, bottom-right, hover to show */}
          {canShowActions && !isInlineEditing && (
            <div className="flex items-center gap-1 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Copy button — always available for user messages */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent"
                onClick={handleCopy}
                disabled={!message.text}
                title={t(locale, 'chat_copy_content')}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="sr-only">{t(locale, 'chat_copy')}</span>
              </Button>
              {onEditQuestion && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 w-6 p-0 hover:bg-transparent",
                    areActionsDisabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                  onClick={() => !areActionsDisabled && onEditQuestion(message.id, message.text)}
                  disabled={areActionsDisabled}
                  title={isRoot ? "根消息不能编辑" : "编辑问题"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{isRoot ? "不可编辑" : "编辑"}</span>
                </Button>
              )}
              {onDeleteFrom && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 w-6 p-0 hover:bg-transparent",
                    areActionsDisabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground/60 hover:text-destructive"
                  )}
                  onClick={() => !areActionsDisabled && onDeleteFrom(message.id)}
                  disabled={areActionsDisabled}
                  title={isRoot ? "根消息不能删除" : "从此处删除"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">{isRoot ? "不可删除" : "删除"}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      ) : isAssistant ? (
        // AI content block: header with provider name, footer with actions
        <div className="group flex flex-col w-full">
          <div className={bubbleClass}>
            {/* AI header with provider label badge */}
            <div className="mb-2.5 flex items-center justify-between">
              <div className="relative flex items-center gap-2 pl-6">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {/* sourceLabel as plain text (OpenAI-like) */}
                {message.sourceLabel && (
                  <span className="text-[11px] text-muted-foreground">
                    {message.sourceLabel}
                  </span>
                )}
                {message.isCurrent && (
                  <span className="inline-flex items-center gap-1 ml-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[11px] text-primary font-medium">{t(locale, 'chat_current')}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {canToggleReasoning && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100"
                    onClick={() => onToggleReasoningVisible?.(message.id, !isReasoningVisible)}
                    aria-expanded={isReasoningVisible}
                    title={isReasoningVisible ? t(locale, 'chat_reasoning_hide') : t(locale, 'chat_reasoning_show')}
                  >
                    {isReasoningVisible ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>{t(locale, 'chat_reasoning_label')}</span>
                  </button>
                )}

                {canToggleGrounding && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100"
                    onClick={() => onToggleGroundingVisible?.(message.id, !isGroundingVisible)}
                    aria-expanded={isGroundingVisible}
                    title={isGroundingVisible ? '收起来源' : '展开来源'}
                  >
                    {isGroundingVisible ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>来源</span>
                  </button>
                )}
                {isStreaming && supportsReasoning && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {t(locale, 'ai_thinking')}
                  </span>
                )}
              </div>
            </div>

            {/* Message content */}
	            <div className="relative">
	              <div
	                ref={aiContentRef}
	                className={cn(
	                  // AI output default font size: align with mainstream chat products (≈16px)
	                  "text-base break-words relative",
	                  "leading-7",
	                  "streaming-container"
	                )}
	              >
	                {renderContent()}
	              </div>

              {/* P1-1: Annotation Wave Highlights & Gutter Bookmarks */}
              {isAssistant && annotations.length > 0 && (
                <AnnotationHighlight
                  annotations={annotations}
                  containerRef={aiContentRef}
                  isStreaming={isStreaming}
                  onRectsUpdate={handleRectsUpdate}
                  onClickAnnotation={handleClickAnnotation}
                />
              )}

              {/* P1-3: Annotation Preview Card (on hover) */}
              <AnimatePresence>
                {hoveredAnnotation && hoverAnchorRect && aiContentRef.current && (
                  <div
                    className="absolute z-[100]"
                    style={{
                      top: `${hoverAnchorRect.top - aiContentRef.current.getBoundingClientRect().top - 12}px`,
                      left: `${hoverAnchorRect.left - aiContentRef.current.getBoundingClientRect().left + hoverAnchorRect.width / 2}px`,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    <AnnotationPreviewCard
                      annotation={hoveredAnnotation}
                      lang={lang}
                      index={hoveredIndex >= 0 ? hoveredIndex : undefined}
                      total={sortedAnnotations.length || undefined}
                      onPrev={() => {
                        if (sortedAnnotations.length <= 1) return;
                        const idx = hoveredIndex;
                        if (idx < 0) return;
                        const prevIdx = (idx - 1 + sortedAnnotations.length) % sortedAnnotations.length;
                        const prevAnno = sortedAnnotations[prevIdx];
                        setHoveredAnnotation(prevAnno);
                        const nextRect = annotationRectsById[prevAnno.id];
                        if (nextRect) setHoverAnchorRect(nextRect);
                      }}
                      onNext={() => {
                        if (sortedAnnotations.length <= 1) return;
                        const idx = hoveredIndex;
                        if (idx < 0) return;
                        const nextIdx = (idx + 1) % sortedAnnotations.length;
                        const nextAnno = sortedAnnotations[nextIdx];
                        setHoveredAnnotation(nextAnno);
                        const nextRect = annotationRectsById[nextAnno.id];
                        if (nextRect) setHoverAnchorRect(nextRect);
                      }}
                      onPointerEnter={() => {
                        setIsPreviewHovered(true);
                        clearPreviewCloseTimer();
                      }}
                      onPointerLeave={() => {
                        setIsPreviewHovered(false);
                        scheduleClosePreview();
                      }}
                      onClose={() => setHoveredAnnotation(null)}
                      onEdit={(anno) => {
                        setHoveredAnnotation(null);
                        setEditingAnnotation(anno);
                        setEditingAnchorRect(hoverAnchorRect);
                      }}
                      onDelete={(anno) => {
                        setHoveredAnnotation(null);
                        if (onDeleteInlineAnnotation) {
                          onDeleteInlineAnnotation(message.id, anno.id);
                        }
                      }}
                    />
                  </div>
                )}
              </AnimatePresence>

              {/* P1-3: Inline edit popover for existing annotations */}
              <AnimatePresence>
                {editingAnnotation && editingAnchorRect && aiContentRef.current && (
                  <div
                    className="absolute z-[110]"
                    style={{
                      top: `${editingAnchorRect.top - aiContentRef.current.getBoundingClientRect().top - 10}px`,
                      left: `${editingAnchorRect.left - aiContentRef.current.getBoundingClientRect().left + editingAnchorRect.width / 2}px`,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    <AnnotationNotePopover
                      quote={editingAnnotation.quote}
                      initialNote={editingAnnotation.note || ''}
                      lang={lang}
                      onSave={(note) => {
                        if (onUpdateInlineAnnotation) {
                          onUpdateInlineAnnotation(message.id, editingAnnotation.id, note);
                        }
                        setEditingAnnotation(null);
                        setEditingAnchorRect(undefined);
                      }}
                      onClose={() => {
                        setEditingAnnotation(null);
                        setEditingAnchorRect(undefined);
                      }}
                    />
                  </div>
                )}
              </AnimatePresence>

              {/* P2-2: Inline annotation toolbar (selection-based) */}
              {onCreateInlineAnnotation && !isStreaming && (
                <InlineAnnotationToolbar
                  messageId={message.id}
                  contentRef={aiContentRef}
                  onAnnotate={handleAnnotate}
                  lang={lang}
                  isStreaming={isStreaming}
                />
              )}
            </div>

            {/* T93-UX: Inline Outcome Creation Area */}
            <AnimatePresence>
              {isInlineCreatingOutcome && outcomePreview && outcomeCreate && (
                <InlineOutcomeCreate
                  lang={lang === 'zh' ? 'zh-CN' : 'en'}
                  treeId={treeId}
                  anchorNodeId={message.id}
                  preview={outcomePreview}
                  create={outcomeCreate}
                  onCreated={onOutcomeCreated}
                  onCancel={onCancelInlineOutcome ?? NOOP}
                />
              )}
            </AnimatePresence>
          </div>

          {/* AI footer actions outside bubble, bottom-left */}
          {!isStreaming && (
            <div className="flex items-center gap-1 mt-1.5 ml-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {isGeneratedImageResult ? (
                <a
                  href={firstGeneratedImageDownloadUrl || '#'}
                  download
                  className={cn(
                    "inline-flex",
                    (!firstGeneratedImageDownloadUrl || actionsDisabled) && "pointer-events-none"
                  )}
                  aria-disabled={!firstGeneratedImageDownloadUrl || actionsDisabled}
                  title={lang === 'en' ? 'Download image' : '下载图片'}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 w-6 p-0 hover:bg-transparent",
                      (!firstGeneratedImageDownloadUrl || actionsDisabled)
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                    disabled={!firstGeneratedImageDownloadUrl || actionsDisabled}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="sr-only">{lang === 'en' ? 'Download image' : '下载图片'}</span>
                  </Button>
                </a>
              ) : (
                <>
                  {/* Copy button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent"
                    onClick={handleCopy}
                    disabled={actionsDisabled || !message.text}
                    title={t(locale, 'chat_copy_content')}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">{t(locale, 'chat_copy')}</span>
                  </Button>

                  {/* Generate report button */}
                  {onCreateOutcome && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-6 w-6 p-0 hover:bg-transparent",
                        outcomeActionDisabled
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : "text-muted-foreground/60 hover:text-primary"
                      )}
                      onClick={() => !outcomeActionDisabled && onCreateOutcome(message.id)}
                      disabled={outcomeActionDisabled}
                      title={t(locale, 'chat_generate_report')}
                    >
                      <Milestone className="h-3.5 w-3.5" />
                      <span className="sr-only">{t(locale, 'chat_generate_report')}</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        // System messages
        <div className={bubbleClass}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MessageCircle className="h-3 w-3 opacity-60" />
            <span className="font-medium">系统</span>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleImpl);
