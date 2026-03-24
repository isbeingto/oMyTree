import { formatKeyframeAnnotation, type InlineAnnotationSelection } from '@/lib/annotations';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { 
  MoreHorizontal, 
  Plus, 
  ArrowUp, 
  ArrowDown, 
  TreeDeciduous, 
  FolderTree, 
  Loader2, 
  Menu, 
  Apple, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  XCircle, 
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatMessage, ChatMessageBubble } from './ChatMessageBubble';
import { ModelPicker, type ProviderWithModels, ModelTag } from '@/components/composer/ModelPicker';
import { ProfileCapsule } from '@/components/composer/ProfileCapsule';
import { UploadChip, UploadChipsContainer, type UploadStatus } from '@/components/composer/UploadChip';
import { getUploadConstraints } from '@/hooks/use-upload';
import { cn } from '@/lib/utils';
import { t, normalizeLang, type Lang } from '@/lib/i18n';
import type { Keyframe, KnowledgeBase, OutcomeDetailResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import OutcomeCapsule, { type OutcomeCapsuleHandle } from '@/components/outcome/OutcomeCapsule';
import { OutcomeDetail } from '@/components/outcome/OutcomeDetail';
import { InlineOutcomeCreate } from '@/components/outcome/InlineOutcomeCreate';
import { useOutcomes } from '@/app/tree/useOutcomes';

import { type MessageAttachment, isImageFile, formatFileSize } from '@/components/message/MessageAttachmentCard';
import { UploadPreviewPanel } from '@/components/composer/UploadPreviewPanel';
import { Download, ExternalLink, FileText, Library } from 'lucide-react';
import { 
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { KBChip, KBChipsContainer, DocChip, OverflowChip } from '@/components/composer/KBChip';
import { KnowledgeMentionPicker } from '@/components/composer/KnowledgeMentionPicker';

const ONBOARDING_KEY = 'omytree_onboarding_v1';
let inputMorphReadyGlobal = false;
const COMPOSER_INPUT_FONT_STACK = 'var(--font-sans)';

// ============== Progressive Message Loading (Gemini-style) ==============
// Initial number of messages to render (from the bottom). This keeps first paint fast.
const INITIAL_VISIBLE_MESSAGES = 30;
// How many messages to load per batch when user scrolls up.
const MESSAGE_LOAD_BATCH_SIZE = 20;
// Threshold in px from top of scroll container to trigger "load more" hint visibility.
const LOAD_MORE_SCROLL_THRESHOLD = 120;

export type ComposerModelOption = {
  id: string;
  label: string;
  description?: string;
  group?: 'platform' | 'byok' | string;
  badge?: string;
  provider: string;
  model?: string | null;
  providerLabel?: string;
  modelLabel?: string;
  isByok?: boolean;
};

/**
 * T29-QA-5: Provider with models for dual-segment picker
 */
export type ComposerProviderOption = ProviderWithModels;

/**
 * T56-2: Handle type for ChatPane ref
 * T59-1: Enhanced to return success/failure status for fallback handling
 */
export type ChatPaneHandle = {
  /** Scroll to a specific message by ID. Returns true if message was found and scrolled to. */
  scrollToMessage: (messageId: string) => boolean;
  /** Scroll so the Q&A turn containing this message starts at the top (Gemini-style). */
  scrollToTurnTopForMessage: (messageId: string, behavior?: ScrollBehavior) => boolean;
  /** Scroll to bottom */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** T93-13: Open Outcome create modal (anchored to current node) */
  openOutcomeCreateModal: () => void;
};

export interface ChatPaneProps {
  /** Tree title / topic */
  treeTitle: string;
  /** Current node label, e.g. "#3 · User" */
  nodeLabel?: string;
  /** Callbacks for export/share (for menu entries) */
  onExportJson?: () => void;
  onExportMarkdown?: () => void;
  /** Share state and actions */
  isShared?: boolean;
  onCopyShareLink?: () => void;
  onToggleShare?: () => void;
  /** Messages to display */
  messages: ChatMessage[];
  /** Optional: show new tree topic input */
  newTreeControls?: React.ReactNode;
  /** T37-0: Context profile & scope for capsule */
  contextProfile?: 'lite' | 'standard' | 'max' | null;
  memoryScope?: 'branch' | 'tree' | null;
  /** T53-2: Tree config editing */
  treeId?: string | null;
  /** Current active node id (used for Layer2 Outcomes anchor, etc.) */
  currentNodeId?: string | null;
  isUsingByok?: boolean;
  /** T61: Callback when source chip is clicked (for memo anchor jump-back) */
  onSourceClick?: (source: string) => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSend?: () => void;
  isSending?: boolean;
  readonly?: boolean;
  autoFocusInput?: boolean;
  /** User preferred language */
  lang?: Lang;
  /** T26-5: Callback when user sends first message (to mark onboarding complete) */
  onFirstMessageSent?: () => void;
  /** T28-1: Callback when "Edit question" is clicked on a user message */
  onEditQuestion?: (messageId: string, currentText: string) => void;
  /** T28-1: Inline edit state */
  editingMessageId?: string | null;
  /** T28-1: Current edit draft */
  editDraft?: string;
  /** T28-1: Update edit draft */
  onEditDraftChange?: (value: string) => void;
  /** T28-1: Cancel inline edit */
  onEditCancel?: () => void;
  /** T28-1: Confirm inline edit */
  onEditConfirm?: () => void;
  /** T28-1: Edit submission state */
  editSubmitting?: boolean;
  /** Edit-mode: attachments selected for this edit */
  editAttachments?: MessageAttachment[];
  /** Edit-mode: remove an attachment from this edit */
  onEditRemoveAttachment?: (attachmentId: string) => void;
  /** Edit-mode: upload files and attach to this edit */
  onEditUploadFiles?: (files: FileList) => void;
  /** Edit-mode: uploads currently uploading/failed (show in edit bubble) */
  editPendingUploads?: Array<{ id: string; fileName: string; sizeBytes?: number; status: UploadStatus; errorMessage?: string }>;
  /** Edit-mode: remove a pending/failed upload */
  onEditRemovePendingUpload?: (uploadId: string) => void;
  /** Edit-mode: retry a failed upload */
  onEditRetryPendingUpload?: (uploadId: string) => void;
  /** T28-1: Callback when "Delete from here" is clicked on a user message */
  onDeleteFrom?: (messageId: string) => void;
  /** T28-1: Whether message actions are disabled */
  messageActionsDisabled?: boolean;

  /** Keyframes: Map of raw node IDs to keyframe info */
  keyframesMap?: Record<string, Keyframe>;
  /** P2-2: Callback when user creates inline annotation from text selection */
  onCreateInlineAnnotation?: (payload: InlineAnnotationSelection) => void;
  /** P2-2: Callback when user updates a specific annotation note */
  onUpdateInlineAnnotation?: (messageId: string, annotationId: string, note: string) => void;
  /** P2-2: Callback when user deletes a specific annotation */
  onDeleteInlineAnnotation?: (messageId: string, annotationId: string) => void;

  /** Phase 4: Keyframes curation (Dynamic Island in top capsule bar) */
  keyframes?: Keyframe[];
  onUnpinKeyframe?: (nodeId: string) => void;
  onUpdateKeyframeAnnotation?: (nodeId: string, annotation: string | null) => void;
  modelsLoading?: boolean;
  modelError?: string | null;
  /** T29-QA-5: Two-segment picker - provider options with models */
  providerOptions?: ComposerProviderOption[];
  /** T29-QA-5: Currently selected provider ID */
  selectedProviderId?: string | null;
  /** T29-QA-5: Currently selected model ID (within provider) */
  selectedModelIdNew?: string | null;
  /** T29-QA-5: Callback when provider changes */
  onProviderChange?: (providerId: string) => void;
  /** T29-QA-5: Callback when model changes */
  onModelChangeNew?: (modelId: string) => void;
  /** T30: Callback to open mobile tree view */
  onOpenMobileTree?: () => void;
  /** Mobile-only: open the left tree list sidebar (AppShell Sheet) */
  onOpenMobileSidebar?: () => void;
  /** Interrupt current AI streaming reply */
  onAbortStream?: () => void;
  /** Whether this view is the "new tree" (Genesis) session */
  isNewTreeSession?: boolean;
  /** T54-1: Advanced mode enabled (from user settings) */
  advancedEnabled?: boolean;
  /** T54-1: New tree profile selection (Genesis View only) */
  newTreeProfile?: 'lite' | 'standard' | 'max' | null;
  /** T54-1: New tree memory scope selection (Genesis View only) */
  newTreeScope?: 'branch' | 'tree';
  /** T54-1: Callback when new tree profile changes */
  onNewTreeProfileChange?: (profile: 'lite' | 'standard' | 'max') => void;
  /** T54-1: Callback when new tree scope changes */
  onNewTreeScopeChange?: (scope: 'branch' | 'tree') => void;
  /** T54-1: Profile selection error */
  profileError?: string | null;
  /** T84: Callback for file upload */
  onFileUpload?: (file: File) => Promise<void>;
  /** T84: Whether file upload is in progress */
  isUploading?: boolean;
  /** T85: Upload chips to display */
  uploadChips?: Array<{
    id: string;
    fileName: string;
    sizeBytes?: number;
    status: UploadStatus;
    errorMessage?: string;
  }>;
  /** T85: Callback when upload chip is removed */
  onRemoveUpload?: (uploadId: string) => void;
  /** T85: Callback when failed upload is retried */
  onRetryUpload?: (uploadId: string) => void;
  /** T87: Callback when upload chip is clicked for preview */
  onPreviewUpload?: (uploadId: string) => void;
  /** T85: Upload hint text (e.g., native file parsing notice) */
  uploadHint?: string | null;
  /** Upload input accept (provider/mode-aware). If omitted, falls back to local-mode defaults. */
  uploadAccept?: string | null;
  /** Optional tooltip line describing supported formats */
  uploadFormatsHint?: string | null;
  /** Optional tooltip line describing size limits */
  uploadMaxSizeHint?: string | null;
  
  /** KB-2: Knowledge bases selected for this conversation */
  selectedKBs?: KnowledgeBase[];
  /** KB-2: Callback to add a knowledge base to the conversation */
  onAddKB?: (id: string, name: string) => void;
  /** KB-2: Callback to remove a knowledge base from the conversation */
  onRemoveKB?: (id: string) => void;

  /** KB-2 (Aligned): Single knowledge base + optional documents selection */
  selectedKnowledge?: {
    kb: KnowledgeBase | null;
    docs: Array<{ id: string; name: string; parse_status?: string; enable_status?: string }>;
  };
  /** KB-2 (Aligned): Apply KB + docs selection */
  onApplyKnowledge?: (selection: {
    kb: KnowledgeBase | null;
    docs: Array<{ id: string; name: string; parse_status?: string; enable_status?: string }>;
  }) => void;
  /** KB-2 (Aligned): Remove a selected document */
  onRemoveKnowledgeDoc?: (docId: string) => void;
  /** KB-2 (Aligned): Open Knowledge Manager panel */
  onOpenKnowledgeManager?: () => void;

  /** Session user id for API calls that require ownership */
  sessionUserId?: string | null;

  /** DeepSeek Reasoning: toggle reasoning visibility per message */
  onToggleReasoningVisible?: (messageId: string, nextVisible: boolean) => void;
  /** Gemini Grounding: toggle grounding visibility per message */
  onToggleGroundingVisible?: (messageId: string, nextVisible: boolean) => void;

  /** T93-12: Outcome selection callback */
  onSelectOutcome?: (outcomeId: string, detail: OutcomeDetailResponse) => void;
  /** T93-11/17: Active outcome for detail view */
  activeOutcomeId?: string | null;
  activeOutcomeDetail?: OutcomeDetailResponse | null;
  onOutcomeDetailChange?: (detail: OutcomeDetailResponse) => void;
  onClearOutcome?: () => void;
}

export const ChatPane = forwardRef<ChatPaneHandle, ChatPaneProps>(function ChatPane({
  treeTitle,
  nodeLabel,
  onExportJson,
  onExportMarkdown,
  isShared,
  onCopyShareLink,
  onToggleShare,
  messages,
  newTreeControls,
  // T37-0: New context capsule props
  contextProfile,
  memoryScope,
  // T53-2: Tree config editing
  treeId,
  currentNodeId = null,
  isUsingByok,
  inputValue,
  onInputChange,
  onSend,
  isSending,
  readonly = false,
  autoFocusInput = false,
  lang = 'en',
  onFirstMessageSent,
  onEditQuestion,
  editingMessageId = null,
  editDraft = '',
  onEditDraftChange,
  onEditCancel,
  onEditConfirm,
  editSubmitting = false,
  editAttachments,
  onEditRemoveAttachment,
  onEditUploadFiles,
  editPendingUploads,
  onEditRemovePendingUpload,
  onEditRetryPendingUpload,
  onDeleteFrom,
  messageActionsDisabled = false,
  keyframesMap = {},
  onCreateInlineAnnotation,
  onUpdateInlineAnnotation,
  onDeleteInlineAnnotation,
  keyframes = [],
  onUnpinKeyframe,
  onUpdateKeyframeAnnotation,
  modelsLoading = false,
  modelError = null,
  // T29-QA-5: New dual-segment picker props
  providerOptions = [],
  selectedProviderId = null,
  selectedModelIdNew = null,
  onProviderChange,
  onModelChangeNew,
  onOpenMobileTree,
  onOpenMobileSidebar,
  onAbortStream,
  isNewTreeSession = false,
  // T54-1: Advanced mode profile capsule props
  advancedEnabled = false,
  newTreeProfile = null,
  newTreeScope = 'branch',
  onNewTreeProfileChange,
  onNewTreeScopeChange,
  profileError = null,
  // T61: Memo panel source click
  onSourceClick,
  // T84: File upload
  onFileUpload,
  isUploading = false,
  // T85: Upload chips
  uploadChips = [],
  onRemoveUpload,
  onRetryUpload,
  // T87: Upload preview
  onPreviewUpload,
  uploadHint,
  uploadAccept = null,
  uploadFormatsHint = null,
  uploadMaxSizeHint = null,
  onToggleReasoningVisible,
  onToggleGroundingVisible,
  onSelectOutcome,
  activeOutcomeId = null,
  activeOutcomeDetail = null,
  onOutcomeDetailChange,
  onClearOutcome,
  selectedKBs = [],
  onAddKB,
  onRemoveKB,
  selectedKnowledge,
  onApplyKnowledge,
  onRemoveKnowledgeDoc,
  onOpenKnowledgeManager,
  sessionUserId = null,
}, ref) {
  const { toast } = useToast();
  const router = useRouter();

  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

  const defaultUploadAccept = useMemo(() => {
    return getUploadConstraints({ mode: 'local', provider: null }).accept;
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // T93-13: Unified "create outcome" entry points
  const outcomeCapsuleRef = useRef<OutcomeCapsuleHandle>(null);
  // T84: File upload input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // T93-UX: Inline outcome creation state
  const [activeInlineOutcomeMessageId, setActiveInlineOutcomeMessageId] = useState<string | null>(null);

  // T-DRAG: Drag-and-drop file upload overlay state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // KB-2: Knowledge Base picker state
  const [showKBPicker, setShowKBPicker] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  // KB-FIX: Protect against immediate close events after opening the KB picker.
  // When opening from DropdownMenu, there's a race condition where Popover's
  // outside-click detection fires immediately after the picker becomes visible.
  const kbPickerJustOpenedRef = useRef<number>(0);

  // ============== T-PROGRESSIVE: Progressive Message Loading ==============
  // Track how many messages (from the end) to render. Start with INITIAL_VISIBLE_MESSAGES.
  // When user scrolls to top, we increase this in batches.
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const prevMessageCountRef = useRef(messages.length);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when switching to a different tree or when messages change significantly
  useEffect(() => {
    const prev = prevMessageCountRef.current;
    const curr = messages.length;
    prevMessageCountRef.current = curr;

    // If message count decreased (switched tree) or jumped by a lot, reset
    if (curr < prev || Math.abs(curr - prev) > 10) {
      setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
    }
    // If new messages arrived while already showing all, keep showing all
    if (curr > prev && visibleMessageCount >= prev) {
      setVisibleMessageCount(curr);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute visible messages: always show the last `visibleMessageCount` messages.
  // If total messages <= INITIAL_VISIBLE_MESSAGES, show all (no truncation).
  const hasHiddenMessages = messages.length > visibleMessageCount;
  const hiddenMessageCount = hasHiddenMessages ? messages.length - visibleMessageCount : 0;
  const visibleMessages = useMemo(() => {
    if (!hasHiddenMessages) return messages;
    return messages.slice(messages.length - visibleMessageCount);
  }, [messages, visibleMessageCount, hasHiddenMessages]);

  // Load more messages handler (preserves scroll position)
  const handleLoadMoreMessages = useCallback(() => {
    const container = scrollContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    setVisibleMessageCount((prev) => Math.min(prev + MESSAGE_LOAD_BATCH_SIZE, messages.length));

    // After React re-renders with more messages, restore scroll position
    // so the viewport doesn't jump. The new messages appear ABOVE the current view.
    requestAnimationFrame(() => {
      if (!container) return;
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeight;
      container.scrollTop = prevScrollTop + scrollDiff;
    });
  }, [messages.length]);

  // Auto-load when user scrolls near the top (IntersectionObserver on sentinel)
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasHiddenMessages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMoreMessages();
        }
      },
      { root: container, rootMargin: `${LOAD_MORE_SCROLL_THRESHOLD}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasHiddenMessages, handleLoadMoreMessages]);

  const effectiveKnowledgeKb = selectedKnowledge?.kb ?? (selectedKBs.length > 0 ? selectedKBs[0] : null);
  const effectiveKnowledgeDocs = selectedKnowledge?.docs ?? [];
  const isAlignedKnowledgeMode = Boolean(onApplyKnowledge || selectedKnowledge);

  const handleRemoveKnowledgeKb = useCallback(() => {
    if (onApplyKnowledge) {
      onApplyKnowledge({ kb: null, docs: [] });
      return;
    }
    if (effectiveKnowledgeKb) {
      onRemoveKB?.(effectiveKnowledgeKb.id);
    }
  }, [effectiveKnowledgeKb, onApplyKnowledge, onRemoveKB]);

  const handleRemoveKnowledgeDoc = useCallback((docId: string) => {
    if (onRemoveKnowledgeDoc) {
      onRemoveKnowledgeDoc(docId);
      return;
    }
    if (onApplyKnowledge) {
      onApplyKnowledge({
        kb: effectiveKnowledgeKb,
        docs: effectiveKnowledgeDocs.filter((d) => d.id !== docId),
      });
    }
  }, [effectiveKnowledgeDocs, effectiveKnowledgeKb, onApplyKnowledge, onRemoveKnowledgeDoc]);

  const handleCreateInlineOutcomeForMessage = useCallback((messageId: string) => {
    setActiveInlineOutcomeMessageId(messageId);
  }, []);

  const handleCancelInlineOutcome = useCallback(() => {
    setActiveInlineOutcomeMessageId(null);
  }, []);

  const outcomesApi = useOutcomes(treeId, {
    userId: sessionUserId,
    enabled: Boolean(treeId),
    autoFetch: false, // ChatPane doesn't need to fetch the full list, just provide preview/create
  });

  // Only show Genesis UI (center capsule + morph) when we are truly in the "new tree" session.
  // This prevents a transient empty `messages` (during existing↔existing conversation switch/loading)
  // from flashing the Genesis view + input slide-down animation.
  const isGenesis = isNewTreeSession && messages.length === 0;

  // Track bottom composer height so message list padding stays accurate on mobile
  // (prevents large blank space and intermittent "far from input" gaps when textarea/upload chips resize).
  const composerDockRef = useRef<HTMLDivElement>(null);
  const [composerDockHeight, setComposerDockHeight] = useState<number>(0);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  
  // ============== T-SCROLL-FIX: Refactored Smart Auto-Scroll ==============
  // Core principle (UX redesign):
  // 1. Default: do NOT auto-follow AI output
  // 2. User can opt-in by tapping "scroll to bottom"
  // 3. When user scrolls up, treat as "reading mode"
  
  // T-GEMINI-STYLE: Track scroll container viewport height for min-height on last Q&A turn.
  // Gemini's secret: the last conversation-container gets min-height = viewport height,
  // so the user message naturally starts at the top and AI response flows below.
  const scrollContainerHeightRef = useRef<number>(0);
  const [scrollContainerHeight, setScrollContainerHeight] = useState<number>(0);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        scrollContainerHeightRef.current = h;
        setScrollContainerHeight(h);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Track if user has intentionally scrolled away from bottom
  const userScrolledUpRef = useRef<boolean>(false);
  // Track if a wheel/touch event just happened (user interaction)
  const userInteractingRef = useRef<boolean>(false);
  // Programmatic scroll can trigger scroll events; ignore only the next few scroll events
  // caused by our own `scrollTop` writes (do NOT time-window ignore, it breaks streaming unlock).
  const ignoreProgrammaticScrollEventsRef = useRef<number>(0);


  // Track viewport height changes (iOS address bar / viewport resize) so we can keep the chat pinned
  // to the bottom when the user hasn't intentionally scrolled up.
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  // T-FIX-KEYBOARD: Track window inner height separately to detect iOS keyboard
  const [windowInnerHeight, setWindowInnerHeight] = useState<number>(0);
  
  const measureComposerDockHeight = useCallback(() => {
    const el = composerDockRef.current;
    if (!el) {
      setComposerDockHeight(0);
      return;
    }

    const rawHeight = Math.round(el.getBoundingClientRect().height);
    // Cap to a reasonable portion of the viewport to avoid runaway padding when Safari toggles UI chrome.
    const maxAllowed = viewportHeight ? Math.round(viewportHeight * 0.75) : null;
    const next = maxAllowed && rawHeight > maxAllowed ? maxAllowed : rawHeight;

    // Only update if change is significant to avoid jitter
    setComposerDockHeight((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  }, [viewportHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const set = () => {
      const vvHeight = window.visualViewport?.height ?? window.innerHeight;
      const roundedVvHeight = Math.round(vvHeight);
      // T-FIX: Debounce small viewport changes (like iOS address bar jitter)
      setViewportHeight((prev) => (Math.abs(prev - roundedVvHeight) <= 2 ? prev : roundedVvHeight));
      
      // T-FIX-KEYBOARD: Also track window.innerHeight to detect iOS keyboard
      const innerHeight = window.innerHeight;
      setWindowInnerHeight(innerHeight);
      
      // Keep composer padding in sync with viewport chrome changes (e.g., Safari address bar).
      measureComposerDockHeight();
    };

    set();
    const vv = window.visualViewport;
    // Use passive: true for better scroll/resize performance on high-refresh-rate displays
    vv?.addEventListener('resize', set, { passive: true });
    window.addEventListener('resize', set, { passive: true });
    return () => {
      vv?.removeEventListener('resize', set);
      window.removeEventListener('resize', set);
    };
  }, [measureComposerDockHeight]);

  useEffect(() => {
    const el = composerDockRef.current;
    measureComposerDockHeight();

    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }

    const ro = new ResizeObserver(() => measureComposerDockHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureComposerDockHeight, readonly, messages.length, uploadChips.length]);

  // Re-measure composer when visual viewport scrolls without a resize (iOS address bar slide).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const handle = () => measureComposerDockHeight();
    // Use passive: true for better scroll performance on high-refresh-rate displays
    vv.addEventListener('scroll', handle, { passive: true });
    return () => vv.removeEventListener('scroll', handle);
  }, [measureComposerDockHeight]);

  const messageBottomPaddingPx = useMemo(() => {
    if (readonly || isGenesis) return 0;
    
    // T-FIX-KEYBOARD: Detect if iOS keyboard is visible
    // When keyboard is open, visualViewport.height < window.innerHeight significantly
    const keyboardHeight = windowInnerHeight > 0 && viewportHeight > 0 
      ? Math.max(0, windowInnerHeight - viewportHeight)
      : 0;
    
    // T-FIX-KEYBOARD: Only treat as keyboard when the composer is focused.
    // Otherwise iOS browser UI (address bar/toolbars) can create a large visualViewport vs innerHeight gap
    // and we'd incorrectly collapse the bottom padding (hiding the last message behind the composer).
    if (isComposerFocused && keyboardHeight > 150) {
      // Keyboard is open - just add minimal space (20px buffer)
      return 20;
    }
    
    // Normal case: no keyboard or small keyboard gap
    // Fallback approximates: model capsule + composer + safe-area padding.
    const fallback = 124;
    const maxFallback = viewportHeight ? Math.round(viewportHeight * 0.75) : null;
    const cappedFallback = maxFallback ? Math.min(fallback, maxFallback) : fallback;
    const h = composerDockHeight > 0 ? composerDockHeight : cappedFallback;
    return h + 12;
  }, [composerDockHeight, readonly, isGenesis, viewportHeight, windowInnerHeight, isComposerFocused]);

  // T84: Handle file selection (multi-select support)
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onFileUpload) {
      Array.from(files).forEach((file) => {
        onFileUpload(file);
      });
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFileUpload]);

  // T-DRAG: Drag-and-drop file upload handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && onFileUpload) {
      Array.from(files).forEach((file) => {
        onFileUpload(file);
      });
    }
  }, [onFileUpload]);

  // T-PASTE: Handle paste file upload from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !onFileUpload) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Handle files (images, documents, etc.)
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      // Only prevent default if we handled files
      // (allow normal text paste if no files)
      files.forEach((file) => {
        onFileUpload(file);
      });
    }
  }, [onFileUpload]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) {
      if (endRef.current && typeof endRef.current.scrollIntoView === 'function') {
        endRef.current.scrollIntoView({ behavior, block: 'end' });
      }
      return;
    }

    const targetScrollTop = container.scrollHeight - container.clientHeight;
    const currentScrollTop = container.scrollTop;

    if (Math.abs(targetScrollTop - currentScrollTop) < 2) {
      // Already at bottom
      return;
    }

    // For streaming (auto), snap immediately to avoid lag.
    if (behavior === 'auto') {
      container.scrollTop = targetScrollTop;
    } else {
      // Use smooth for user-triggered scrolls
      try {
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } catch {
        container.scrollTop = targetScrollTop;
      }
    }
  }, []);

  // T56-2: Scroll to a specific message by ID
  // T59-1: Enhanced to return success status for fallback handling
  // T-PROGRESSIVE: If the target message is in the hidden (truncated) portion,
  // expand visible messages first, then scroll after re-render.
  const scrollToMessage = useCallback((messageId: string): boolean => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    // Check if message is currently in DOM
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief highlight effect
      messageEl.classList.add('ring-2', 'ring-primary/50', 'ring-offset-2');
      setTimeout(() => {
        messageEl.classList.remove('ring-2', 'ring-primary/50', 'ring-offset-2');
      }, 1500);
      return true;
    }

    // Message not in DOM — it might be in the hidden portion.
    // Check if it exists in the full messages array.
    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx >= 0) {
      // Expand to show this message (need to show from this index to end)
      const neededCount = messages.length - msgIdx;
      setVisibleMessageCount(Math.max(neededCount + 5, visibleMessageCount));
      // Scroll after next render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = container.querySelector(`[data-message-id="${messageId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-primary/50', 'ring-offset-2');
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-primary/50', 'ring-offset-2');
            }, 1500);
          }
        });
      });
      return true;
    }

    return false;
  }, [messages, visibleMessageCount]);

  // T-NODE-SWITCH: Scroll to the Q&A turn wrapper containing the message, aligning it
  // to the top (with toolbar offset) so the node's prompt appears in the expected spot.
  // This is intentionally different from scrollToMessage (which centers the target).
  const scrollToTurnTopForMessage = useCallback((messageId: string, behavior: ScrollBehavior = 'auto'): boolean => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    const doScroll = (el: Element | null) => {
      if (!el) return false;
      const turnEl = (el as HTMLElement).closest?.('[data-qa-turn]') as HTMLElement | null;
      const targetEl = turnEl ?? (el as HTMLElement);
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const toolbarOffset = 64;
      const rawTop = targetRect.top - containerRect.top + container.scrollTop - toolbarOffset;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextTop = Math.min(Math.max(0, rawTop), maxTop);

      // Treat this as an explicit navigation action: reset scroll-follow flags.
      userInteractingRef.current = false;
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      ignoreProgrammaticScrollEventsRef.current = Math.max(ignoreProgrammaticScrollEventsRef.current, 4);

      if (behavior === 'auto') {
        container.scrollTop = nextTop;
      } else {
        try {
          container.scrollTo({ top: nextTop, behavior });
        } catch {
          container.scrollTop = nextTop;
        }
      }
      return true;
    };

    const existing = container.querySelector(`[data-message-id="${messageId}"]`);
    if (existing) return doScroll(existing);

    // Not in DOM — it might be in the hidden (truncated) portion.
    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx < 0) return false;

    const neededCount = messages.length - msgIdx;
    setVisibleMessageCount((prev) => Math.max(prev, neededCount + 5));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = container.querySelector(`[data-message-id="${messageId}"]`);
        doScroll(el);
      });
    });
    return true;
  }, [messages]);

  // T56-2: Expose handle to parent via ref
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Phase 4: Dynamic-Island expansion state on the existing top toolbar capsule
  const [pinsExpanded, setPinsExpanded] = useState(false);

  const handleInlineOutcomeCreated = useCallback((outcomeId: string) => {
    setActiveInlineOutcomeMessageId(null);
    // Optionally expand pins to show the new outcome
    setPinsExpanded(true);
  }, [setPinsExpanded]);

  useImperativeHandle(ref, () => ({
    scrollToMessage,
    scrollToTurnTopForMessage,
    scrollToBottom,
    openOutcomeCreateModal: () => {
      if (currentNodeId) {
        setActiveInlineOutcomeMessageId(currentNodeId);
        scrollToMessage(currentNodeId);
      } else {
        setPinsExpanded(true);
        setTimeout(() => {
          outcomeCapsuleRef.current?.openCreate();
        }, 100);
      }
    },
  }), [scrollToMessage, scrollToTurnTopForMessage, scrollToBottom, setPinsExpanded, currentNodeId]);

  const pinsIslandRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerGridRef = useRef<HTMLDivElement | null>(null);
  const composerPlusRef = useRef<HTMLDivElement | null>(null);
  const composerSendRef = useRef<HTMLButtonElement | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const [composerHasMultiLineInput, setComposerHasMultiLineInput] = useState(false);
  const safeInputValue = inputValue ?? '';
  const safeIsSending = isSending ?? false;
  const safeNodeLabel = typeof nodeLabel === 'string' && nodeLabel.trim() ? nodeLabel.trim() : null;

  const getSingleLaneMeasureWidth = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const gridEl = composerGridRef.current;
    if (!gridEl) return null;
    const gridWidth = gridEl.clientWidth;
    if (gridWidth <= 0) return null;

    const styles = window.getComputedStyle(gridEl);
    const columnGap = Number.parseFloat(styles.columnGap || '0') || 0;
    const paddingLeft = Number.parseFloat(styles.paddingLeft || '0') || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight || '0') || 0;
    const contentBoxWidth = gridWidth - paddingLeft - paddingRight;
    const leftControlWidth = composerPlusRef.current?.getBoundingClientRect().width ?? 28;
    const rightControlWidth = composerSendRef.current?.getBoundingClientRect().width ?? 28;
    const width = contentBoxWidth - leftControlWidth - rightControlWidth - (columnGap * 2);
    return width > 0 ? width : null;
  }, []);

  const applyChatInputLayout = useCallback((el: HTMLTextAreaElement) => {
    const previousInlineWidth = el.style.width;

    // Always decide multiline using single-row lane width (buttons on both sides).
    // Without this, width expansion after switching to multiline can flip us back.
    const singleLaneMeasureWidth = getSingleLaneMeasureWidth();
    if (composerHasMultiLineInput && singleLaneMeasureWidth !== null) {
      el.style.width = `${singleLaneMeasureWidth}px`;
    }
    el.style.height = '0px';
    const contentHeightInSingleLane = el.scrollHeight;

    // Restore current layout width and compute real rendered height.
    el.style.width = previousInlineWidth;
    el.style.height = '0px';
    const contentHeightActual = el.scrollHeight;

    if (typeof window === 'undefined') return;
    const computed = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(computed.lineHeight || '20') || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop || '0') || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom || '0') || 0;
    const singleLineHeight = lineHeight + paddingTop + paddingBottom;
    const hasExplicitBreak = el.value.includes('\n');
    const nextIsMultiline = hasExplicitBreak || contentHeightInSingleLane > singleLineHeight + 2;
    setComposerHasMultiLineInput((prev) => (prev === nextIsMultiline ? prev : nextIsMultiline));

    el.style.height = Math.min(contentHeightActual, 200) + 'px';
  }, [composerHasMultiLineInput, getSingleLaneMeasureWidth]);

  const resizeChatInput = useCallback((targetEl?: HTMLTextAreaElement | null) => {
    const el = targetEl ?? chatInputRef.current;
    if (!el) return;

    applyChatInputLayout(el);

    if (typeof window !== 'undefined') {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      // Re-measure on next frame to capture delayed reflow from font swap/layout.
      resizeRafRef.current = requestAnimationFrame(() => {
        const rafEl = targetEl ?? chatInputRef.current;
        if (!rafEl) return;
        applyChatInputLayout(rafEl);
      });
    }
  }, [applyChatInputLayout]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  // Ensure textarea height reflects restored draft (e.g. after refresh/localStorage restore).
  useLayoutEffect(() => {
    resizeChatInput();
  }, [resizeChatInput, safeInputValue, isGenesis]);

  // Font loading can change glyph metrics and trigger wrapping without input events.
  // Recalculate composer layout when web fonts finish loading.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontSet || typeof fontSet.addEventListener !== 'function') return;
    const handleFontsLoaded = () => resizeChatInput();
    fontSet.addEventListener('loadingdone', handleFontsLoaded);
    return () => fontSet.removeEventListener('loadingdone', handleFontsLoaded);
  }, [resizeChatInput]);

  // Width changes can alter wrapping thresholds (viewport/sidebar changes).
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => resizeChatInput(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [resizeChatInput, isGenesis]);

  // Mobile perf: shared-layout (layoutId) morph animations can be expensive on coarse pointer devices
  // especially when combined with backdrop-blur and large shadows.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [mobileOverflowAction, setMobileOverflowAction] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(!!mql.matches);
    update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    // Safari fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(update);
  }, []);

  // T-FIX-BLUR (二分定位结论): 文本在 backdrop/glass 容器参与 transform/layoutId 共享布局时，
  // 某些浏览器会把文本栅格化导致“发糊”。
  // 解决策略：保留形变，但让 layoutId 只作用在“纯背景胶囊(ghost)”上，
  // 文本本身永远不参与 transform。
  // T-FIX-INITIAL-ANIM: Delay layoutId activation on initial non-genesis load to prevent
  // Framer Motion shared-layout from animating the input capsule on page refresh.
  // Allow layoutId immediately in Genesis so the first switch to an existing convo can morph.
  const [hasMounted, setHasMounted] = useState(inputMorphReadyGlobal);
  useEffect(() => {
    if (inputMorphReadyGlobal) return;
    const id = requestAnimationFrame(() => {
      inputMorphReadyGlobal = true;
      setHasMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const inputMorphLayoutId = isCoarsePointer
    ? undefined
    : (hasMounted || isGenesis ? 'input-wrapper' : undefined);

  // Check if any message is currently streaming
  const hasStreamingMessage = useMemo(() => messages.some(m => m.isStreaming), [messages]);
  const lastStreamingText = useMemo(() => {
    const streamingMsg = messages.find(m => m.isStreaming);
    return (streamingMsg?.text || '') + (streamingMsg?.reasoning || '');
  }, [messages]);
  const isStreamingActive = hasStreamingMessage || safeIsSending;

  // ============== T-SCROLL-FIX: Smart Auto-Scroll Logic ==============
  // Helper: check if container is at bottom (within threshold)
  const isAtBottom = useCallback((threshold = 50) => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    const distanceFromBottom = maxScrollTop - container.scrollTop;
    return distanceFromBottom <= threshold;
  }, []);

  // T-FIX: Some state transitions after streaming completes (e.g. tree revalidation / placeholder swap)
  // can cause the scroll container to momentarily reset its scrollTop.
  // Keep the view pinned to bottom for a short window after streaming, but ONLY when the user
  // has not intentionally scrolled up.
  const stickToBottomUntilRef = useRef<number>(0);
  const prevStreamingActiveRef = useRef<boolean>(false);
  // T-FIX-JUMP: Track the last known scroll position to restore after content updates
  const lastScrollTopRef = useRef<number>(0);
  const streamEndedRecentlyRef = useRef<boolean>(false);

  useEffect(() => {
    const wasStreaming = prevStreamingActiveRef.current;
    const nowStreaming = isStreamingActive;

    // [UX-REDESIGN]: Removal of forced scroll on streaming start to respect "default not follow".
    // We only keep the stickiness for a short window after streaming ends to survive final renders
    // IF the user was already at the bottom.
    if (wasStreaming && !nowStreaming) {
      // T-FIX-JUMP: Mark that streaming just ended
      streamEndedRecentlyRef.current = true;
      
      // Save current scroll position before any content updates
      const container = scrollContainerRef.current;
      if (container) {
        lastScrollTopRef.current = container.scrollTop;
      }
      
      if (!userScrolledUpRef.current && isAtBottom(30)) {
        stickToBottomUntilRef.current = Date.now() + 800;
      }
      
      // Clear the flag after a short delay
      setTimeout(() => {
        streamEndedRecentlyRef.current = false;
      }, 500);
    }

    prevStreamingActiveRef.current = nowStreaming;
  }, [isStreamingActive, isAtBottom]);

  useEffect(() => {
    if (isStreamingActive) return;
    if (userScrolledUpRef.current) return;
    if (Date.now() > stickToBottomUntilRef.current) return;
    if (messages.length === 0) return; // Don't scroll to bottom of an empty list (jumps to top)

    // T-FIX-JUMP: Prevent immediate scroll after streaming ends if content hasn't settled
    // Instead, schedule the scroll for the next frame to let React finish rendering
    ignoreProgrammaticScrollEventsRef.current = 3;
    requestAnimationFrame(() => {
      scrollToBottom('auto');
    });
  }, [messages, isStreamingActive, scrollToBottom]);

  // Pinned keyframes for header
  const pinnedKeyframes = useMemo(() => {
    return [...(keyframes || [])]
      .filter((k) => k && (k.is_pinned ?? true) !== false)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [keyframes]);

  const pinsLabel = t(lang, 'outcomes_capsule_label');

  // T93-9: Outcome anchor should come from "current node".
  // Fallback to a pinned keyframe node if currentNodeId isn't available in this view.
  // T93-13: Outcomes anchor must always be the current node.
  // Do not fall back to pinned keyframes.
  const outcomeAnchorNodeId = currentNodeId ?? null;

  const messageMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const msg of messages) {
      if (msg.id) map.set(msg.id, msg);
    }
    return map;
  }, [messages]);

  const [draftAnnotations, setDraftAnnotations] = useState<Record<string, string>>({});
  // Task 2: Annotation save status per node: 'idle' | 'saving' | 'saved'
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});

  useEffect(() => {
    if (!pinsExpanded) return;
    setDraftAnnotations((prev) => {
      const next = { ...prev };
      for (const kf of pinnedKeyframes) {
        if (typeof next[kf.node_id] === 'undefined') {
          next[kf.node_id] = formatKeyframeAnnotation(kf.annotation);
        }
      }
      return next;
    });
  }, [pinsExpanded, pinnedKeyframes]);

  useEffect(() => {
    if (!pinsExpanded) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (pinsIslandRef.current && pinsIslandRef.current.contains(target)) return;
      setPinsExpanded(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [pinsExpanded]);

  // Core scroll handler: detect user intent
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // T-SCROLL-UNIFORM: When user is physically interacting (wheel/touch), ALWAYS respect
    // their intent regardless of the programmatic-ignore counter. This fixes the issue where
    // fast-streaming models (GPT/Claude) constantly replenish the ignore counter, making it
    // nearly impossible for users to break auto-follow by scrolling up. Gemini streams in
    // larger chunks so the counter had time to drain — now all models behave uniformly.
    if (userInteractingRef.current) {
      // Drain the counter so it doesn't accumulate stale values
      ignoreProgrammaticScrollEventsRef.current = 0;

      // User is actively scrolling - check if they scrolled away from bottom
      if (!isAtBottom(80)) {
        userScrolledUpRef.current = true;
        setUserScrolledUp(true);
      } else {
        // User scrolled back to bottom - resume auto-follow
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }
      return;
    }

    // If this scroll was triggered by our own programmatic scrollTop write, ignore it.
    // IMPORTANT: use a counter instead of time-window ignoring; time windows prevent
    // users from ever unlocking during high-frequency streaming updates.
    if (ignoreProgrammaticScrollEventsRef.current > 0) {
      ignoreProgrammaticScrollEventsRef.current -= 1;
      return;
    }

    // Not user interaction - just check if we're at bottom for recovery
    if (isAtBottom(30)) {
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
    }
  }, [isAtBottom]);

  // Track user wheel/touch interaction
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let interactionTimeout: NodeJS.Timeout | null = null;
    
    const onInteractionStart = () => {
      userInteractingRef.current = true;
      if (interactionTimeout) clearTimeout(interactionTimeout);
    };
    
    const onInteractionEnd = () => {
      // Delay clearing interaction flag to catch momentum scroll
      interactionTimeout = setTimeout(() => {
        userInteractingRef.current = false;
      }, 150);
    };
    
    // Wheel events (desktop/trackpad) - wheel itself is the interaction signal.
    container.addEventListener('wheel', onInteractionStart, { passive: true });
    container.addEventListener('wheel', onInteractionEnd, { passive: true });
    
    // Touch events (mobile)
    container.addEventListener('touchstart', onInteractionStart, { passive: true });
    container.addEventListener('touchmove', onInteractionStart, { passive: true });
    container.addEventListener('touchend', onInteractionEnd, { passive: true });
    container.addEventListener('touchcancel', onInteractionEnd, { passive: true });
    
    // Scroll event
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (interactionTimeout) clearTimeout(interactionTimeout);
      container.removeEventListener('wheel', onInteractionStart);
      container.removeEventListener('wheel', onInteractionEnd);
      container.removeEventListener('touchstart', onInteractionStart);
      container.removeEventListener('touchmove', onInteractionStart);
      container.removeEventListener('touchend', onInteractionEnd);
      container.removeEventListener('touchcancel', onInteractionEnd);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);



  // Reset scroll state when starting new conversation or switching trees
  useEffect(() => {
    // Reset scroll tracking when messages change significantly
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
  }, [messages.length === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on streaming end - but don't force scroll, just allow future auto-scroll
  useEffect(() => {
    if (!hasStreamingMessage && !safeIsSending) {
      // Streaming ended - if we're at bottom, clear the scrolled-up flag
      if (isAtBottom(50)) {
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }
    }
  }, [hasStreamingMessage, safeIsSending, isAtBottom]);

  // Initial scroll to bottom when first loading messages of a tree
  const lastScrolledTreeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length > 0 && lastScrolledTreeIdRef.current !== treeId) {
      lastScrolledTreeIdRef.current = treeId || null;
      // Only auto-scroll to bottom if user hasn't scrolled up yet
      if (!userScrolledUpRef.current) {
        // Switching conversations should be an immediate switch (no slide animation).
        scrollToBottom('auto');
      }
    }
  }, [messages.length, treeId, scrollToBottom]);

  // T-UX-SCROLL-ON-SEND: When user sends a message, smoothly scroll to bottom
  // so the new user bubble is at the bottom of the viewport and old content is
  // pushed up — matching Claude/Gemini/ChatGPT UX patterns.
  // T-GEMINI-SCROLL: When user sends a message, scroll the last Q&A turn
  // to the top of the viewport. The min-height CSS on the last turn ensures
  // the user message stays at the top while AI response flows below.
  const prevIsSendingRef = useRef(false);
  useEffect(() => {
    if (safeIsSending && !prevIsSendingRef.current && !isGenesis) {
      ignoreProgrammaticScrollEventsRef.current = 10;
      userInteractingRef.current = false;
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      // Wait for the pending message to render with min-height, then scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (!container) return;
          // Find the last Q&A turn wrapper (has data-qa-turn attribute)
          const turns = container.querySelectorAll<HTMLElement>('[data-qa-turn]');
          const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
          if (lastTurn) {
            const containerRect = container.getBoundingClientRect();
            const turnRect = lastTurn.getBoundingClientRect();
            // Subtract toolbar height offset (pt-16 = 64px) so the user bubble
            // appears below the floating top capsule, not hidden behind it.
            const toolbarOffset = 64;
            const scrollOffset = turnRect.top - containerRect.top + container.scrollTop - toolbarOffset;
            try {
              container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
            } catch {
              container.scrollTop = scrollOffset;
            }
          } else {
            scrollToBottom('smooth');
          }
        });
      });
    }
    prevIsSendingRef.current = safeIsSending;
  }, [safeIsSending, isGenesis, scrollToBottom]);

  // [UX-REDESIGN]: Follow-stream logic
  // 1. When streaming starts, we default to NOT follow (set userScrolledUp to true).
  // 2. If user clicks the "Scroll to Bottom" button, we set userScrolledUp to false.
  // 3. When userScrolledUp is false during streaming, we auto-scroll.
  const prevHasStreamingRef = useRef(false);
  useEffect(() => {
    // When stream starts, flip to "scrolled up" mode to prevent auto-follow by default.
    // This will cause the "Scroll to Bottom" button to appear as soon as content grows.
    if (hasStreamingMessage && !prevHasStreamingRef.current) {
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
    }
    prevHasStreamingRef.current = hasStreamingMessage;
  }, [hasStreamingMessage]);

  // The actual auto-follow execution (when user explicitly clicks the button or is manually at bottom)
  useEffect(() => {
    if (!hasStreamingMessage || userScrolledUp) return;
    
    // User wants to follow (userScrolledUp is false)
    // Use ignore counter to prevent the resulting scroll event from triggering handlescroll -> userScrolledUp=true
    if (ignoreProgrammaticScrollEventsRef.current < 2) {
      ignoreProgrammaticScrollEventsRef.current = 2;
    }
    scrollToBottom('auto');
  }, [messages, hasStreamingMessage, userScrolledUp, scrollToBottom, lastStreamingText]);

  // Keep view pinned when viewport changes (keyboard, address bar)
  useEffect(() => {
    if (readonly || isGenesis) return;
    if (userScrolledUpRef.current) return;
    
    // Detect keyboard and skip auto-scroll to avoid jank
    const keyboardHeight = windowInnerHeight > 0 && viewportHeight > 0 
      ? Math.max(0, windowInnerHeight - viewportHeight)
      : 0;
    if (keyboardHeight > 100) return;

    // Only keep pinned if we were already at (or near) bottom; otherwise, don't move the viewport.
    if (!isAtBottom(30)) return;

    // Mark next scroll events as programmatic to avoid falsely setting "user scrolled".
    ignoreProgrammaticScrollEventsRef.current = 2;
    scrollToBottom('auto');
  }, [viewportHeight, messageBottomPaddingPx, readonly, isGenesis, windowInnerHeight, isAtBottom, scrollToBottom]);

  const handleAttemptSend = useCallback(() => {
    if (readonly || safeIsSending || !onSend) return;
    const trimmed = safeInputValue.trim();
    if (!trimmed) return; // Silently ignore empty input
    // T26-5: Mark onboarding as complete when sending first message
    if (typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_KEY)) {
      localStorage.setItem(ONBOARDING_KEY, 'seen');
      onFirstMessageSent?.();
    }
    onSend();
  }, [onSend, readonly, safeInputValue, safeIsSending, onFirstMessageSent]);

  const renderComposerInner = useCallback(() => {
    return (
      <>
        {/* KB-2: Knowledge selection chips display */}
        {isAlignedKnowledgeMode ? (
          (effectiveKnowledgeKb || effectiveKnowledgeDocs.length > 0) && (
            <div className="px-3 pt-2.5 pb-0">
              <KBChipsContainer>
                {effectiveKnowledgeKb && (
                  <KBChip
                    key={effectiveKnowledgeKb.id}
                    id={effectiveKnowledgeKb.id}
                    name={effectiveKnowledgeKb.name}
                    onRemove={handleRemoveKnowledgeKb}
                    onClick={!safeIsSending ? () => setShowKBPicker(true) : undefined}
                    disabled={safeIsSending}
                  />
                )}

                {(() => {
                  const collapsedCount = 5;
                  const hasOverflow = effectiveKnowledgeDocs.length > collapsedCount;
                  const visibleDocs = docsExpanded || !hasOverflow
                    ? effectiveKnowledgeDocs
                    : effectiveKnowledgeDocs.slice(0, collapsedCount);
                  const hiddenCount = hasOverflow ? (effectiveKnowledgeDocs.length - collapsedCount) : 0;
                  return (
                    <>
                      {visibleDocs.map((doc) => (
                        <DocChip
                          key={doc.id}
                          id={doc.id}
                          name={doc.name}
                          onRemove={safeIsSending ? undefined : () => handleRemoveKnowledgeDoc(doc.id)}
                          disabled={safeIsSending}
                        />
                      ))}
                      {hasOverflow && (
                        <OverflowChip
                          hiddenCount={hiddenCount}
                          expanded={docsExpanded}
                          onToggle={() => setDocsExpanded((v) => !v)}
                          disabled={safeIsSending}
                        />
                      )}
                    </>
                  );
                })()}
              </KBChipsContainer>
            </div>
          )
        ) : (
          selectedKBs.length > 0 && (
            <div className="px-3 pt-2.5 pb-0">
              <KBChipsContainer>
                {selectedKBs.map((kb) => (
                  <KBChip
                    key={kb.id}
                    id={kb.id}
                    name={kb.name}
                    onRemove={() => onRemoveKB?.(kb.id)}
                    disabled={safeIsSending}
                  />
                ))}
              </KBChipsContainer>
            </div>
          )
        )}

        {/* T85: Upload chips display */}
        {uploadChips.length > 0 && (
          <div className="px-3 pt-2.5 pb-0">
            <UploadChipsContainer>
              {uploadChips.map((chip) => (
                <UploadChip
                  key={chip.id}
                  uploadId={chip.id}
                  fileName={chip.fileName}
                  sizeBytes={chip.sizeBytes}
                  status={chip.status}
                  errorMessage={chip.errorMessage}
                  onRemove={() => onRemoveUpload?.(chip.id)}
                  onRetry={() => onRetryUpload?.(chip.id)}
                  onPreview={onPreviewUpload}
                  removeDisabled={safeIsSending}
                />
              ))}
            </UploadChipsContainer>
          </div>
        )}
        {/* T88: Removed the redundant 'Native Parsing' hint bar to clean up UI/UX, aligning with major AI chat products */}
        {/* uploadHint && uploadChips.length > 0 && (
          <div className="px-3 pb-1 text-xs text-muted-foreground">
            {uploadHint}
          </div>
        ) */}

        <div
          ref={composerGridRef}
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 px-3 py-2.5",
            composerHasMultiLineInput
              ? "grid-rows-[auto_auto] gap-y-2"
              : "grid-rows-[0px_auto] gap-y-0"
          )}
        >
          <div
            ref={composerPlusRef}
            className="col-start-1 row-start-2 self-center"
          >
            {/* T85/T88/KB-UX: Unified Plus menu (anchor for KB picker) */}
            <Popover open={showKBPicker} onOpenChange={(open) => {
            // KB-FIX: Ignore close events that happen within 200ms of opening.
            // This prevents the race condition where DropdownMenu closing
            // triggers Popover's outside-click detection.
            if (!open && Date.now() - kbPickerJustOpenedRef.current < 200) {
              return;
            }
            setShowKBPicker(open);
            }}>
              <PopoverAnchor asChild>
                <div className="shrink-0">
                  <DropdownMenu>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7 rounded-full shrink-0 hover:bg-background/50",
                                showKBPicker
                                  ? "text-primary bg-primary/10"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                              disabled={safeIsSending}
                              aria-label={lang === 'zh-CN' ? '更多功能' : 'More actions'}
                              title={lang === 'zh-CN' ? '更多功能' : 'More actions'}
                            >
                              {isUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                              <span className="sr-only">Menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        {/* T-UX: Removed file format hints tooltip as per user request */}
                      </Tooltip>
                    </TooltipProvider>

                    <DropdownMenuContent align="start" side="top" className="w-52 apple-glass border-none z-[60]">
                      <DropdownMenuItem
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!onFileUpload || safeIsSending}
                        className="gap-2 focus:bg-muted/60 focus:text-foreground cursor-pointer"
                      >
                        <Upload className="h-4 w-4" />
                        <span>{lang === 'zh-CN' ? '上传文件' : 'Upload file'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border/40" />
                      <DropdownMenuItem
                        onClick={() => {
                          // KB-FIX: Use double-RAF plus timestamp protection to reliably open the picker.
                          // 1. Record timestamp to ignore immediate close events in onOpenChange
                          // 2. Use double RAF to ensure DOM has settled after DropdownMenu closes
                          kbPickerJustOpenedRef.current = Date.now();
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                              setShowKBPicker(true);
                            });
                          });
                        }}
                        disabled={safeIsSending || !(onApplyKnowledge || onAddKB)}
                        className="gap-2 focus:bg-muted/60 focus:text-foreground cursor-pointer"
                      >
                        <Library className="h-4 w-4" />
                        <span>{lang === 'zh-CN' ? '选择知识库' : 'Knowledge base'} </span>
                        <span className="ml-auto text-[10px] text-muted-foreground/70">@</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </PopoverAnchor>

              {/* KB picker popover: anchored to the + button for correct placement */}
              <PopoverContent
                side="top"
                align="start"
                sideOffset={10}
                className={cn(
                  'p-0 w-[min(720px,calc(100vw-24px))] max-w-[calc(100vw-24px)]',
                  'rounded-2xl overflow-hidden',
                  'border border-white/20 dark:border-white/10',
                  'bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl',
                  'shadow-[0_20px_60px_rgba(15,23,42,0.18)] dark:shadow-[0_24px_72px_rgba(0,0,0,0.55)]'
                )}
              >
                <KnowledgeMentionPicker
                  lang={lang}
                  userId={sessionUserId || undefined}
                  className="max-h-[min(70vh,520px)] rounded-none border-0 shadow-none bg-transparent"
                  value={
                    isAlignedKnowledgeMode
                      ? { kbId: effectiveKnowledgeKb?.id ?? null, docIds: effectiveKnowledgeDocs.map((d) => d.id) }
                      : undefined
                  }
                  onApply={({ kb, docs }) => {
                    if (onApplyKnowledge) {
                      onApplyKnowledge({
                        kb: kb ? ({ id: kb.id, name: kb.name } as any) : null,
                        docs: docs.map((d: any) => ({
                          id: String(d.id),
                          name: String(d.file_name || d.title || 'Untitled'),
                          parse_status: typeof d.parse_status === 'string' ? d.parse_status : undefined,
                          enable_status: typeof d.enable_status === 'string' ? d.enable_status : undefined,
                        })),
                      });
                    } else if (kb) {
                      onAddKB?.(kb.id, kb.name);
                    }
                    setDocsExpanded(false);
                    setShowKBPicker(false);
                  }}
                  onClose={() => setShowKBPicker(false)}
                  onOpenManager={onOpenKnowledgeManager ? () => {
                    setShowKBPicker(false);
                    onOpenKnowledgeManager();
                  } : undefined}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Textarea - auto-expanding */}
          <textarea
            ref={chatInputRef}
            id="chat-input"
            name="chatInput"
            value={safeInputValue}
            onFocus={() => setIsComposerFocused(true)}
            onBlur={() => setIsComposerFocused(false)}
            onChange={(e) => {
              onInputChange?.(e.target.value);
              resizeChatInput(e.target);

              // KB-2: Minimalist mention trigger
              const val = e.target.value;
              const cursor = e.target.selectionStart;
              if (cursor !== null && val[cursor - 1] === '@' && (onApplyKnowledge || onAddKB)) {
                setShowKBPicker(true);
              }
            }}
            onKeyDown={(e) => {
              if ((e.nativeEvent as any)?.isComposing) return;
              if (
                e.key === 'Backspace' &&
                safeInputValue.length === 0 &&
                isAlignedKnowledgeMode &&
                !safeIsSending
              ) {
                const docs = effectiveKnowledgeDocs;
                if (docs.length > 0) {
                  e.preventDefault();
                  handleRemoveKnowledgeDoc(docs[docs.length - 1]!.id);
                  return;
                }
                if (effectiveKnowledgeKb) {
                  e.preventDefault();
                  handleRemoveKnowledgeKb();
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAttemptSend();
              }
            }}
            onPaste={handlePaste}
            placeholder={t(lang, 'chat_input_placeholder')}
            className={cn(
              "min-h-[28px] max-h-[200px] w-full resize-none bg-transparent py-1 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto",
              composerHasMultiLineInput
                ? "col-span-3 row-start-1 min-w-0"
                : "col-start-2 row-start-2 min-w-[140px]"
            )}
            disabled={false}
            autoFocus={autoFocusInput}
            rows={1}
            style={{ height: 'auto', fontFamily: COMPOSER_INPUT_FONT_STACK, fontKerning: 'normal' }}
            data-testid="chat-input"
          />

          {/* Send Button */}
          <Button
            ref={composerSendRef}
            onClick={isStreamingActive ? onAbortStream : handleAttemptSend}
            disabled={isStreamingActive ? false : !safeInputValue.trim()}
            size="icon"
            className="h-7 w-7 rounded-full shrink-0 col-start-3 row-start-2 justify-self-end self-center"
            data-testid="send-message"
          >
            {isStreamingActive ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">{isStreamingActive ? 'Stop generating' : 'Send'}</span>
          </Button>
        </div>
      </>
    );
  }, [
    autoFocusInput,
    chatInputRef,
    fileInputRef,
    handleAttemptSend,
    handlePaste,
    isStreamingActive,
    isUploading,
    lang,
    onAbortStream,
    onFileUpload,
    onInputChange,
    onPreviewUpload,
    onRemoveUpload,
    onRetryUpload,
    onAddKB,
    onRemoveKB,
    composerHasMultiLineInput,
    resizeChatInput,
    selectedKBs,
    showKBPicker,
    sessionUserId,
    safeInputValue,
    safeIsSending,
    uploadChips,
  ]);

  // T28-4: hasMenuOptions no longer depends on canDeleteBranch (branch delete moved to user bubble menu)
  const hasMenuOptions = onExportJson || onExportMarkdown || onToggleShare || onCopyShareLink;

  // Fix: Reset textarea height when input value is cleared (e.g. after sending)
  useEffect(() => {
    if (!safeInputValue) {
      resizeChatInput();
    }
  }, [safeInputValue, resizeChatInput]);

  const contextProfileLabel = contextProfile === 'max' ? 'Max' : contextProfile === 'standard' ? 'Standard' : 'Lite';
  const memoryScopeLabel =
    memoryScope === 'tree' ? t(lang, 'context_capsule_scope_tree') : t(lang, 'context_capsule_scope_branch');

  // T92-1: Memoized right-side toolbar buttons container
  // Refactored to avoid component remounts during animation
  const renderRightToolbarButtons = (props: { 
    pinsExpanded: boolean;
    setPinsExpanded: (open: boolean) => void;
    treeId?: string | null;
    messages: ChatMessage[];
  }) => {
    const { 
      pinsExpanded,
      setPinsExpanded,
      treeId,
      messages
    } = props;

    return (
      <div className="flex items-center gap-1 shrink-0 leading-none align-middle">
        {/* Pins capsule (part of the existing toolbar; expands the whole bar) */}
        {treeId && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 rounded-full px-2 flex items-center gap-2 transition-colors',
                    'text-muted-foreground',
                    pinsExpanded && 'bg-primary/10 text-primary'
                  )}
                  onClick={() => setPinsExpanded(!pinsExpanded)}
                  aria-label={t(lang, 'outcomes_capsule_open')}
                >
                  <Apple className={cn("h-3.5 w-3.5 transition-transform shrink-0", pinsExpanded && "rotate-12")} />
                  <span className="text-xs font-medium truncate max-w-[120px] min-w-0">{pinsLabel}</span>
                  {pinsExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                {t(lang, 'outcomes_capsule_tooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* T30: Mobile tree view button - only visible on mobile/tablet */}
        {onOpenMobileTree && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 lg:hidden flex-shrink-0"
            onClick={onOpenMobileTree}
          >
            <FolderTree className="h-3.5 w-3.5" />
            <span className="sr-only">查看树</span>
          </Button>
        )}

        {/* Overflow Menu with Frosted Glass */}
        {hasMenuOptions && (
          isCoarsePointer ? (
            <div className="relative h-7 w-7 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">{t(lang, 'chat_more_actions')}</span>
              </Button>
              <select
                aria-label={t(lang, 'chat_more_actions')}
                className="absolute inset-0 opacity-0"
                value={mobileOverflowAction}
                onChange={(e) => {
                  const value = e.target.value;
                  setMobileOverflowAction('');
                  if (!value) return;
                  if (value === 'export_json') onExportJson?.();
                  if (value === 'export_markdown') onExportMarkdown?.();
                  if (value === 'copy_share_link') onCopyShareLink?.();
                  if (value === 'share_tree') onToggleShare?.();
                  if (value === 'revoke_share') onToggleShare?.();
                }}
              >
                <option value="" disabled>
                  {t(lang, 'chat_more_actions')}
                </option>
                {onExportJson && <option value="export_json">{t(lang, 'header_export_json')}</option>}
                {onExportMarkdown && (
                  <option value="export_markdown">{t(lang, 'header_export_markdown')}</option>
                )}
                {isShared ? (
                  <>
                    {onCopyShareLink && (
                      <option value="copy_share_link">{t(lang, 'header_copy_share_link')}</option>
                    )}
                    {onToggleShare && (
                      <option value="revoke_share">{t(lang, 'header_revoke_share')}</option>
                    )}
                  </>
                ) : (
                  onToggleShare && <option value="share_tree">{t(lang, 'header_share_tree')}</option>
                )}
              </select>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">{t(lang, 'chat_more_actions')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
              >
                {/* T28-4: Export actions - clearly scoped to whole tree */}
                {onExportJson && (
                  <DropdownMenuItem onClick={onExportJson}>
                    {t(lang, 'header_export_json')}
                  </DropdownMenuItem>
                )}
                {onExportMarkdown && (
                  <DropdownMenuItem onClick={onExportMarkdown}>
                    {t(lang, 'header_export_markdown')}
                  </DropdownMenuItem>
                )}
                {(onExportJson || onExportMarkdown) && (onToggleShare || onCopyShareLink) && (
                  <DropdownMenuSeparator />
                )}
                {/* T28-4: Share actions - clearly scoped to whole tree */}
                {isShared ? (
                  <>
                    {onCopyShareLink && (
                      <DropdownMenuItem onClick={onCopyShareLink}>
                        {t(lang, 'header_copy_share_link')}
                      </DropdownMenuItem>
                    )}
                    {onToggleShare && (
                      <DropdownMenuItem onClick={onToggleShare} className="text-destructive focus:text-destructive">
                        {t(lang, 'header_revoke_share')}
                      </DropdownMenuItem>
                    )}
                  </>
                ) : (
                  onToggleShare && (
                    <DropdownMenuItem onClick={onToggleShare}>
                      {t(lang, 'header_share_tree')}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}
      </div>
    );
  };

  // T92-2: Floating toolbar with stable backdrop-filter
  // Refactored to avoid component remounts during animation
  const renderFloatingToolbar = () => {
    return (
      <div>
        <div className="mx-auto w-full max-w-[52.8rem] px-4 sm:px-4">
          <motion.div
            ref={pinsIslandRef}
            layout
            initial={false}
            transition={{ 
              layout: { type: 'spring', stiffness: 400, damping: 33, mass: 1 },
            }}
            className={cn(
              'apple-glass overflow-hidden border-t-white/30 dark:border-t-white/20',
              'rounded-xl'
            )}
          >
            {/* Top Row - Always visible and layout-synced */}
            <motion.div 
              layout="position"
              className={cn(
                "flex items-center justify-between gap-2 px-4 py-2.5",
                pinsExpanded && "border-b border-white/40 dark:border-white/[0.10]"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 leading-none align-middle">
                {onOpenMobileSidebar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 md:hidden flex-shrink-0"
                    onClick={onOpenMobileSidebar}
                  >
                    <Menu className="h-3.5 w-3.5" />
                    <span className="sr-only">打开树列表</span>
                  </Button>
                )}
                {contextProfile && memoryScope ? (
                  <div className="min-w-0 truncate text-muted-foreground/70">
                    <div className="flex items-center gap-2 text-xs leading-4 sm:hidden">
                      <span className="whitespace-nowrap font-medium text-foreground/80">
                        {contextProfileLabel}
                      </span>
                      <span aria-hidden className="text-muted-foreground/70">
                        |
                      </span>
                      <span className="whitespace-nowrap font-medium text-foreground/80">
                        {memoryScopeLabel}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-2 text-sm leading-5">
                      <span className="whitespace-nowrap">
                        {t(lang, 'context_capsule_profile_label')}
                        <span className="font-medium text-foreground/80">{contextProfileLabel}</span>
                      </span>
                      <span
                        aria-hidden
                        className="mx-0.5 h-3 w-px bg-border/60 inline-block align-middle"
                      />
                      <span className="whitespace-nowrap">
                        {t(lang, 'context_capsule_scope_label')}
                        <span className="font-medium text-foreground/80">{memoryScopeLabel}</span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {renderRightToolbarButtons({
                  pinsExpanded,
                  setPinsExpanded,
                  treeId,
                  messages
                })}
              </div>
            </motion.div>

            {/* Expanded Content */}
            <AnimatePresence mode="wait">
              {pinsExpanded && (
                <motion.div
                  key="pins-expanded-content"
                  initial={{ opacity: 0, height: 0, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, height: 600, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, height: 0, filter: 'blur(10px)' }}
                  transition={{ 
                    height: { type: 'spring', stiffness: 400, damping: 33, mass: 1 },
                    opacity: { duration: 0.2 },
                    filter: { duration: 0.2 }
                  }}
                  className="flex flex-col overflow-hidden"
                >
                  {/* P1-4: Unified Tab Navigation (Keyframes tab removed - P0-1) */}
                  {/* T93-0: Remove Trail/Snapshot/Diff tab entry points from workspace UI.
                      Keep only the default (trail/thread) view accessible via the pins capsule. */}

                  {/* P0-1: Keyframes Tab removed - annotations now inline in messages */}

                  {/* Pins expanded content (Layer2): only keep Outcome archive */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <OutcomeCapsule
                      ref={outcomeCapsuleRef}
                      treeId={treeId}
                      userId={sessionUserId}
                      lang={lang}
                      anchorNodeId={outcomeAnchorNodeId}
                      expanded={pinsExpanded}
                      onSelectOutcome={onSelectOutcome}
                      onRequestCreate={() => {
                        if (currentNodeId) {
                          setActiveInlineOutcomeMessageId(currentNodeId);
                          scrollToMessage(currentNodeId);
                        }
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex h-full flex-col chat-canvas-bg overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* T-DRAG: Drag-and-drop file overlay (Gemini-style) */}
      <AnimatePresence>
        {isDraggingOver && onFileUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex items-center justify-center glass-overlay pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl apple-glass border-2 border-dashed border-emerald-500/50 dark:border-emerald-400/50"
            >
              <div className="p-4 rounded-full bg-emerald-500/10 dark:bg-emerald-400/15">
                <Upload className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  {lang === 'zh-CN' ? '将文件拖放到此处' : 'Drop files here'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {lang === 'zh-CN' ? '松开鼠标即可上传' : 'Release to upload'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* T85: Single file input at component root - shared by Genesis and Chat views */}
      <input
        ref={fileInputRef}
        type="file"
        id="chat-attachment-input"
        name="chatAttachment"
        className="sr-only"
        multiple
        accept={uploadAccept || defaultUploadAccept}
        onChange={handleFileSelect}
        data-testid="chat-attachment-input"
      />

      {/* Ambient glow background for glass effect depth */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-400/[0.06] dark:bg-emerald-500/[0.08] blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-sky-400/[0.04] dark:bg-sky-500/[0.06] blur-3xl" />
      </div>
      {/* New Tree Controls (topic input) - outside scroll */}
      {newTreeControls && (
        <div className="shrink-0 border-b border-border bg-muted/50 px-4 py-3 sm:px-5">
          {newTreeControls}
        </div>
      )}

      {/* Scrollable area containing floating toolbar and messages */}
      {/* T33-6: will-change for smoother streaming scroll. 
          Note: scroll-smooth removed to avoid iOS momentum scroll conflicts.
          data-scroll-hz enables high refresh rate (120Hz) native scrolling.
          T-FIX-JUMP: overflow-anchor helps browser maintain scroll position during content updates. */}
      <div
        ref={scrollContainerRef}
        data-scroll-hz="true"
        className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 overscroll-y-contain touch-pan-y scroll-under-glass"
        style={{
          WebkitOverflowScrolling: 'touch',
          overflowAnchor: 'auto',
        }}
      >
        {activeOutcomeId && activeOutcomeDetail ? (
          <OutcomeDetail 
            detail={activeOutcomeDetail}
            treeId={treeId}
            userId={sessionUserId}
            lang={lang}
            onSourceClick={onSourceClick}
            onDetailChange={onOutcomeDetailChange}
            onClose={onClearOutcome}
          />
        ) : (
          <div
            className={cn(
              "mx-auto w-full max-w-3xl px-4 sm:px-4",
              !isGenesis && "pt-16"
            )}
          >
          {/* GENESIS VIEW (Center Capsule) */}
          <AnimatePresence mode="popLayout" initial={false}>
            {isGenesis ? (
              <motion.div
                key="genesis-hero"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute inset-0 flex flex-col items-center justify-center p-4 z-20"
              >
                {/* T91: Mobile navigation bar in Genesis View */}
                {onOpenMobileSidebar && (
                  <div className="absolute top-2 left-2 right-2 z-30 md:hidden">
                    <div className="apple-glass-capsule px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={onOpenMobileSidebar}
                        >
                          <Menu className="h-4 w-4" />
                          <span className="sr-only">{t(lang, 'sidebar_expand')}</span>
                        </Button>
                        <div className="flex items-center gap-2">
                          <TreeDeciduous className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">oMyTree</span>
                        </div>
                        {/* Tree view button */}
                        {onOpenMobileTree && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={onOpenMobileTree}
                          >
                            <FolderTree className="h-4 w-4" />
                            <span className="sr-only">{t(lang, 'tree_view_label')}</span>
                          </Button>
                        )}
                        {!onOpenMobileTree && <div className="w-8" />}
                      </div>
                    </div>
                  </div>
                )}

                {/* Background Ambience (Optional, subtle) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
                  <div className="absolute top-[30%] left-[20%] w-[50vh] h-[50vh] rounded-full bg-emerald-400/10 dark:bg-emerald-500/10 blur-[80px]" />
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="mb-3 text-center"
                >
                  <div
                    className="select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    <img
                      src="/images/logo.png"
                      alt="oMyTree"
                      draggable={false}
                      className="h-12 md:h-14 mx-auto mb-2 select-none pointer-events-none"
                    />
                  </div>
                </motion.div>

                {/* Genesis Input Capsule - Reuse the same composer UI as the normal chat dock */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className={cn(
                    'w-[92%] sm:w-[88%] md:w-[85%] lg:w-[80%] xl:w-[75%] max-w-[720px] relative pointer-events-auto group'
                  )}
                >
                  {/* Ghost capsule: participates in shared-layout morph, but has NO text inside. */}
                  <motion.div
                    layoutId={inputMorphLayoutId}
                    className={cn(
                      'absolute inset-0 apple-glass-capsule !rounded-xl !p-0 pointer-events-none transform-gpu',
                      'shadow-[0_8px_40px_rgba(15,23,42,0.12),0_0_15px_rgba(16,185,129,0.1)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(16,185,129,0.05)]',
                      !isCoarsePointer &&
                        "transition-[border-color] duration-1000 ease-out group-hover:border-emerald-500 dark:group-hover:border-emerald-400 after:content-[''] after:absolute after:inset-0 after:rounded-xl after:pointer-events-none after:opacity-0 group-hover:after:opacity-100 after:transition-opacity after:duration-1000 after:ease-out after:shadow-[0_0_30px_rgba(16,185,129,0.25)] dark:after:shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                    )}
                  />

                  {/* Real composer: stays crisp (never transformed). */}
                  <div className="relative z-10">
                    {renderComposerInner()}
                  </div>
                </motion.div>

                {/* Model Selector Capsule - Below Input, matching style */}
                {/* T54-1: When advanced mode enabled, show profile capsule alongside model picker */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut', delay: 0.05 }}
                  className="mt-3 flex flex-wrap items-center justify-center gap-2"
                >
                  {/* Model Picker Capsule */}
                  <div className="apple-glass inline-flex items-center rounded-xl overflow-hidden h-10">
                    {providerOptions.length > 0 ? (
                      <ModelPicker
                        providers={providerOptions}
                        selectedProviderId={selectedProviderId}
                        selectedModelId={selectedModelIdNew}
                        onProviderChange={onProviderChange!}
                        onModelChange={onModelChangeNew!}
                        disabled={safeIsSending}
                        loading={modelsLoading}
                        error={modelError}
                        className="gap-0"
                        side="bottom"
                      />
                    ) : (
                      <div className="px-4 text-xs text-muted-foreground/70 select-none">
                        {modelsLoading ? (lang === 'zh-CN' ? '正在加载模型…' : 'Loading models…') : ''}
                      </div>
                    )}
                  </div>

                  {/* T54-1: Profile Capsule (only in advanced mode) */}
                  {advancedEnabled && onNewTreeProfileChange && onNewTreeScopeChange && (
                    <div className="apple-glass inline-flex items-center rounded-xl overflow-hidden h-10">
                      <ProfileCapsule
                        profile={newTreeProfile}
                        scope={newTreeScope}
                        onProfileChange={onNewTreeProfileChange}
                        onScopeChange={onNewTreeScopeChange}
                        isMaxDisabled={!isUsingByok}
                        disabled={safeIsSending}
                        lang={lang}
                        className="border-none bg-transparent rounded-none gap-0"
                      />
                    </div>
                  )}
                </motion.div>

                {/* T54-1: Profile error hint */}
                {profileError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-2 text-xs text-red-500 dark:text-red-400"
                  >
                    {profileError}
                  </motion.div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* T-GEMINI-STYLE: Group messages into Q&A turns.
              Each turn starts with a user/root message and includes all following
              AI/system messages until the next user message.
              The LAST turn gets min-height = scroll container height so the user
              message naturally sits at the top of the viewport (Gemini pattern). */}
          {/* T-PROGRESSIVE: "Load earlier messages" sentinel + button */}
          {hasHiddenMessages && (
            <div ref={loadMoreSentinelRef} className="w-full flex justify-center py-4">
              <button
                type="button"
                onClick={handleLoadMoreMessages}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium
                  text-muted-foreground hover:text-foreground
                  bg-muted/50 hover:bg-muted/80 backdrop-blur-sm
                  border border-border/50 hover:border-border
                  transition-all duration-200 ease-out
                  shadow-sm hover:shadow-md"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                <span>
                  {lang === 'zh-CN'
                    ? `加载更早的消息 (还有 ${hiddenMessageCount} 条)`
                    : `Load earlier messages (${hiddenMessageCount} more)`}
                </span>
              </button>
            </div>
          )}
          {(() => {
            // T-PROGRESSIVE: Use visibleMessages (progressive-loaded subset) instead of full messages
            const msgs = visibleMessages;
            // Group messages into turns: each turn starts at a user/root role
            const turns: { startIdx: number; endIdx: number }[] = [];
            let turnStart = 0;
            for (let i = 0; i < msgs.length; i++) {
              const msg = msgs[i];
              if (i > 0 && (msg.role === 'user' || (typeof msg.id === 'string' && msg.id.startsWith('pending-')))) {
                turns.push({ startIdx: turnStart, endIdx: i - 1 });
                turnStart = i;
              }
            }
            if (msgs.length > 0) {
              turns.push({ startIdx: turnStart, endIdx: msgs.length - 1 });
            }

            return turns.map((turn, turnIdx) => {
              const isLastTurn = turnIdx === turns.length - 1;
              const turnMessages = msgs.slice(turn.startIdx, turn.endIdx + 1);
              // Only apply min-height on the last turn when there are multiple turns
              // (i.e., at least one previous Q&A pair exists), so the first Q&A
              // doesn't have unnecessary empty space below.
              const applyMinHeight = isLastTurn && turns.length > 1 && scrollContainerHeight > 0;
              // Subtract toolbar height (pt-16 = 64px) from min-height so user
              // message sits right below the toolbar, not behind it.
              const turnMinHeight = applyMinHeight ? Math.max(0, scrollContainerHeight - 64) : 0;
              // T-GEMINI-FIX: Move bottom padding INSIDE the last turn instead of
              // on the parent container. This prevents min-height + external paddingBottom
              // from stacking up and creating excess scrollable space.
              const turnPaddingBottom = isLastTurn && messageBottomPaddingPx > 0
                ? messageBottomPaddingPx : 0;

              // T-SEND-ANIM: When the turn contains pending/streaming messages,
              // allow AnimatePresence to run initial animations (otherwise
              // initial={false} suppresses them because the AnimatePresence
              // itself is brand-new for this turn).
              const turnHasAnimating = turnMessages.some(
                (m) =>
                  (typeof m.id === 'string' && m.id.startsWith('pending-')) ||
                  Boolean(m.isStreaming),
              );
              // Keep turn key stable across pending-* -> persisted message id swaps.
              // Using first-message id causes the whole turn subtree to remount once per send,
              // which makes the AI header (source label/current badge) blink.
              const turnRenderKey = `turn-${turn.startIdx}`;

              return (
                <div
                  key={turnRenderKey}
                  data-qa-turn={turnIdx}
                  className="w-full"
                  style={{
                    minHeight: turnMinHeight > 0 ? `${turnMinHeight}px` : undefined,
                    paddingBottom: turnPaddingBottom > 0 ? `${turnPaddingBottom}px` : undefined,
                  }}
                >
                  <AnimatePresence initial={turnHasAnimating ? undefined : false}>
                    {turnMessages.map((msg, localIdx) => {
                      const globalIdx = turn.startIdx + localIdx;
                      const isEditing = editingMessageId === msg.id;
                      const isInlineCreatingOutcome = activeInlineOutcomeMessageId === msg.id;
                      const isPendingUser = typeof msg.id === 'string' && msg.id.startsWith('pending-');
                      const shouldAnimateIn = isPendingUser || Boolean(msg.isStreaming);

                      const knowledgeQueryText = (() => {
                        if (msg.role !== 'ai') return null;
                        for (let j = globalIdx - 1; j >= 0; j--) {
                          const prev = msgs[j];
                          if (prev?.role === 'user' || prev?.role === 'root') {
                            return typeof prev.text === 'string' ? prev.text : null;
                          }
                        }
                        return null;
                      })();

                      const bubble = (
                        <ChatMessageBubble
                          message={msg}
                          knowledgeQueryText={knowledgeQueryText}
                          showActions={!readonly}
                          onCreateOutcome={handleCreateInlineOutcomeForMessage}
                          isInlineCreatingOutcome={isInlineCreatingOutcome}
                          onCancelInlineOutcome={handleCancelInlineOutcome}
                          onOutcomeCreated={handleInlineOutcomeCreated}
                          outcomePreview={outcomesApi.preview}
                          outcomeCreate={outcomesApi.create}
                          treeId={treeId}
                          onEditQuestion={onEditQuestion}
                          isEditing={isEditing}
                          editValue={isEditing ? editDraft : undefined}
                          onEditChange={isEditing ? onEditDraftChange : undefined}
                          onEditCancel={isEditing ? onEditCancel : undefined}
                          onEditConfirm={isEditing ? onEditConfirm : undefined}
                          editSubmitting={isEditing ? editSubmitting : false}
                          editAttachments={isEditing ? editAttachments : undefined}
                          editPendingUploads={isEditing ? editPendingUploads : undefined}
                          onEditRemoveAttachment={isEditing ? onEditRemoveAttachment : undefined}
                          onEditUploadFiles={isEditing ? onEditUploadFiles : undefined}
                          onEditRemovePendingUpload={isEditing ? onEditRemovePendingUpload : undefined}
                          onEditRetryPendingUpload={isEditing ? onEditRetryPendingUpload : undefined}
                          onDeleteFrom={onDeleteFrom}
                          actionsDisabled={messageActionsDisabled || safeIsSending}
                          keyframesMap={keyframesMap}
                          onCreateInlineAnnotation={onCreateInlineAnnotation}
                          onUpdateInlineAnnotation={onUpdateInlineAnnotation}
                          onDeleteInlineAnnotation={onDeleteInlineAnnotation}
                          lang={lang === 'zh-CN' ? 'zh' : 'en'}
                          onPreviewAttachment={setPreviewAttachment}
                          onToggleReasoningVisible={onToggleReasoningVisible}
                          onToggleGroundingVisible={onToggleGroundingVisible}
                        />
                      );

                      if (!shouldAnimateIn) {
                        return (
                          <div key={msg.id} className="w-full" data-message-id={msg.id} style={{ overflowAnchor: 'none' }}>
                            {bubble}
                          </div>
                        );
                      }

                      const isUserSendAnim = isPendingUser;
                      // T-GENESIS-FLASH: For the very first turn (turnIdx === 0) with
                      // only 1 turn total, the layout is transitioning from Genesis
                      // (centered) to Chat (top-aligned). A y-slide animation on top
                      // of that layout shift causes a visible "teleport". Use a
                      // subtle opacity-only entrance for this case.
                      const isGenesisExit = isUserSendAnim && turnIdx === 0 && turns.length === 1;
                      return (
                        <motion.div
                          key={msg.id}
                          className="w-full"
                          data-message-id={msg.id}
                          style={{ overflowAnchor: 'none' }}
                          initial={
                            isGenesisExit
                              ? { opacity: 0 }
                              : isUserSendAnim
                                ? { opacity: 0, y: 32, scale: 0.97 }
                                : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={
                            isGenesisExit
                              ? { duration: 0.15, ease: 'easeOut' }
                              : isUserSendAnim
                                ? { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
                              : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                          }
                        >
                          {bubble}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              );
            });
          })()}
          {/* T-FIX-JUMP: Scroll anchor element to help maintain scroll position during content updates */}
          <div ref={endRef} style={{ overflowAnchor: 'auto' }} />
        </div>
        )}
      </div>

      {/* Fixed Input Bar - Only show when NOT in Genesis mode (messages > 0) OR if we relied on layoutId to hide it? NO, layoutId morphs it. */}
      {/* Floating Toolbar - absolute positioned OUTSIDE scroll container (like bottom input) to avoid backdrop-filter flicker */}
      <AnimatePresence initial={false}>
        {!isGenesis && !activeOutcomeId && (
          <motion.div
            key="floating-toolbar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
          >
            <div className="pointer-events-auto">{renderFloatingToolbar()}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UX Master: One-click to bottom button with unread indicator */}
      {/* (moved) Scroll-to-bottom control now lives next to the Model Picker capsule */}

      {/* BUT Wait, if messages.length === 0, we are showing the centered input. The bottom input should NOT be rendered as a separate DOM node if we want to morph properly? */}
      {/* Actually, if we want morph, we should conditionally render: IF Genesis -> Center, IF Chat -> Bottom. */}
      {/* So this block should be wrapped or conditioned. */}
      {!readonly && !isGenesis && !activeOutcomeId && (
        <div
          ref={composerDockRef}
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-[52.8rem] px-4 sm:px-4">
            {/* Floating Model Picker Capsule - centered above input bar with matching style */}
            {providerOptions.length > 0 && onProviderChange && onModelChangeNew && (
              <div className="flex items-center justify-between mb-2 pointer-events-auto min-h-[40px] pr-1.5">
                <div className="apple-glass inline-flex items-center rounded-xl overflow-hidden h-10">
                  <ModelPicker
                    providers={providerOptions}
                    selectedProviderId={selectedProviderId}
                    selectedModelId={selectedModelIdNew}
                    onProviderChange={onProviderChange}
                    onModelChange={onModelChangeNew}
                    disabled={safeIsSending}
                    loading={modelsLoading}
                    error={modelError}
                    className="gap-0"
                    side="top"
                  />
                </div>

                <div className="flex-shrink-0">
                  <AnimatePresence initial={false}>
                    {userScrolledUp && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.8, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: 20 }}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.88 }}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 400, 
                          damping: 25 
                        }}
                        onClick={() => {
                          // T-UX: Clicking "Scroll to Bottom" should instantly lock follow-mode.
                          // Use instant jump ('auto') to avoid clashing with streaming updates.
                          ignoreProgrammaticScrollEventsRef.current = 10;
                          
                          // Force reset interaction flags
                          userInteractingRef.current = false;
                          
                          scrollToBottom('auto');
                          setUserScrolledUp(false);
                          userScrolledUpRef.current = false;
                        }}
                        className={cn(
                          'flex items-center justify-center rounded-full h-10 w-10 overflow-hidden relative',
                          'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
                          'border-2 border-emerald-500/30 dark:border-emerald-400/20',
                          'shadow-[0_12px_24px_-8px_rgba(16,185,129,0.35)] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]',
                          'hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors'
                        )}
                        aria-label={lang === 'zh-CN' ? '回到底部' : 'Scroll to bottom'}
                        title={lang === 'zh-CN' ? '回到底部' : 'Scroll to bottom'}
                      >
                        {isStreamingActive && (
                          <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse" />
                        )}
                        <ArrowDown
                          className={cn(
                            'h-4 w-4 text-emerald-600 dark:text-emerald-400 relative z-10',
                            isStreamingActive && 'animate-bounce'
                          )}
                        />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
            <div
              className={cn(
                "relative pointer-events-auto group"
              )}
            >
              {/* Ghost capsule morphs; text stays outside transform. */}
              <motion.div
                layoutId={inputMorphLayoutId}
                className={cn(
                  "absolute inset-0 apple-glass-capsule !rounded-xl !p-0 pointer-events-none transform-gpu",
                  "shadow-[0_8px_40px_rgba(15,23,42,0.12),0_0_15px_rgba(16,185,129,0.1)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(16,185,129,0.05)]",
                  !isCoarsePointer && "transition-[border-color] duration-1000 ease-out group-hover:border-emerald-500 dark:group-hover:border-emerald-400 after:content-[''] after:absolute after:inset-0 after:rounded-xl after:pointer-events-none after:opacity-0 group-hover:after:opacity-100 after:transition-opacity after:duration-1000 after:ease-out after:shadow-[0_0_30px_rgba(16,185,129,0.25)] dark:after:shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                )}
              />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="relative z-10"
              >
                {renderComposerInner()}
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* T88: Global Attachment Preview Modal */}
      {previewAttachment && (
        <>
          {/* Use specialized text preview panel for text-based formats (CSV/JSON/Log/Code) */}
          {(['csv', 'json', 'yaml', 'yml', 'txt', 'md', 'log', 'js', 'ts', 'py', 'go', 'rs'].includes(previewAttachment.ext.toLowerCase().replace(/^\./, ''))) ? (
            <UploadPreviewPanel
              uploadId={previewAttachment.id}
              open={!!previewAttachment}
              onClose={() => setPreviewAttachment(null)}
              userId={sessionUserId}
            />
          ) : (
            <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
              <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl">
                <DialogHeader className="px-5 py-3 border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {isImageFile(previewAttachment) ? (
                           <Upload className="h-4 w-4 text-primary" />
                        ) : (
                           <FileText className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <DialogTitle className="text-sm font-semibold truncate max-w-[400px]">
                          {previewAttachment.fileName}
                        </DialogTitle>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatFileSize(previewAttachment.sizeBytes)} · {previewAttachment.ext.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pr-6">
                      <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
                        <a href={`/api/upload/${previewAttachment.id}/download`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          新窗口打开
                        </a>
                      </Button>
                      <Button size="sm" asChild className="h-8 gap-1.5 text-xs">
                        <a href={`/api/upload/${previewAttachment.id}/download`} download={previewAttachment.fileName}>
                          <Download className="h-3.5 w-3.5" />
                          下载
                        </a>
                      </Button>
                    </div>
                  </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
                  {isImageFile(previewAttachment) ? (
                    <img 
                      src={`/api/upload/${previewAttachment.id}/download`} 
                      alt={previewAttachment.fileName}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                  ) : previewAttachment.ext.toLowerCase() === '.pdf' || previewAttachment.mimeType === 'application/pdf' ? (
                    <iframe
                      src={`/api/upload/${previewAttachment.id}/download`}
                      className="w-full h-[70vh] rounded-lg border bg-white"
                      title={previewAttachment.fileName}
                    />
                  ) : (
                    <div className="text-center space-y-4 py-20">
                      <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center mx-auto">
                        <FileText className="h-10 w-10 text-primary/40" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">该文件类型暂不支持直接预览</p>
                        <p className="text-xs text-muted-foreground">请点击上方按钮下载后通过本地程序查看</p>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
});
