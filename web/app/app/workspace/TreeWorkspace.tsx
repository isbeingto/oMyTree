'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useResumeToast } from '@/hooks/use-resume-toast';
import { getUploadConstraints, useUpload, type UploadItem, type UploadErrorCode } from '@/hooks/use-upload';
import { ChatPane, type ComposerModelOption, type ChatPaneHandle } from './ChatPane';
// KnowledgePanel is now rendered at AppShell level, not inside TreeWorkspace
import type { ChatMessage } from './ChatMessageBubble';
import { RightDrawerTabs } from './RightDrawerTabs';
import { ResizeHandle } from './ResizeHandle';
import { useResumeSnapshot } from '../../tree/useResumeSnapshot';
import { TreeCanvas } from './TreeCanvas';
import { ContextDrawer } from './ContextDrawer';
import type { Citation, Node } from './types';
import { isRootNode, normalizeNodesForVisuals } from './treeUtils';
import { downloadTreeJson, downloadTreeMarkdown } from './exportUtils';
import { useQATree } from '../../tree/qaClient';
import { useEvidence } from '../../tree/useEvidence';
import { useOutcomeDraft } from '../../tree/useOutcomeDraft';
import { normalizeLang, t, type Lang } from '@/lib/i18n';
import { formatLlmErrorMessage } from '@/lib/llm-error';
import { appApiFetch } from '@/lib/app-api-client';
import { fetchKeyframes, upsertKeyframe, deleteKeyframe, getOutcome, getTurn, listKnowledgeDocuments, type Keyframe, type OutcomeDetailResponse, type KnowledgeBase } from '@/lib/api';
import {
  createAnnotationId,
  normalizeKeyframeAnnotations,
  parseKeyframeAnnotation,
  type InlineAnnotation,
  type InlineAnnotationSelection,
  type KeyframeAnnotation,
} from '@/lib/annotations';
import type { ProviderWithModels } from '@/components/composer/ModelPicker';
import { FolderTree, X } from 'lucide-react';
import { EvidenceDrawer } from './EvidenceDrawer';
import { UploadPreviewPanel } from '@/components/composer/UploadPreviewPanel';
import type { MessageAttachment } from '@/components/message/MessageAttachmentCard';

const PENDING_STREAM_KEY = 'omytree.pendingStream';
const INPUT_DRAFT_KEY = 'omytree.inputDraft'; // Persist input text across page refresh

const STREAM_RENDER_PERSIST_INTERVAL_MS = 250; // reduce localStorage churn during streaming

type StreamMeta = {
  treeId: string | null;
  parentNodeId: string | null;
  requestParentId?: string | null;
  requestUserId?: string | null;
  provider?: string | null;
  model?: string | null;
  isByok?: boolean | null;
  startedAt: string;
  turnId?: string | null;
  text?: string;
  userText?: string;
  status?: 'active' | 'aborted';
};

export interface TreeWorkspaceProps {
  initialTreeId?: string | null;
  initialNodeId?: string | null;
  layoutVariant?: 'standalone' | 'embedded';
  initialNewTreeSession?: boolean;
  /** Mobile-only: open the left tree list sidebar (AppShell Sheet) */
  onOpenMobileSidebar?: () => void;
}

function resolveStreamNodes(nodes: Node[], meta: StreamMeta) {
  const startedTs = meta?.startedAt ? Date.parse(meta.startedAt) : 0;
  const isRecent = (node: Node) =>
    !startedTs || Date.parse(node.created_at || '') >= startedTs - 300000;
  const isAi = (node: Node) => node.role === 'ai' || node.role === 'assistant';

  let userNode: Node | null = null;
  if (meta.parentNodeId) {
    userNode = nodes.find((n) => n.id === meta.parentNodeId && n.role === 'user') || null;
  }
  if (!userNode && meta.requestParentId) {
    userNode =
      nodes.find((n) => n.role === 'user' && n.parent_id === meta.requestParentId && isRecent(n)) ||
      null;
  }
  if (!userNode && !meta.requestParentId && !meta.parentNodeId) {
    userNode =
      nodes.find((n) => n.role === 'user' && !n.parent_id && isRecent(n)) || null;
  }

  let aiNode: Node | null = null;
  if (userNode) {
    aiNode = nodes.find((n) => isAi(n) && n.parent_id === userNode.id && isRecent(n)) || null;
  }

  return { userNode, aiNode };
}

function getPath(nodes: Node[], currentNodeId: string | null): Node[] {
  if (!currentNodeId) return [];

  const nodesById = new Map<string, Node>();
  nodes.forEach((node) => {
    if (node.id) {
      nodesById.set(node.id, node);
    }
  });

  const startNode = nodesById.get(currentNodeId);
  if (!startNode) {
    console.debug('[tree] getPath: current node not found', currentNodeId);
    return [];
  }

  const path: Node[] = [];
  const visited = new Set<string>();
  let cursor: Node | null | undefined = startNode;

  while (cursor && !visited.has(cursor.id)) {
    path.push(cursor);
    visited.add(cursor.id);

    if (!cursor.parent_id) break;
    const parent = nodesById.get(cursor.parent_id);
    if (!parent) {
      console.warn('[tree] getPath: missing parent for node', cursor.id, '->', cursor.parent_id);
      break;
    }
    cursor = parent;
  }

  return path.reverse();
}

export default function TreeWorkspace({
  initialTreeId,
  initialNodeId,
  layoutVariant = 'standalone',
  initialNewTreeSession = false,
  onOpenMobileSidebar,
}: TreeWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();
  const sessionUserId = session?.user?.id ?? null;
  const lang: Lang = normalizeLang((session?.user as any)?.preferred_language);
  const advancedEnabled = Boolean(session?.user?.enable_advanced_context);

  // Use URL params as primary source (for client-side navigation), fallback to props (for SSR)
  const urlTreeId = searchParams.get('tree_id');
  const urlNodeId = searchParams.get('node') || searchParams.get('node_id');
  const urlEvidenceId = searchParams.get('evidence') || searchParams.get('evidence_id');
  const prefillParam = searchParams.get('prefill');
  const urlNewSession =
    searchParams.get('new') === '1' || searchParams.get('new_tree') === '1';

  // T20-6: When URL says new=1, ignore any tree_id from props (stale from SSR)
  // URL params take precedence for client-side navigation
  const effectiveTreeId = urlNewSession ? null : (urlTreeId ?? initialTreeId ?? null);
  const effectiveNodeId = urlNewSession ? null : (urlNodeId ?? initialNodeId ?? null);

  const urlPanel = searchParams.get('panel');

  const [activeTreeId, setActiveTreeId] = useState<string | null>(effectiveTreeId);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(effectiveNodeId);
  const currentNodeIdRef = useRef<string | null>(currentNodeId);
  const [inputText, setInputText] = useState('');
  const [isNewTreeSession, setIsNewTreeSession] = useState<boolean>(
    initialNewTreeSession || urlNewSession
  );
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<'path' | 'all'>('path');
  const [isTreeLoading, setIsTreeLoading] = useState(false);
  const [pruneDialogOpen, setPruneDialogOpen] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  // Right tree panel state - initialized from localStorage, fallback to true if we have a tree_id
  const [isTreePanelOpen, setIsTreePanelOpen] = useState<boolean | null>(null);
  // T60: Tab state removed - right drawer now shows TreeCanvas only
  // T56-2: Context drawer state
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [contextDrawerSource, setContextDrawerSource] = useState<string | null>(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const chatPaneRef = useRef<ChatPaneHandle>(null);
  // T29-0: Resizable tree drawer width (in pixels)
  // null = not yet hydrated from localStorage
  const [treeDrawerWidth, setTreeDrawerWidth] = useState<number | null>(null);
  // T30: Mobile tree panel Sheet state
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  // Pending user message shown immediately while waiting for API
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);
  // Tree topic from API (takes priority over root node text)
  const [treeMetaTopic, setTreeMetaTopic] = useState<string | null>(null);
  // T29-3: Model switcher state (legacy)
  const [modelOptions, setModelOptions] = useState<ComposerModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [streamingAiMessage, setStreamingAiMessage] = useState<ChatMessage | null>(null);
  // DeepSeek Reasoning UI: per-message visibility (persisted nodes are reconstructed from `nodes`)
  const [reasoningVisibleMap, setReasoningVisibleMap] = useState<Record<string, boolean>>({});
  // Gemini Grounding UI: per-message visibility + metadata (best-effort, client-side cache)
  const [groundingVisibleMap, setGroundingVisibleMap] = useState<Record<string, boolean>>({});
  const [groundingMetadataMap, setGroundingMetadataMap] = useState<Record<string, any>>({});
  // When streaming finishes, backend may persist ai_node slightly later than the last token.
  // Keep a stable, non-streaming placeholder message to avoid the "AI bubble disappears" flash.
  const lastCompletedAiNodeIdRef = useRef<string | null>(null);
  const activeStreamController = useRef<AbortController | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const activeStreamingPlaceholderIdRef = useRef<string | null>(null);
  // If user aborts before we receive the server-assigned turn_id, keep the stream
  // alive until the start event arrives so we can explicitly abort on the backend.
  const pendingServerAbortRef = useRef<{
    abortUserId: string | null;
    hasPartialText: boolean;
  } | null>(null);
  // When an abort is in progress, we must NOT unlock sending from the streaming
  // flow's `finally` block; otherwise the next send can capture an old parent_id.
  // Unlock is handled by the abort-response handlers after currentNodeId is updated.
  const abortInProgressRef = useRef(false);
  // For brand-new tree creation, we need exactly one router-sync to transition
  // away from ?new=1 so `useSearchParams()` updates. Doing multiple router.replace()
  // calls can race and overwrite the final node selection.
  const newTreeUrlSyncedRef = useRef<boolean>(false);
  const lastStreamTextRef = useRef<string>('');
  const pendingAttachmentsRef = useRef<ChatMessage['attachments']>([]);
  const activeStreamMeta = useRef<StreamMeta | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const manualAbortRef = useRef(false);
  const hasCheckedRecoveryRef = useRef(false);

  // T93-12: Outcome highlighting state
  const [activeOutcomeId, setActiveOutcomeId] = useState<string | null>(null);
  const [activeOutcomeDetail, setActiveOutcomeDetail] = useState<OutcomeDetailResponse | null>(null);
  const [activeOutcomePathIds, setActiveOutcomePathIds] = useState<Set<string>>(new Set());
  const [activeOutcomeKeyframeIds, setActiveOutcomeKeyframeIds] = useState<Set<string>>(new Set());

  const handleToggleTreePanel = useCallback(() => {
    setIsTreePanelOpen((prev) => (prev === null ? prev : !prev));
  }, []);

  const handleSelectOutcome = useCallback((outcomeId: string, detail: OutcomeDetailResponse) => {
    setActiveOutcomeId(outcomeId);
    setActiveOutcomeDetail(detail);
    if (detail.highlight) {
      setActiveOutcomePathIds(new Set(detail.highlight.main_path_node_ids));
      setActiveOutcomeKeyframeIds(new Set(detail.highlight.keyframe_node_ids));
    } else {
      setActiveOutcomePathIds(new Set());
      setActiveOutcomeKeyframeIds(new Set());
    }
  }, []);

  const handleClearOutcome = useCallback(() => {
    setActiveOutcomeId(null);
    setActiveOutcomeDetail(null);
    setActiveOutcomePathIds(new Set());
    setActiveOutcomeKeyframeIds(new Set());
  }, []);

  const handleOutcomeDetailChange = useCallback((detail: OutcomeDetailResponse) => {
    setActiveOutcomeDetail(detail);
    if (detail.highlight) {
      setActiveOutcomePathIds(new Set(detail.highlight.main_path_node_ids));
      setActiveOutcomeKeyframeIds(new Set(detail.highlight.keyframe_node_ids));
    }
  }, []);

  const handleToggleReasoningVisible = useCallback((messageId: string, nextVisible: boolean) => {
    setReasoningVisibleMap((prev) => ({ ...prev, [messageId]: nextVisible }));
    setStreamingAiMessage((prev) => {
      if (!prev) return prev;
      if (prev.id !== messageId) return prev;
      return { ...prev, reasoningVisible: nextVisible };
    });
  }, []);

  const handleToggleGroundingVisible = useCallback((messageId: string, nextVisible: boolean) => {
    setGroundingVisibleMap((prev) => ({ ...prev, [messageId]: nextVisible }));
    setStreamingAiMessage((prev) => {
      if (!prev) return prev;
      if (prev.id !== messageId) return prev;
      return { ...prev, groundingVisible: nextVisible };
    });
  }, []);

  // Streaming text tracking:
  // - `streamingRenderedTextRef`: text already rendered to the user
  // - `lastStreamTextRef`: latest full text snapshot (for abort/recovery)
  const streamingRenderedTextRef = useRef<string>('');
  const streamingReasoningTextRef = useRef<string>('');
  const streamingPersistLastMsRef = useRef<number>(0);
  const streamingServerDoneRef = useRef<boolean>(false);

  // T29-QA-5: Two-segment model picker state
  const [providerOptions, setProviderOptions] = useState<ProviderWithModels[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelIdNew, setSelectedModelIdNew] = useState<string | null>(null);
  const [newTreeProfile, setNewTreeProfile] = useState<'lite' | 'standard' | 'max' | null>(null);
  const [newTreeMemoryScope, setNewTreeMemoryScope] = useState<'branch' | 'tree'>('branch');
  const [newTreeProfileError, setNewTreeProfileError] = useState<string | null>(null);
  // Track the most recent context profile/scope for the active tree so UI can render even if API omits the fields
  const [lastContextProfile, setLastContextProfile] = useState<'lite' | 'standard' | 'max' | null>(null);
  const [lastMemoryScope, setLastMemoryScope] = useState<'branch' | 'tree' | null>(null);

  // T28-1: Delete from here dialog state
  const [deleteFromDialogOpen, setDeleteFromDialogOpen] = useState(false);
  const [deleteFromNodeId, setDeleteFromNodeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // T28-1: Edit question inline state
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editNewText, setEditNewText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editAttachments, setEditAttachments] = useState<MessageAttachment[]>([]);
  const [editPendingUploadIds, setEditPendingUploadIds] = useState<string[]>([]);
  const editNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    editNodeIdRef.current = editNodeId;
  }, [editNodeId]);

  // Keyframes (Pins) state: map raw node_id -> keyframe
  const [keyframesMap, setKeyframesMap] = useState<Record<string, Keyframe>>({});

  const keyframeIdToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [nodeId, keyframe] of Object.entries(keyframesMap)) {
      if (keyframe?.id) {
        map.set(keyframe.id, nodeId);
      }
    }
    return map;
  }, [keyframesMap]);

  // Share state
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [viewerBase, setViewerBase] = useState<string>('');

  const { data: qaTree, mutate: refreshQATree } = useQATree(activeTreeId);

  // T56-1: Resume snapshot management (T60: Layer-2 moved to top capsule; only snapshot/snapshotHistory used)
  const {
    snapshot: resumeSnapshot,
    snapshots: snapshotHistory,
    generateSnapshot: handleGenerateSnapshot,
  } = useResumeSnapshot(activeTreeId, { autoFetch: false });

  const {
    draft: outcomeDraft,
    isLoading: outcomeDraftLoading,
  } = useOutcomeDraft(activeTreeId);

  // T56-3: Resume toast suggestions - non-intrusive prompt to generate Resume
  const handleResumeToastAction = useCallback(() => {
    handleGenerateSnapshot?.();
  }, [handleGenerateSnapshot]);

  const {
    onTurnComplete: resumeToastOnTurnComplete,
    onEvidenceAttached: resumeToastOnEvidenceAttached,
  } = useResumeToast({
    treeId: activeTreeId,
    lang,
    turnThreshold: 5,
    burstNodeCount: 3,
    burstTimeWindowMs: 60000,
    hasExistingSnapshot: Boolean(resumeSnapshot || (snapshotHistory && snapshotHistory.length > 0)),
    onGenerateResume: handleResumeToastAction,
  });

  // T58-4: Evidence data + actions (T66: Auto-fetch disabled)
  const {
    evidence,
    isLoading: evidenceLoading,
    error: evidenceError,
    attachEvidenceToNode,
    nodeEvidenceMap,
    loadNodeEvidence,
    nodeEvidenceLoading,
    evidenceNodesMap,
    loadEvidenceNodes,
    evidenceNodesLoading,
  } = useEvidence(activeTreeId, {
    onEvidenceAttached: resumeToastOnEvidenceAttached,
    userId: sessionUserId,
    enabled: false,
  });

  // T29-QA-5: Get current provider and model info for upload constraints
  const currentProviderOption = useMemo(
    () => providerOptions.find((p) => p.id === selectedProviderId) || null,
    [providerOptions, selectedProviderId]
  );

  const currentModelInfo = useMemo(() => {
    if (!currentProviderOption || !selectedModelIdNew) return null;
    return currentProviderOption.models.find((m) => m.id === selectedModelIdNew) || null;
  }, [currentProviderOption, selectedModelIdNew]);

  const inferProviderFromModelId = useCallback((modelId?: string | null) => {
    const normalized = (modelId || '').toLowerCase();
    if (normalized.includes('gemini')) return 'google';
    if (normalized.includes('claude')) return 'anthropic';
    if (normalized.includes('deepseek')) return 'deepseek';
    if (normalized.includes('gpt')) return 'openai';
    return null;
  }, []);

  const resolvedUploadProvider = useMemo(() => {
    const rawProvider = (selectedProviderId || currentProviderOption?.id || '').toLowerCase();
    const inferred = inferProviderFromModelId(currentModelInfo?.id || null);
    return rawProvider && rawProvider !== 'omytree-default' ? rawProvider : inferred;
  }, [selectedProviderId, currentProviderOption?.id, currentModelInfo?.id, inferProviderFromModelId]);

  const fileProcessingMode = useMemo(() => {
    const resolvedProvider = resolvedUploadProvider;
    if (resolvedProvider === 'deepseek') return 'local';
    if (
      resolvedProvider === 'openai'
      || resolvedProvider === 'google'
      || resolvedProvider === 'gemini'
      || resolvedProvider === 'anthropic'
      || resolvedProvider === 'claude'
    ) {
      return 'native';
    }
    return 'local';
  }, [resolvedUploadProvider]);

  const uploadHint = useMemo(() => {
    return fileProcessingMode === 'native' ? t(lang, 'upload_hint_native') : null;
  }, [fileProcessingMode, lang]);

  const uploadConstraints = useMemo(() => {
    return getUploadConstraints({ mode: fileProcessingMode, provider: resolvedUploadProvider || null });
  }, [fileProcessingMode, resolvedUploadProvider]);

  const uploadFormatsHint = useMemo(() => {
    const formats = uploadConstraints.allowedExtensions.join(', ');
    return lang === 'zh-CN' ? `支持格式：${formats}` : `Supports: ${formats}`;
  }, [lang, uploadConstraints.allowedExtensions]);

  const uploadMaxSizeHint = useMemo(() => {
    const mb = Math.max(1, Math.round(uploadConstraints.maxFileSize / (1024 * 1024)));
    return lang === 'zh-CN' ? `单文件最大 ${mb}MB` : `Max ${mb}MB per file`;
  }, [lang, uploadConstraints.maxFileSize]);

  // KB-2: Knowledge Base selections for the current conversation
  const [selectedKnowledge, setSelectedKnowledge] = useState<{
    kb: KnowledgeBase | null;
    docs: Array<{ id: string; name: string; parse_status?: string; enable_status?: string }>;
  }>({ kb: null, docs: [] });
  // Legacy compatibility: keep selectedKBs for older payloads/handlers.
  const [selectedKBs, setSelectedKBs] = useState<KnowledgeBase[]>([]);

  const handleAddKB = useCallback((id: string, name: string) => {
    // v0 single-select: replacing selection aligns with task card.
    const kb = { id, name } as KnowledgeBase;
    setSelectedKBs([kb]);
    setSelectedKnowledge({ kb, docs: [] });
  }, []);
  const handleRemoveKB = useCallback((id: string) => {
    setSelectedKBs((prev) => prev.filter((kb) => kb.id !== id));
    setSelectedKnowledge((prev) => (prev.kb?.id === id ? { kb: null, docs: [] } : prev));
  }, []);

  const clearKBSelections = useCallback(() => {
    setSelectedKBs([]);
    setSelectedKnowledge({ kb: null, docs: [] });
  }, []);

  const handleApplyKnowledge = useCallback((selection: {
    kb: KnowledgeBase | null;
    docs: Array<{ id: string; name: string; parse_status?: string; enable_status?: string }>;
  }) => {
    setSelectedKnowledge({ kb: selection.kb, docs: Array.isArray(selection.docs) ? selection.docs : [] });
    setSelectedKBs(selection.kb ? [selection.kb] : []);
  }, []);

  const handleRemoveKnowledgeDoc = useCallback((docId: string) => {
    setSelectedKnowledge((prev) => ({
      ...prev,
      docs: prev.docs.filter((d) => d.id !== docId),
    }));
  }, []);

  const handleOpenKnowledgeManager = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('panel', 'knowledge');
    if (selectedKnowledge.kb?.id) {
      params.set('kb', selectedKnowledge.kb.id);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams, selectedKnowledge.kb?.id]);

  const maybeWarnKnowledgeSelection = useCallback(async () => {
    const kbId = selectedKnowledge.kb?.id;
    if (!kbId) return;
    try {
      const res = await listKnowledgeDocuments(kbId, { userId: sessionUserId || undefined });
      const allDocs: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const chosenIds = selectedKnowledge.docs.map((d) => d.id);
      const scopeDocs = chosenIds.length > 0
        ? allDocs.filter((d) => chosenIds.includes(String(d.id)))
        : allDocs;

      const normalized = scopeDocs.map((d) => ({
        id: String(d.id),
        parse: String(d.parse_status || '').toLowerCase(),
        enable: String(d.enable_status || 'enabled').toLowerCase(),
      }));

      const enabledDocs = normalized.filter((d) => d.enable !== 'disabled');
      const completedDocs = enabledDocs.filter((d) => d.parse === 'completed');
      const hasProcessing = enabledDocs.some((d) => d.parse === 'processing' || d.parse === 'pending');

      if (enabledDocs.length === 0 || completedDocs.length === 0) {
        toast({
          title: t(lang, 'toast_kb_no_docs'),
          variant: 'destructive',
        });
        return;
      }

      if (hasProcessing) {
        toast({
          title: t(lang, 'toast_kb_docs_processing'),
        });
      }
    } catch {
      // best-effort; ignore
    }
  }, [lang, selectedKnowledge.kb?.id, selectedKnowledge.docs, sessionUserId, toast]);

  // T85: New text file upload hook
  const {
    uploads: uploadItems,
    isUploading,
    uploadFile,
    removeUpload,
    retryUpload,
    clearUploads,
    getUploadIds,
  } = useUpload({
    treeId: activeTreeId,
    userId: sessionUserId,
    constraints: uploadConstraints,
    onUploadQueued: (upload) => {
      if (!editNodeIdRef.current) return;
      // Track temp IDs so edit bubble can show uploading/error chips.
      if (upload.tempId) {
        setEditPendingUploadIds((prev) => (prev.includes(upload.tempId!) ? prev : [...prev, upload.tempId!]));
      }
    },
    onUploadSuccess: (upload) => {
      // If we are editing a question, uploads should be attached to that edit by default.
      if (!editNodeIdRef.current) return;

      // If this upload was tracked as pending via tempId, replace it with the real upload id.
      if (upload.tempId) {
        setEditPendingUploadIds((prev) => prev.filter((id) => id !== upload.tempId));
      }
      setEditAttachments((prev) => {
        if (prev.some((a) => a.id === upload.id)) return prev;
        return [
          ...prev,
          { id: upload.id, fileName: upload.fileName, ext: upload.ext, sizeBytes: upload.sizeBytes },
        ];
      });
    },
    onUploadError: (fileName, errorCode, details) => {
      const code = errorCode as UploadErrorCode;
      const baseMessage = t(lang, code);

      let description = `${fileName}: ${baseMessage}`;
      if (code === 'upload_error_unsupported_type' && details?.allowedExtensions?.length) {
        const allowed = details.allowedExtensions.join(', ');
        const mode = (details.mode || fileProcessingMode);
        const ext = (details.ext || '').toLowerCase();
        const provider = (details.provider || resolvedUploadProvider || null);
        const isAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext);

        if (mode === 'local') {
          description += `\n${t(lang, 'toast_upload_allowed_in_mode')}${allowed}`;
          description += `\n${t(lang, 'toast_upload_tip_switch_model')}`;
        } else {
          description += `\n${t(lang, 'toast_upload_supported')}${allowed}`;
          if (isAudio && provider && !['openai', 'google', 'gemini'].includes(String(provider).toLowerCase())) {
            description += `\n${t(lang, 'toast_upload_tip_audio')}`;
          }
        }
      }

      toast({
        title: baseMessage || t(lang, 'upload_error_generic'),
        description,
        variant: 'destructive',
      });
    },
  });

  // T85: Convert uploads to chip format for ChatPane
  const uploadChips = useMemo(() => {
    return uploadItems.map((item) => ({
      id: item.id,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
      status: item.status,
      errorMessage: item.errorMessage,
    }));
  }, [uploadItems]);

  // T85: Handle file upload (calls useUpload)
  const handleFileUpload = useCallback(async (file: File) => {
    await uploadFile(file);
  }, [uploadFile]);

  const handleEditUploadFiles = useCallback(async (files: FileList) => {
    if (!activeTreeId) {
      toast({ title: t(lang, 'toast_upload_no_tree'), description: t(lang, 'toast_upload_no_tree_desc'), variant: 'destructive' });
      return;
    }
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  }, [activeTreeId, uploadFile, toast]);

  const handleEditRemoveAttachment = useCallback((attachmentId: string) => {
    setEditAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, []);

  const handleEditRemovePendingUpload = useCallback(async (uploadId: string) => {
    setEditPendingUploadIds((prev) => prev.filter((id) => id !== uploadId));
    await removeUpload(uploadId);
  }, [removeUpload]);

  const handleEditRetryPendingUpload = useCallback(async (uploadId: string) => {
    // retryUpload will remove this item and requeue a new tempId (captured by onUploadQueued)
    setEditPendingUploadIds((prev) => prev.filter((id) => id !== uploadId));
    await retryUpload(uploadId);
  }, [retryUpload]);

  const editPendingUploads = useMemo(() => {
    if (!editNodeId) return [];
    const items = editPendingUploadIds
      .map((id) => uploadItems.find((u) => u.id === id))
      .filter(Boolean) as UploadItem[];
    return items.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      sizeBytes: u.sizeBytes,
      status: u.status,
      errorMessage: u.errorMessage,
    }));
  }, [editNodeId, editPendingUploadIds, uploadItems]);

  // T85: Handle upload chip removal
  const handleRemoveUpload = useCallback(async (uploadId: string) => {
    await removeUpload(uploadId);
  }, [removeUpload]);

  // T85: Handle upload retry
  const handleRetryUpload = useCallback(async (uploadId: string) => {
    await retryUpload(uploadId);
  }, [retryUpload]);

  // T87: Upload preview panel state
  const [previewUploadId, setPreviewUploadId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // T87: Handle upload preview
  const handlePreviewUpload = useCallback((uploadId: string) => {
    setPreviewUploadId(uploadId);
    setPreviewOpen(true);
  }, []);

  // T87: Close preview panel
  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    // Clear ID after animation
    setTimeout(() => setPreviewUploadId(null), 300);
  }, []);

  const evidenceGaps = useMemo(
    () =>
      (outcomeDraft?.evidence_requirements || []).filter((req) =>
        req.status === 'missing' || req.status === 'needs_material'
      ),
    [outcomeDraft?.evidence_requirements]
  );


  const selectedQANodeId = useMemo(() => {
    if (!qaTree || !currentNodeId) return null;
    const node = qaTree.nodes.find(n => n.user_node_id === currentNodeId || n.ai_node_id === currentNodeId);
    return node ? node.id : null;
  }, [qaTree, currentNodeId]);

  // KeyframesMap keys are raw node IDs (user_node_id or ai_node_id)
  // We need to map them to QANode.id for TreeCanvas
  const keyframeNodeIds = useMemo(() => {
    if (!qaTree) return new Set<string>();

    const keyframeRawIds = new Set(Object.keys(keyframesMap));
    const qaNodeIds = new Set<string>();

    for (const qaNode of qaTree.nodes) {
      if (keyframeRawIds.has(qaNode.user_node_id) || (qaNode.ai_node_id && keyframeRawIds.has(qaNode.ai_node_id))) {
        qaNodeIds.add(qaNode.id);
      }
    }

    return qaNodeIds;
  }, [keyframesMap, qaTree]);

  // T93-1: Story Mode removed - golden-path no longer exposed in UI

  const buildModelOptionId = useCallback((provider: string, model?: string | null) => {
    const modelPart = model && model.length > 0 ? model : 'default';
    return `${provider}::${modelPart}`;
  }, []);

  useEffect(() => {
    const advancedEnabled = Boolean(session?.user?.enable_advanced_context);
    // T54-1: Always default to 'lite' profile and 'branch' scope
    // Previously we set profile to null when advanced was enabled, requiring user selection
    // Now we default to Lite for a smoother UX
    if (!advancedEnabled) {
      setNewTreeProfile('lite');
      setNewTreeMemoryScope('branch');
      setNewTreeProfileError(null);
    } else {
      // T54-1: Default to 'lite' even in advanced mode (user can change if desired)
      setNewTreeProfile('lite');
      setNewTreeMemoryScope('branch');
      setNewTreeProfileError(null);
    }
  }, [session?.user?.enable_advanced_context]);

  useEffect(() => {
    if (!isNewTreeSession) {
      setNewTreeProfileError(null);
    }
  }, [isNewTreeSession]);

  const providerLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    modelOptions.forEach((opt) => {
      if (opt.provider && opt.providerLabel && !map.has(opt.provider)) {
        map.set(opt.provider, opt.providerLabel);
      }
    });
    return map;
  }, [modelOptions]);

  const buildSourceLabel = useCallback(
    (provider?: string | null, model?: string | null, isByok?: boolean | null) => {
      if (!provider && !model) {
        return 'Legacy';
      }
      const normalizedProvider = (provider || '').toLowerCase();
      const providerLabel =
        modelOptions.find((opt) => opt.provider === provider && (!model || opt.model === model))
          ?.providerLabel ||
        providerLabelMap.get(provider || '') ||
        (normalizedProvider === 'omytree-default'
          ? 'oMyTree Default'
          : normalizedProvider === 'openai'
            ? 'OpenAI'
            : normalizedProvider === 'google' || normalizedProvider === 'gemini'
              ? 'Google AI'
              : provider || 'Legacy');
      const modelLabel =
        modelOptions.find((opt) => opt.provider === provider && opt.model === model)?.modelLabel ||
        model ||
        null;
      const suffix = isByok ? ' (BYOK)' : '';
      if (providerLabel && modelLabel) {
        return `${providerLabel} · ${modelLabel}${suffix}`;
      }
      if (providerLabel) {
        return `${providerLabel}${suffix}${modelLabel ? ` · ${modelLabel}` : ''}`;
      }
      if (modelLabel) {
        return `${modelLabel}${suffix}`;
      }
      return 'Legacy';
    },
    [modelOptions, providerLabelMap]
  );

  const loadModelOptions = useCallback(async () => {
    setModelsLoading(true);
    setModelError(null);
    try {
      const safeFetch = async (url: string) => {
        try {
          const res = url.startsWith('/api/')
            ? await appApiFetch(url, { credentials: 'include' })
            : await fetch(url, { credentials: 'include' });
          const status = res.status;
          if (!res.ok) {
            return { ok: false, status, data: null };
          }
          const data = await res.json().catch(() => null);
          return { ok: true, status, data };
        } catch (err) {
          console.warn('[models] fetch failed', url, err);
          return { ok: false, status: null, data: null };
        }
      };

      // T32-2: Use new unified available-models API
      const [settingsRes, availableModelsRes] = await Promise.all([
        safeFetch('/api/account/llm-settings'),
        safeFetch('/api/account/available-models'),
      ]);

      const settingsData = settingsRes.data;
      const availableData = availableModelsRes.ok ? availableModelsRes.data : null;

      // Build provider options from the unified API response
      const apiProviders = availableData?.providers || [];

      // Ollama device check: only show Ollama models if this device has the
      // localStorage marker (set during Ollama setup in settings).
      const ollamaLocallyConfigured = typeof window !== 'undefined'
        && !!window.localStorage.getItem('omytree.ollamaBaseUrl');

      // Build legacy model options for compatibility
      const combinedOptions: ComposerModelOption[] = [];
      for (const provider of apiProviders) {
        // Skip Ollama models if not configured on this device
        if (provider.id === 'ollama' && !ollamaLocallyConfigured) continue;
        for (const model of provider.models || []) {
          combinedOptions.push({
            id: buildModelOptionId(provider.id, model.id),
            provider: provider.id,
            model: model.id,
            label: `${provider.name} · ${model.name}`,
            description: '',
            group: provider.isByok ? 'byok' : 'platform',
            badge: provider.badge || (provider.isByok ? 'BYOK' : 'Platform'),
            providerLabel: provider.name,
            modelLabel: model.name,
            isByok: provider.isByok || false,
          });
        }
      }
      setModelOptions(combinedOptions);

      // T32-2: Build provider options for dual-segment picker
      // Ollama device check is already done above via ollamaLocallyConfigured.

      const newProviderOptions: ProviderWithModels[] = apiProviders.map((p: any) => {
        // If the provider is Ollama but this device has no local marker,
        // override to show "not configured" with empty models.
        if (p.id === 'ollama' && !ollamaLocallyConfigured) {
          return {
            id: p.id,
            name: p.name,
            badge: p.badge,
            models: [],
            hasApiKey: false,
            isByok: false,
            disabled: false,
            notConfigured: true,
            isOllama: true,
          };
        }
        return {
          id: p.id,
          name: p.name,
          badge: p.badge,
          models: (p.models || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            description: '',
            enabled: m.enabled !== false,
            providerKind: m.providerKind || undefined,
            providerLabel: m.providerLabel || undefined,
          })),
          hasApiKey: p.hasApiKey,
          isByok: p.isByok || false,
          disabled: p.disabled || false,
          notConfigured: p.notConfigured || false,
          isOllama: p.id === 'ollama',
        };
      });

      setProviderOptions(newProviderOptions);

      const preferredProvider = settingsData?.provider || 'omytree-default';
      const storedSelection =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('omytree.selectedModel')
          : null;

      const providerMatch =
        combinedOptions.find((opt) => opt.provider === preferredProvider) || combinedOptions[0] || null;
      const nextSelection =
        (storedSelection && combinedOptions.some((opt) => opt.id === storedSelection) && storedSelection) ||
        providerMatch?.id ||
        null;

      setSelectedModelId((prev) => {
        if (prev && combinedOptions.some((opt) => opt.id === prev)) {
          return prev;
        }
        return nextSelection;
      });

      // T32-2: Set initial provider/model selection for dual picker
      const storedProviderId = typeof window !== 'undefined'
        ? window.localStorage.getItem('omytree.selectedProviderId')
        : null;
      const storedModelIdNew = typeof window !== 'undefined'
        ? window.localStorage.getItem('omytree.selectedModelIdNew')
        : null;

      // Find valid stored selection or use defaults
      const selectableProviders = newProviderOptions.filter((p) => !p.disabled);
      const findSelectable = (id: string | null) =>
        id ? selectableProviders.find((p) => p.id === id) : null;
      const validProvider = findSelectable(storedProviderId)
        || findSelectable(preferredProvider)
        || selectableProviders[0]
        || newProviderOptions[0];

      if (validProvider) {
        setSelectedProviderId(validProvider.id);

        const enabledModels = validProvider.disabled
          ? []
          : validProvider.models.filter((m) => m.enabled !== false);
        const validModel = enabledModels.find((m) => m.id === storedModelIdNew)
          || enabledModels[0];

        if (validModel) {
          setSelectedModelIdNew(validModel.id);
        }
      }

      if (!settingsRes.ok) {
        setModelError('无法读取模型配置，已使用默认模型');
      } else if (!availableModelsRes.ok) {
        setModelError('模型列表加载失败');
      }
    } catch (err) {
      console.error('[models] failed to load model options', err);
      setModelError('模型列表加载失败');
    } finally {
      setModelsLoading(false);
    }
  }, [buildModelOptionId]);

  // T29-QA-5: selectedModelOption is now derived from dual picker state
  // Use new picker state if available, fall back to legacy
  const selectedModelOption = useMemo(() => {
    // If we have new dual picker state, use that
    if (selectedProviderId && selectedModelIdNew && providerOptions.length > 0) {
      const provider = providerOptions.find((p) => p.id === selectedProviderId);
      if (provider) {
        const model = provider.models.find((m) => m.id === selectedModelIdNew);
        if (model) {
          return {
            id: `${selectedProviderId}:${selectedModelIdNew}`,
            provider: selectedProviderId,
            model: selectedModelIdNew,
            label: `${provider.name} · ${model.name}`,
            description: '',
            group: provider.isByok ? 'byok' : 'platform',
            badge: provider.badge,
            providerLabel: provider.name,
            modelLabel: model.name,
            isByok: provider.isByok || false,
          } as ComposerModelOption;
        }
      }
    }
    // Fall back to legacy model options
    return modelOptions.find((opt) => opt.id === selectedModelId) || null;
  }, [selectedProviderId, selectedModelIdNew, providerOptions, modelOptions, selectedModelId]);

  // T29-QA-5: Provider change handler
  const handleProviderChange = useCallback((providerId: string) => {
    setSelectedProviderId(providerId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('omytree.selectedProviderId', providerId);
    }

    // Auto-select first enabled model
    const provider = providerOptions.find((p) => p.id === providerId);
    if (provider) {
      const enabledModels = provider.models.filter((m) => m.enabled !== false);
      if (enabledModels.length > 0) {
        setSelectedModelIdNew(enabledModels[0].id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('omytree.selectedModelIdNew', enabledModels[0].id);
        }
      } else {
        setSelectedModelIdNew(null);
      }
    }
  }, [providerOptions]);

  // T29-QA-5: Model change handler
  const handleModelChangeNew = useCallback((modelId: string) => {
    setSelectedModelIdNew(modelId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('omytree.selectedModelIdNew', modelId);
    }
  }, []);

  // T48-1: Check if user is currently using BYOK provider (not default)
  const isUsingByokProvider = useMemo(() => {
    return selectedProviderId !== null && selectedProviderId !== 'omytree-default';
  }, [selectedProviderId]);

  // Right tree panel state persistence (mirrors left sidebar pattern)
  // Only read from localStorage on mount, not on effectiveTreeId change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('omytree.treePanelOpen');
    if (stored !== null) {
      setIsTreePanelOpen(stored === 'true');
    } else {
      // No stored value: default to open if we have a tree
      setIsTreePanelOpen(!!effectiveTreeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  useEffect(() => {
    if (typeof window === 'undefined' || isTreePanelOpen === null) return;
    window.localStorage.setItem('omytree.treePanelOpen', String(isTreePanelOpen));
  }, [isTreePanelOpen]);

  // T29-0: Tree drawer width persistence
  // Default width: 320px, min: 280px, max: 60% of viewport
  const TREE_DRAWER_DEFAULT_WIDTH = 320;
  const TREE_DRAWER_MIN_WIDTH = 280;
  const TREE_DRAWER_MAX_WIDTH_RATIO = 0.6;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('omytree.treeDrawerWidth.v1');
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      const maxWidth = Math.floor(window.innerWidth * TREE_DRAWER_MAX_WIDTH_RATIO);
      // Validate: must be a number within reasonable bounds
      if (!isNaN(parsed) && parsed >= TREE_DRAWER_MIN_WIDTH && parsed <= maxWidth) {
        setTreeDrawerWidth(parsed);
      } else {
        // Invalid stored value, use default
        setTreeDrawerWidth(TREE_DRAWER_DEFAULT_WIDTH);
      }
    } else {
      setTreeDrawerWidth(TREE_DRAWER_DEFAULT_WIDTH);
    }
  }, []); // Only run on mount

  // Save tree drawer width to localStorage when resize ends
  const handleTreeDrawerResizeEnd = useCallback(() => {
    if (typeof window === 'undefined' || treeDrawerWidth === null) return;
    window.localStorage.setItem('omytree.treeDrawerWidth.v1', String(treeDrawerWidth));
  }, [treeDrawerWidth]);

  // Calculate max width dynamically based on viewport
  const treeDrawerMaxWidth = useMemo(() => {
    if (typeof window === 'undefined') return 800;
    return Math.floor(window.innerWidth * TREE_DRAWER_MAX_WIDTH_RATIO);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin || '';
      setViewerBase(base.replace(/\/$/, ''));
    }
  }, []);

  useEffect(() => {
    loadModelOptions();
  }, [loadModelOptions]);

  // Listen for BYOK provider changes to refresh model options
  useEffect(() => {
    const handleByokChange = () => {
      loadModelOptions();
    };
    window.addEventListener('byok-provider-changed', handleByokChange);
    return () => window.removeEventListener('byok-provider-changed', handleByokChange);
  }, [loadModelOptions]);

  useEffect(() => {
    return () => {
      if (activeStreamController.current) {
        activeStreamController.current.abort();
      }
      // Reset abort-in-progress to avoid stale state leaking across HMR/remounts
      abortInProgressRef.current = false;
    };
  }, []);

  // T-REFRESH-FIX: Last-chance persist before page unload.
  // When user refreshes or navigates away during streaming, do a final
  // localStorage write with the latest accumulated text so recovery can
  // restore it on the next mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      const meta = activeStreamMeta.current;
      if (!meta) return;

      // Persist the very latest text (refs are still available during unload)
      const latestText = lastStreamTextRef.current || streamingRenderedTextRef.current || meta.text || '';
      if (latestText || meta.treeId) {
        try {
          const finalMeta: StreamMeta = {
            ...meta,
            text: latestText,
            status: meta.status === 'aborted' ? 'aborted' : 'active',
          };
          window.localStorage.setItem(PENDING_STREAM_KEY, JSON.stringify(finalMeta));
        } catch {
          // Best-effort; localStorage might be full
        }
      }

      // Fire-and-forget: notify server to abort and save partial content.
      // navigator.sendBeacon is more reliable than fetch during unload.
      const turnId = activeTurnIdRef.current;
      if (turnId) {
        try {
          const userId = meta.requestUserId || null;
          const beaconUrl = `/api/turn/${turnId}/abort${userId ? `?uid=${encodeURIComponent(userId)}` : ''}`;
          navigator.sendBeacon(beaconUrl);
        } catch {
          // Best-effort
        }
      }
    };

    // Use both events for maximum coverage:
    // - beforeunload: covers refresh/navigation on desktop browsers
    // - pagehide: covers mobile Safari and bfcache scenarios
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (selectedModelId && typeof window !== 'undefined') {
      window.localStorage.setItem('omytree.selectedModel', selectedModelId);
    }
  }, [selectedModelId]);

  // Load share info when tree changes
  useEffect(() => {
    const loadShare = async () => {
      if (!activeTreeId || !sessionUserId) {
        setShareToken(null);
        setShareUrl(null);
        return;
      }
      try {
        const res = await appApiFetch(`/api/tree/${activeTreeId}/share`, {
          headers: sessionUserId ? { 'x-omytree-user-id': sessionUserId } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setShareToken(data.share_token || null);
          setShareUrl(data.share_url || null);
        } else {
          setShareToken(null);
          setShareUrl(null);
        }
      } catch (err) {
        console.warn('share info load failed', err);
      }
    };
    loadShare();
  }, [activeTreeId, sessionUserId]);

  // Load keyframes (pins) for current tree
  useEffect(() => {
    const loadKeyframes = async () => {
      if (!activeTreeId) {
        setKeyframesMap({});
        return;
      }
      try {
        const data = await fetchKeyframes(activeTreeId, { userId: sessionUserId });
        const nextMap: Record<string, Keyframe> = {};
        for (const kf of data.keyframes || []) {
          const parsedAnnotation = typeof kf.annotation === 'string'
            ? parseKeyframeAnnotation(kf.annotation)
            : (kf.annotation ?? null);
          nextMap[kf.node_id] = {
            ...kf,
            annotation: parsedAnnotation,
          };
        }
        setKeyframesMap(nextMap);
      } catch (err) {
        console.warn('[keyframes] load failed', err);
        setKeyframesMap({});
      }
    };
    loadKeyframes();
  }, [activeTreeId, sessionUserId]);

  const resolvedShareUrl = useMemo(() => {
    if (!shareToken) return null;
    if (viewerBase) return `${viewerBase}/share/${shareToken}`;
    return shareUrl || `/share/${shareToken}`;
  }, [shareToken, viewerBase, shareUrl]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      const toCopy = resolvedShareUrl || shareUrl || '';
      if (!toCopy) return;
      await navigator.clipboard.writeText(toCopy);
      toast({ title: t(lang, 'toast_link_copied') });
    } catch (err) {
      console.error('copy failed', err);
      toast({ title: t(lang, 'toast_copy_failed'), variant: 'destructive' });
    }
  }, [resolvedShareUrl, shareUrl, toast]);

  const handleToggleShare = useCallback(async () => {
    if (!activeTreeId) return;
    try {
      if (shareToken) {
        // Revoke
        const res = await appApiFetch(`/api/tree/${activeTreeId}/share`, {
          method: 'DELETE',
          headers: sessionUserId ? { 'x-omytree-user-id': sessionUserId } : undefined,
        });
        if (!res.ok) throw new Error('revoke failed');
        setShareToken(null);
        setShareUrl(null);
        toast({ title: t(lang, 'toast_share_revoked') });
      } else {
        // Enable
        const res = await appApiFetch(`/api/tree/${activeTreeId}/share`, {
          method: 'POST',
          headers: sessionUserId ? { 'x-omytree-user-id': sessionUserId } : undefined,
        });
        if (!res.ok) throw new Error('share failed');
        const data = await res.json();
        setShareToken(data.share_token || null);
        setShareUrl(data.share_url || null);

        // Auto-copy on create
        const newUrl = data.share_url || (viewerBase ? `${viewerBase}/share/${data.share_token}` : null);
        if (newUrl) {
          await navigator.clipboard.writeText(newUrl);
          toast({ title: t(lang, 'toast_share_created_copied') });
        } else {
          toast({ title: t(lang, 'toast_share_created') });
        }
      }
    } catch (err) {
      console.error('share toggle failed', err);
      toast({ title: t(lang, 'toast_share_update_failed'), variant: 'destructive' });
    }
  }, [activeTreeId, shareToken, sessionUserId, toast, viewerBase]);

  // Toggle pin (keyframe) on a node
  const handleToggleKeyframePin = useCallback(async (nodeId: string, isPinned: boolean) => {
    if (!activeTreeId) return;

    const prevKeyframe = keyframesMap[nodeId];

    // Optimistic update
    if (isPinned) {
      setKeyframesMap((prev) => {
        const { [nodeId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setKeyframesMap((prev) => ({
        ...prev,
        [nodeId]: {
          id: 'pending',
          node_id: nodeId,
          annotation: null,
          // IMPORTANT: optimistic pinned items must be visible immediately.
          // Timeline filters out explicit false: (k.is_pinned ?? true) !== false
          is_pinned: true,
          created_at: new Date().toISOString(),
        },
      }));
    }

    try {
      if (isPinned) {
        await deleteKeyframe(activeTreeId, nodeId, { userId: sessionUserId });
      } else {
        const data = await upsertKeyframe(activeTreeId, nodeId, null, { userId: sessionUserId });
        const created = data.keyframe;
        if (created) {
          setKeyframesMap((prev) => ({
            ...prev,
            [nodeId]: created,
          }));
        }
      }
    } catch (err) {
      console.error('[keyframes] toggle failed', err);
      toast({ title: t(lang, 'toast_annotation_failed'), description: t(lang, 'toast_operation_retry'), variant: 'destructive' });

      // Rollback optimistic update
      if (isPinned) {
        if (prevKeyframe) {
          setKeyframesMap((prev) => ({ ...prev, [nodeId]: prevKeyframe }));
        }
      } else {
        setKeyframesMap((prev) => {
          const { [nodeId]: _, ...rest } = prev;
          return rest;
        });
      }
    }
  }, [activeTreeId, sessionUserId, keyframesMap, toast]);

  // Phase 4: Update keyframe annotation
  const handleUpdateKeyframeAnnotation = useCallback(async (nodeId: string, annotation: KeyframeAnnotation) => {
    if (!activeTreeId) return;

    const prevKeyframe = keyframesMap[nodeId];
    if (!prevKeyframe) return;

    // Optimistic update
    setKeyframesMap((prev) => ({
      ...prev,
      [nodeId]: {
        ...prevKeyframe,
        annotation,
      },
    }));

    try {
      const data = await upsertKeyframe(activeTreeId, nodeId, annotation, { userId: sessionUserId });
      const updated = data.keyframe;
      if (updated) {
        const parsedAnnotation = typeof updated.annotation === 'string'
          ? parseKeyframeAnnotation(updated.annotation)
          : (updated.annotation ?? null);
        setKeyframesMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...updated,
            annotation: parsedAnnotation,
          },
        }));
      }
    } catch (err) {
      console.error('[keyframes] update annotation failed', err);
      toast({ title: t(lang, 'toast_annotation_failed'), description: t(lang, 'toast_operation_retry'), variant: 'destructive' });
      // Rollback
      setKeyframesMap((prev) => ({
        ...prev,
        [nodeId]: prevKeyframe,
      }));
      // Re-throw for callers to handle (e.g., save status indicator)
      throw err;
    }
  }, [activeTreeId, sessionUserId, keyframesMap, toast]);

  // P2-3: Handle inline annotation creation from text selection
  const handleCreateInlineAnnotation = useCallback(async (payload: InlineAnnotationSelection) => {
    if (!activeTreeId) return;

    const { messageId, quote, anchor, note } = payload;
    const nowIso = new Date().toISOString();
    const prevKeyframe = keyframesMap[messageId];
    const existingAnnotations = normalizeKeyframeAnnotations(prevKeyframe?.annotation ?? null, nowIso);
    const nextAnnotation: InlineAnnotation = {
      id: createAnnotationId(),
      quote,
      anchor,
      note: note || '',
      created_at: nowIso,
      updated_at: nowIso,
    };
    const nextAnnotations = [...existingAnnotations, nextAnnotation];

    const optimisticKeyframe: Keyframe = prevKeyframe
      ? {
          ...prevKeyframe,
          annotation: nextAnnotations,
          is_pinned: true,
        }
      : {
          id: 'pending',
          node_id: messageId,
          annotation: nextAnnotations,
          is_pinned: true,
          created_at: nowIso,
        };

    setKeyframesMap((prev) => ({
      ...prev,
      [messageId]: optimisticKeyframe,
    }));

    try {
      const data = await upsertKeyframe(activeTreeId, messageId, nextAnnotations, { userId: sessionUserId });
      const created = data.keyframe;
      if (created) {
        const parsedAnnotation = typeof created.annotation === 'string'
          ? parseKeyframeAnnotation(created.annotation)
          : (created.annotation ?? null);
        setKeyframesMap((prev) => ({
          ...prev,
          [messageId]: {
            ...created,
            annotation: parsedAnnotation,
          },
        }));
      }
    } catch (err) {
      console.error('[annotations] create failed', err);
      toast({ title: t(lang, 'toast_annotation_failed'), description: t(lang, 'toast_operation_retry'), variant: 'destructive' });
      setKeyframesMap((prev) => {
        if (!prevKeyframe) {
          const { [messageId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [messageId]: prevKeyframe };
      });
    }
  }, [activeTreeId, keyframesMap, sessionUserId, toast]);

  const handleUpdateInlineAnnotation = useCallback(
    async (messageId: string, annotationId: string, note: string) => {
      if (!activeTreeId) return;
      const nowIso = new Date().toISOString();
      const prevKeyframe = keyframesMap[messageId];
      if (!prevKeyframe) return;

      const annotations = normalizeKeyframeAnnotations(prevKeyframe.annotation);
      const nextAnnotations = annotations.map((a) =>
        a.id === annotationId ? { ...a, note, updated_at: nowIso } : a
      );

      setKeyframesMap((prev) => ({
        ...prev,
        [messageId]: { ...prev[messageId], annotation: nextAnnotations },
      }));

      try {
        const data = await upsertKeyframe(activeTreeId, messageId, nextAnnotations, {
          userId: sessionUserId,
        });
        const updated = data.keyframe;
        if (updated) {
          const parsedAnnotation = typeof updated.annotation === 'string'
            ? parseKeyframeAnnotation(updated.annotation)
            : (updated.annotation ?? null);
          setKeyframesMap((prev) => ({
            ...prev,
            [messageId]: { ...updated, annotation: parsedAnnotation },
          }));
        }
      } catch (err) {
        console.error('[annotations] update failed', err);
        toast({ title: t(lang, 'toast_annotation_failed'), description: t(lang, 'toast_annotation_update_failed'), variant: 'destructive' });
        setKeyframesMap((prev) => ({ ...prev, [messageId]: prevKeyframe }));
      }
    },
    [activeTreeId, keyframesMap, sessionUserId, toast]
  );

  const handleDeleteInlineAnnotation = useCallback(
    async (messageId: string, annotationId: string) => {
      if (!activeTreeId) return;
      const prevKeyframe = keyframesMap[messageId];
      if (!prevKeyframe) return;

      const annotations = normalizeKeyframeAnnotations(prevKeyframe.annotation);
      const nextAnnotations = annotations.filter((a) => a.id !== annotationId);

      // If the last annotation is removed, the keyframe should be deleted entirely.
      if (nextAnnotations.length === 0) {
        setKeyframesMap((prev) => {
          const { [messageId]: _, ...rest } = prev;
          return rest;
        });
      } else {
        setKeyframesMap((prev) => ({
          ...prev,
          [messageId]: { ...prev[messageId], annotation: nextAnnotations },
        }));
      }

      try {
        if (nextAnnotations.length === 0) {
          await deleteKeyframe(activeTreeId, messageId, { userId: sessionUserId });
          return;
        }

        const data = await upsertKeyframe(activeTreeId, messageId, nextAnnotations, {
          userId: sessionUserId,
        });
        const updated = data.keyframe;
        if (updated) {
          const parsedAnnotation = typeof updated.annotation === 'string'
            ? parseKeyframeAnnotation(updated.annotation)
            : (updated.annotation ?? null);
          setKeyframesMap((prev) => ({
            ...prev,
            [messageId]: { ...updated, annotation: parsedAnnotation },
          }));
        }
      } catch (err) {
        console.error('[annotations] delete failed', err);
        toast({ title: t(lang, 'toast_annotation_failed'), description: t(lang, 'toast_annotation_delete_failed'), variant: 'destructive' });
        setKeyframesMap((prev) => ({ ...prev, [messageId]: prevKeyframe }));
      }
    },
    [activeTreeId, keyframesMap, sessionUserId, toast]
  );


  useEffect(() => {
    currentNodeIdRef.current = currentNodeId;
  }, [currentNodeId]);

  const stopRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current !== null) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  // T28-1: When tree changes, reset currentNodeIdRef so active_node_id can take effect
  const prevTreeIdRef = useRef<string | null>(effectiveTreeId);
  useEffect(() => {
    // T-SWITCH-FIX-2: Also trigger cleanup when switching FROM a new tree session
    // (prevTreeIdRef is null) but an active stream exists. Without this, clicking a
    // sidebar tree while a brand-new tree is streaming would skip cleanup entirely
    // because the old condition required prevTreeIdRef !== null.
    const treeChanged = effectiveTreeId !== prevTreeIdRef.current;
    const hasActiveStreamDuringSwitch = Boolean(
      activeStreamController.current || abortInProgressRef.current || activeTurnIdRef.current
    );

    // Distinguish between:
    //   A) null → newTreeId during streaming of a NEW tree (URL catching up) — NOT a switch
    //   B) null → existingTreeId while streaming for a new tree — IS a switch to another tree
    //   C) treeA → treeB — IS a switch
    // For case A: the activeStreamMeta.treeId will match the new effectiveTreeId
    const isStreamUrlCatchUp = prevTreeIdRef.current === null
      && hasActiveStreamDuringSwitch
      && effectiveTreeId != null
      && activeStreamMeta.current?.treeId === effectiveTreeId;

    const isInitialMount = prevTreeIdRef.current === null && !hasActiveStreamDuringSwitch;

    if (treeChanged && !isInitialMount && !isStreamUrlCatchUp) {
      // Tree has changed (or switching away from unsaved new tree with active stream)
      const oldTreeId = prevTreeIdRef.current;
      currentNodeIdRef.current = null;
      prevTreeIdRef.current = effectiveTreeId;

      // T-SWITCH-FIX: Capture stream metadata BEFORE clearing, for sidebar cleanup
      // and server abort notification.
      const switchStreamMeta = activeStreamMeta.current;
      const switchTurnId = activeTurnIdRef.current;
      const hadActiveStream = Boolean(activeStreamController.current);

      // Abort any in-flight stream immediately when switching trees/new tree.
      // Otherwise isSending/streaming state can leak into the new view ("oMyTree is thinking...").
      if (activeStreamController.current) {
        try {
          activeStreamController.current.abort();
        } catch {
          // ignore
        }
        activeStreamController.current = null;
      }
      activeStreamMeta.current = null;
      activeTurnIdRef.current = null;
      lastStreamTextRef.current = '';
      setIsSending(false);
      // T-SWITCH-FIX-2: Reset abort-in-progress and pending-server-abort flags.
      // If an abort was in progress when the tree switched, the flag would remain
      // true forever, preventing setIsSending(false) in the finally block of
      // handleStreamingSend — causing the loading animation to persist indefinitely.
      abortInProgressRef.current = false;
      pendingServerAbortRef.current = null;
      manualAbortRef.current = false;
      // T-SWITCH-FIX-3: Reset newTreeUrlSyncedRef so that future ?new=1 navigation
      // (clicking "New Chat") is not blocked by a stale flag from a previous streaming
      // session where the URL transitioned from ?new=1 → ?tree_id=xxx.
      newTreeUrlSyncedRef.current = false;

      // Clear streaming message and pending stream when switching trees
      setStreamingAiMessage(null);
      setPendingUserMessage(null);
      stopRecoveryTimer();

      // T-SWITCH-FIX: Clean up sidebar placeholder when switching away from a streaming tree.
      // Without this, the sidebar animation persists forever because neither
      // `omytree:tree-created` nor `omytree:tree-create-failed` is dispatched when the
      // stream is aborted by a tree switch (only by the stop button or natural completion).
      // This mirrors the cleanup logic in handleAbortStream.
      if (typeof window !== 'undefined' && hadActiveStream) {
        if (switchStreamMeta?.treeId) {
          // Tree was partially created - add to sidebar list and clear placeholder
          const sidebarTree = {
            id: switchStreamMeta.treeId,
            topic: switchStreamMeta.userText || '',
            display_title: null,
            root_title: switchStreamMeta.userText || '',
            title: switchStreamMeta.userText || '',
            created_at: switchStreamMeta.startedAt || new Date().toISOString(),
            updated_at: switchStreamMeta.startedAt || new Date().toISOString(),
          };
          window.dispatchEvent(new CustomEvent('omytree:tree-created', { detail: { tree: sidebarTree } }));
        } else {
          // No treeId yet (server hasn't responded) - just clear the placeholder
          window.dispatchEvent(new CustomEvent('omytree:tree-create-failed'));
        }

        // T-SWITCH-FIX: Notify server to abort and save partial content (fire-and-forget).
        // The client-side abort closes the SSE connection which triggers req.close on the
        // server, but explicitly calling the abort endpoint ensures the server saves
        // partial content promptly (the endpoint waits for DB commit before responding).
        if (switchTurnId) {
          const userId = switchStreamMeta?.requestUserId || null;
          const headers: HeadersInit = userId ? { 'x-omytree-user-id': userId } : {};
          appApiFetch(`/api/turn/${switchTurnId}/abort`, {
            method: 'POST',
            headers,
          }).catch(() => {
            // fire and forget - server's req.close handler is the fallback
          });
        }
      }

      // T70: Clear nodes immediately when switching trees to prevent showing stale content
      // This fixes the bug where old conversation content was shown while new tree loads
      setNodes([]);
      setTreeMetaTopic(null);

      // Clear pending stream cache if it's for the old tree (or any tree during switch)
      const raw = window.localStorage.getItem(PENDING_STREAM_KEY);
      if (raw) {
        try {
          const meta = JSON.parse(raw);
          // T-SWITCH-FIX-2: Also clear when oldTreeId is null (new tree that never got an ID)
          // or when the meta's treeId matches the old tree
          if (!oldTreeId || (meta?.treeId && meta.treeId === oldTreeId) || (meta?.treeId === null && hadActiveStream)) {
            window.localStorage.removeItem(PENDING_STREAM_KEY);
          }
        } catch (err) {
          // Invalid format, just remove
          window.localStorage.removeItem(PENDING_STREAM_KEY);
        }
      }
    } else if (prevTreeIdRef.current === null) {
      // Initial mount or stream URL catch-up (null → newTreeId during new tree streaming)
      prevTreeIdRef.current = effectiveTreeId;
    } else if (isStreamUrlCatchUp) {
      // URL is catching up to the new tree ID during streaming — just update the ref
      // so subsequent switches (newTreeId → otherTreeId) trigger cleanup properly.
      prevTreeIdRef.current = effectiveTreeId;
    }
    setActiveTreeId(effectiveTreeId);
  }, [effectiveTreeId, stopRecoveryTimer]);

  useEffect(() => {
    if (evidenceError) {
      toast({
        title: evidenceError,
        variant: 'destructive',
      });
    }
  }, [evidenceError, toast]);

  const rootNode = useMemo(() => nodes.find((n) => isRootNode(n)) || null, [nodes]);
  // Use treeMetaTopic (from API) if available, otherwise fall back to root node text
  const treeTopic = useMemo(
    () => treeMetaTopic || rootNode?.text || 'Conversation',
    [treeMetaTopic, rootNode]
  );
  const treeContextProfile = useMemo(
    () =>
      ((rootNode as any)?.context_profile ||
        (qaTree as any)?.context_profile ||
        lastContextProfile ||
        null) as any,
    [rootNode, qaTree, lastContextProfile]
  );
  const treeMemoryScope = useMemo(
    () =>
      ((rootNode as any)?.memory_scope ||
        (qaTree as any)?.memory_scope ||
        lastMemoryScope ||
        null) as any,
    [rootNode, qaTree, lastMemoryScope]
  );
  const pathNodes = useMemo(() => getPath(nodes, currentNodeId), [nodes, currentNodeId]);

  const knowledgeByNodeId = useMemo(() => {
    const map = new Map<string, any>();
    for (const node of nodes) {
      const knowledge = (node as any)?.knowledge;
      if (knowledge && typeof knowledge === 'object') {
        map.set(node.id, knowledge);
      }
    }
    return map;
  }, [nodes]);

  useEffect(() => {
    const profileFromData =
      (rootNode as any)?.context_profile || (qaTree as any)?.context_profile || null;
    const scopeFromData =
      (rootNode as any)?.memory_scope || (qaTree as any)?.memory_scope || null;
    if (profileFromData) {
      setLastContextProfile(profileFromData);
    }
    if (scopeFromData) {
      setLastMemoryScope(scopeFromData);
    }
  }, [rootNode, qaTree]);

  const currentNode = useMemo(() => nodes.find((n) => n.id === currentNodeId) || null, [nodes, currentNodeId]);
  const currentIndex = useMemo(
    () => (currentNode && typeof currentNode.level === 'number' ? currentNode.level : -1),
    [currentNode]
  );
  const pathMessages: ChatMessage[] = useMemo(
    () =>
      pathNodes.map((node) => {
        const role: ChatMessage['role'] =
          node.role === 'assistant' || node.role === 'ai'
            ? 'ai'
            : isRootNode(node)
              ? 'root'
              : node.role === 'system'
                ? 'system'
                : 'user';
        const isByokFlag = typeof node.is_byok === 'boolean' ? node.is_byok : node.is_byok ?? null;
        const rawKnowledge = knowledgeByNodeId.get(node.id);
        const parentKnowledge =
          role === 'ai' && typeof node.parent_id === 'string'
            ? knowledgeByNodeId.get(node.parent_id)
            : null;
        const messageKnowledge =
          role === 'ai'
            ? (parentKnowledge && typeof parentKnowledge === 'object' ? parentKnowledge : undefined)
            : (rawKnowledge && typeof rawKnowledge === 'object' ? rawKnowledge : undefined);

        return {
          id: node.id,
          role,
          text: node.text || '',
          reasoning: typeof node.reasoning_content === 'string' ? node.reasoning_content : undefined,
          reasoningVisible: Boolean(reasoningVisibleMap[node.id]),
          groundingMetadata: groundingMetadataMap[node.id],
          groundingVisible: Boolean(groundingVisibleMap[node.id]),
          level: typeof node.level === 'number' ? node.level : null,
          isCurrent: node.id === currentNodeId,
          isRoot: isRootNode(node),
          provider: node.provider ?? null,
          model: node.model ?? null,
          isByok: isByokFlag,
          sourceLabel: role === 'ai' ? buildSourceLabel(node.provider, node.model, isByokFlag) : null,
          attachments: node.attachments, // T85-fix: Include attachments
          knowledge: messageKnowledge,
          citations: Array.isArray((node as any).citations) ? ((node as any).citations as Citation[]) : undefined,
        };
      }),
    [pathNodes, knowledgeByNodeId, currentNodeId, buildSourceLabel, reasoningVisibleMap, groundingMetadataMap, groundingVisibleMap]
  );
  const allMessages: ChatMessage[] = useMemo(() => {
    const getTime = (n: Node) => {
      const t = n.created_at ? new Date(n.created_at).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    const sorted = [...nodes].sort((a, b) => {
      const ta = getTime(a);
      const tb = getTime(b);
      if (ta === tb) {
        return (a.level || 0) - (b.level || 0);
      }
      return ta - tb;
    });
    return sorted.map((node) => {
      const role: ChatMessage['role'] =
        node.role === 'assistant' || node.role === 'ai'
          ? 'ai'
          : isRootNode(node)
            ? 'root'
            : node.role === 'system'
              ? 'system'
              : 'user';
      const isByokFlag = typeof node.is_byok === 'boolean' ? node.is_byok : node.is_byok ?? null;
      const rawKnowledge = knowledgeByNodeId.get(node.id);
      const parentKnowledge =
        role === 'ai' && typeof node.parent_id === 'string'
          ? knowledgeByNodeId.get(node.parent_id)
          : null;
      const messageKnowledge =
        role === 'ai'
          ? (parentKnowledge && typeof parentKnowledge === 'object' ? parentKnowledge : undefined)
          : (rawKnowledge && typeof rawKnowledge === 'object' ? rawKnowledge : undefined);
      return {
        id: node.id,
        role,
        text: node.text || '',
        reasoning: typeof node.reasoning_content === 'string' ? node.reasoning_content : undefined,
        reasoningVisible: Boolean(reasoningVisibleMap[node.id]),
        groundingMetadata: groundingMetadataMap[node.id],
        groundingVisible: Boolean(groundingVisibleMap[node.id]),
        level: typeof node.level === 'number' ? node.level : null,
        isCurrent: node.id === currentNodeId,
        isRoot: isRootNode(node),
        provider: node.provider ?? null,
        model: node.model ?? null,
        isByok: isByokFlag,
        sourceLabel: role === 'ai' ? buildSourceLabel(node.provider, node.model, isByokFlag) : null,
        attachments: node.attachments, // T85-fix: Include attachments
        knowledge: messageKnowledge,
        citations: Array.isArray((node as any).citations) ? ((node as any).citations as Citation[]) : undefined,
      };
    });
  }, [nodes, knowledgeByNodeId, currentNodeId, buildSourceLabel, reasoningVisibleMap, groundingMetadataMap, groundingVisibleMap]);

  // Final chat messages: include pending user message if any
  const chatMessages: ChatMessage[] = useMemo(() => {
    const base = viewMode === 'path' ? pathMessages : allMessages;
    const withUser = pendingUserMessage ? [...base, pendingUserMessage] : base;

    if (!streamingAiMessage) return withUser;

    // Avoid brief duplicates when the persisted ai_node arrives while the placeholder
    // streaming message is still present.
    // Check both id match and text match to ensure smooth transition.
    const streamingId = streamingAiMessage.id;
    const streamingText = (streamingAiMessage.text || '').trimEnd();
    for (let i = withUser.length - 1; i >= 0; i--) {
      const m = withUser[i];
      if (m.role !== 'ai') continue;
      // If ids match, the persisted node has the same id as the placeholder (done event already synced it)
      if (m.id === streamingId) {
        const next = [...withUser];
        next[i] = { ...m, ...streamingAiMessage, id: m.id };
        return next;
      }
      const existingText = (m.text || '').trimEnd();
      if (existingText && streamingText && existingText === streamingText) {
        return withUser;
      }
      // Only compare the latest AI message.
      break;
    }

    return [...withUser, streamingAiMessage];
  }, [viewMode, pathMessages, allMessages, pendingUserMessage, streamingAiMessage]);

  useEffect(() => {
    if (!pendingUserMessage) return;
    const meta = activeStreamMeta.current;
    if (!meta) return;
    const startedTs = meta?.startedAt ? Date.parse(meta.startedAt) : 0;
    const isRecent = (node: Node) =>
      !startedTs || Date.parse(node.created_at || '') >= startedTs - 300000;
    let userNode: Node | null = null;
    if (meta.parentNodeId && meta.parentNodeId !== meta.requestParentId) {
      userNode =
        nodes.find((n) => n.id === meta.parentNodeId && n.role === 'user' && isRecent(n)) ||
        null;
    }
    if (!userNode && meta.requestParentId) {
      userNode =
        nodes.find((n) => n.role === 'user' && n.parent_id === meta.requestParentId && isRecent(n)) ||
        null;
    }
    if (!userNode && !meta.requestParentId && !meta.parentNodeId) {
      userNode =
        nodes.find((n) => n.role === 'user' && !n.parent_id && isRecent(n)) || null;
    }
    if (userNode) {
      setPendingUserMessage(null);
    }
  }, [nodes, pendingUserMessage]);

  useEffect(() => {
    const completedAiNodeId = lastCompletedAiNodeIdRef.current;
    if (!completedAiNodeId) return;
    const exists = nodes.some((n) => n.id === completedAiNodeId);
    if (!exists) return;
    // If we still have buffered text to reveal, keep the streaming override alive.
    if (streamingAiMessage?.isStreaming) {
      return;
    }
    // Persisted node is now in `nodes`, safe to remove the placeholder.
    lastCompletedAiNodeIdRef.current = null;
    setStreamingAiMessage(null);
  }, [nodes]);

  useEffect(() => {
    if (!streamingAiMessage) return;
    if (!streamingAiMessage.provider && !streamingAiMessage.model) return;
    const nextLabel = buildSourceLabel(
      streamingAiMessage.provider ?? null,
      streamingAiMessage.model ?? null,
      streamingAiMessage.isByok ?? null
    );
    if (nextLabel === streamingAiMessage.sourceLabel) return;
    setStreamingAiMessage((prev) => (prev ? { ...prev, sourceLabel: nextLabel } : prev));
  }, [streamingAiMessage, buildSourceLabel]);

  // Simplified node label for header: "#3 · User" or "#3 · AI"
  const nodeLabel = useMemo(() => {
    if (!currentNode) return undefined;
    const levelLabel =
      typeof currentNode.level === 'number' ? `#${currentNode.level}` : '';
    const roleLabel = isRootNode(currentNode)
      ? 'Root'
      : currentNode.role === 'assistant' || currentNode.role === 'ai'
        ? 'AI'
        : 'User';
    return levelLabel ? `${levelLabel} · ${roleLabel}` : roleLabel;
  }, [currentNode]);
  const currentNodeDisplay = useMemo(() => {
    if (!currentNode) return nodeLabel || null;
    const snippet = currentNode.text
      ? currentNode.text.length > 48
        ? `${currentNode.text.slice(0, 47)}…`
        : currentNode.text
      : '';
    if (nodeLabel && snippet) {
      return `${nodeLabel} · ${snippet}`;
    }
    return snippet || nodeLabel || null;
  }, [currentNode, nodeLabel]);

  const activeEvidence = useMemo(
    () => evidence.find((ev) => ev.id === activeEvidenceId) || null,
    [evidence, activeEvidenceId]
  );
  const activeEvidenceNodes = activeEvidence?.id ? evidenceNodesMap[activeEvidence.id] || [] : [];
  const activeEvidenceNodesLoading = activeEvidence?.id
    ? evidenceNodesLoading[activeEvidence.id]
    : false;

  useEffect(() => {
    if (!urlEvidenceId || !activeTreeId) return;
    if (urlEvidenceId !== activeEvidenceId) {
      setActiveEvidenceId(urlEvidenceId);
    }
  }, [urlEvidenceId, activeTreeId, activeEvidenceId]);

  useEffect(() => {
    if (activeEvidence?.id) {
      loadEvidenceNodes(activeEvidence.id);
    }
  }, [activeEvidence?.id, loadEvidenceNodes]);

  // Update URL when currentNodeId changes
  const updateURL = useCallback(
    (treeId: string | null, nodeId: string | null) => {
      if (!treeId) return;
      const params = new URLSearchParams();
      params.set('tree_id', treeId);
      if (nodeId) {
        params.set('node', nodeId);
      }

      const nextUrl = `${pathname}?${params.toString()}`;
      
      // T-fix-refresh: Only force router sync if we are transitioning away from 'new' mode
      // or if searchParams hasn't been updated yet (stale after initial load).
      // Once we have a tree_id in the actual URL **and** in searchParams, we can stay in
      // history-only mode for subsequent node-id updates.
      const isCurrentlyInNewMode = typeof window !== 'undefined' && 
        (window.location.search.includes('new=1') || window.location.search.includes('new_tree=1'));

      // T-FIX-STUCK-SESSION: Also detect the case where we have NO tree_id in searchParams yet.
      // This happens on the first updateURL call when the user entered via forceNewTreeSession
      // (URL was /app with no params). If we use history.replaceState here, useSearchParams()
      // will never see the tree_id, keeping effectiveTreeId null and isNewTreeSession stuck.
      const searchParamsHaveTreeId = typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('tree_id') &&
        searchParams.get('tree_id') != null;

      if (!isCurrentlyInNewMode && searchParamsHaveTreeId && typeof window !== 'undefined' && window.history?.replaceState) {
        try {
          window.history.replaceState(window.history.state, '', nextUrl);
          return;
        } catch {
          // Fallback
        }
      }

      router.replace(nextUrl, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const reloadTree = useCallback(
    async ({
      nextNodeId,
      signal,
      treeIdOverride,
    }: { nextNodeId?: string | null; signal?: AbortSignal; treeIdOverride?: string | null } = {}) => {
      const targetTreeId = treeIdOverride ?? activeTreeId;
      if (!targetTreeId || sessionStatus === 'loading') {
        return null;
      }

      const headers: HeadersInit = sessionUserId ? { 'x-omytree-user-id': sessionUserId } : {};
      setIsTreeLoading(true);

      try {
        const res = await appApiFetch(`/api/tree/${targetTreeId}/export`, {
          headers,
          signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch tree: ${res.status}`);
        }
        const data = await res.json();
        if (signal?.aborted) {
          return null;
        }
        const fetchedNodes: Node[] = data.nodes || [];
        const normalizedNodes = normalizeNodesForVisuals(fetchedNodes);
        setNodes(normalizedNodes);
        // Save tree topic from API response
        if (data.tree?.topic) {
          setTreeMetaTopic(data.tree.topic);
        }

        // ============================================================
        // T28-0 Current Path Fix: 优先使用 API 返回的最新活跃节点
        // 
        // 规则（按优先级）：
        //   1. 如果调用方明确指定了 nextNodeId，使用它
        //   2. 否则如果当前有 currentNodeIdRef（用户之前选过），使用它
        //   3. 否则使用 API 返回的 active_node_id（最新活跃叶子节点）
        //   4. 兜底：使用 root 节点
        // ============================================================
        let desiredNodeId = nextNodeId ?? currentNodeIdRef.current;
        if (!desiredNodeId && normalizedNodes.length > 0) {
          // 优先使用 API 返回的最新活跃节点（T28-0）
          desiredNodeId = data.active_node_id ??
            (normalizedNodes.find((n) => isRootNode(n)) || normalizedNodes[0])?.id ?? null;
        }

        if (desiredNodeId) {
          const match = normalizedNodes.find((n) => n.id === desiredNodeId);
          if (match) {
            setCurrentNodeId(match.id);
            updateURL(targetTreeId, match.id);
          } else {
            const root = normalizedNodes.find((n) => isRootNode(n));
            const fallbackId = root?.id ?? null;
            setCurrentNodeId(fallbackId);
            if (fallbackId) {
              updateURL(targetTreeId, fallbackId);
            }
          }
        }
        return normalizedNodes;
      } catch (err) {
        if (signal?.aborted) {
          return null;
        }
        console.error('[tree] Failed to load tree:', err);
        toast({ title: t(lang, 'toast_loading_failed'), variant: 'destructive' });
        return null;
      } finally {
        setIsTreeLoading(false);
      }
    },
    // T70: Removed activeTreeId from dependencies to prevent race condition
    // when switching trees. treeIdOverride parameter should always be passed explicitly.
    [sessionStatus, sessionUserId, updateURL]
  );

  // NOTE: Recovery uses setTimeout retries. If we close over stale values (e.g. sessionStatus
  // == 'loading' on first render), retries can keep using old closures and loop for 60 attempts.
  // Keep a ref to the latest implementation so timers always call the current logic.
  const tryRecoverStreamRef = useRef<
    ((meta: StreamMeta, attempt?: number) => Promise<void>) | null
  >(null);

  const clearPendingStreamMeta = useCallback(() => {
    activeStreamMeta.current = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PENDING_STREAM_KEY);
    }
  }, []);

  const persistPendingStreamMeta = useCallback((meta: StreamMeta) => {
    activeStreamMeta.current = meta;
    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(meta);
        window.localStorage.setItem(PENDING_STREAM_KEY, serialized);
      } catch (err) {
        console.error('[TreeWorkspace] Failed to persist stream meta:', err);
      }
    }
  }, []);

  // T20-6: Detect new=1 parameter change and reset state for new tree session
  // Important: do NOT reset into new-tree mode based on prop-only signals during client runtime.
  // A transient prop flip (e.g. brief URL/searchParams inconsistency) can otherwise wipe the
  // current tree state and cause the next message to be posted as a brand-new tree.
  useEffect(() => {
    const shouldBeNewSession = urlNewSession;

    if (shouldBeNewSession && !isNewTreeSession) {
      // T-FIX-STUCK-SESSION: If we've already synced a new tree's URL (start event fired
      // updateURL), don't re-enter new-tree mode based on stale searchParams.
      // router.replace is async — searchParams may still show ?new=1 while the URL
      // has already transitioned to ?tree_id=xxx. Re-entering would wipe all state.
      if (newTreeUrlSyncedRef.current) {
        return;
      }
      // Entering new tree mode - reset all state
      newTreeUrlSyncedRef.current = false;
      setIsNewTreeSession(true);
      setActiveTreeId(null);
      setCurrentNodeId(null);
      setNodes([]);
      setLastContextProfile(null);
      setLastMemoryScope(null);
      setInputText('');
      setViewMode('path');
      setShareToken(null);
      setShareUrl(null);
      setTreeMetaTopic(null);
      // Clear any pending stream/recovery data from previous tree
      pendingAttachmentsRef.current = [];
      setStreamingAiMessage(null);
      setPendingUserMessage(null);
      activeStreamMeta.current = null;
      activeTurnIdRef.current = null;
      stopRecoveryTimer();
      clearPendingStreamMeta();
    } else if (!shouldBeNewSession && effectiveTreeId) {
      // Exiting new tree mode (has a tree_id now)
      setIsNewTreeSession(false);
    }
  }, [urlNewSession, effectiveTreeId, isNewTreeSession, stopRecoveryTimer, clearPendingStreamMeta]);

  const scheduleRecoverRetry = useCallback((meta: StreamMeta, attempt: number) => {
    recoveryTimerRef.current = window.setTimeout(() => {
      // Always call the latest function implementation
      tryRecoverStreamRef.current?.(meta, attempt);
    }, 1000);
  }, []);

  const tryRecoverStream = useCallback(async (meta: StreamMeta, attempt = 0) => {
    const currentTreeId = effectiveTreeId || activeTreeId || null;
    if (currentTreeId && meta.treeId && currentTreeId !== meta.treeId) {
      stopRecoveryTimer();
      return;
    }
    if (!activeStreamMeta.current || activeStreamMeta.current.treeId !== meta.treeId) {
      stopRecoveryTimer();
      return;
    }
    if (meta.status === 'aborted' && !meta.turnId) {
      stopRecoveryTimer();
      return;
    }

    // Don't try to recover while session is loading
    if (sessionStatus === 'loading') {
      if (attempt >= 60) {
        if (meta.status !== 'aborted') {
          clearPendingStreamMeta();
        }
        stopRecoveryTimer();
        return;
      }
      scheduleRecoverRetry(meta, attempt + 1);
      return;
    }

    const nodes = await reloadTree({ treeIdOverride: meta.treeId });

    if (!nodes || nodes.length === 0) {
      // No nodes yet, will retry
    } else {
      const { aiNode } = resolveStreamNodes(nodes, meta);
      if (aiNode) {
        setStreamingAiMessage(null);
        setPendingUserMessage(null);
        setCurrentNodeId(aiNode.id);
        updateURL(meta.treeId, aiNode.id);
        clearPendingStreamMeta();
        stopRecoveryTimer();
        activeTurnIdRef.current = null;
        return;
      }
    }
    // Max recovery attempts: 60 (roughly 60 seconds with 1s interval)
    if (attempt >= 60) {
      if (meta.status !== 'aborted') {
        clearPendingStreamMeta();
      }
      stopRecoveryTimer();
      return;
    }
    scheduleRecoverRetry(meta, attempt + 1);
  }, [reloadTree, clearPendingStreamMeta, stopRecoveryTimer, setCurrentNodeId, scheduleRecoverRetry, sessionStatus, updateURL, effectiveTreeId, activeTreeId]);

  useEffect(() => {
    tryRecoverStreamRef.current = tryRecoverStream;
  }, [tryRecoverStream]);

  // Track the last loaded tree ID to avoid unnecessary reloads when only node changes
  const lastLoadedTreeIdRef = useRef<string | null>(null);
  // Track nodes via ref to avoid dependency cycle
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Load tree data - only reload when tree_id actually changes
  // When only node_id changes (same tree), just update currentNodeId without reloading
  useEffect(() => {
    const targetTreeId = effectiveTreeId;
    
    // T70: Skip reload if no tree_id (new tree session mode)
    // This prevents reloadTree from using stale activeTreeId and redirecting back
    if (!targetTreeId) {
      lastLoadedTreeIdRef.current = null;
      return;
    }
    
    // Skip reload if we're in the middle of sending a message
    // (URL updates during streaming shouldn't trigger tree reload)
    if (isSending) {
      return;
    }

    // If tree_id hasn't changed and we already have nodes, just update currentNodeId
    if (targetTreeId === lastLoadedTreeIdRef.current && nodesRef.current.length > 0) {
      if (effectiveNodeId && nodesRef.current.some(n => n.id === effectiveNodeId)) {
        // T-FIX-DISAPPEAR: Don't override currentNodeId with a stale URL effectiveNodeId.
        // After streaming done handler sets currentNodeId to the latest AI node,
        // router.replace is async so useSearchParams() still has the OLD node_id.
        // If we blindly set currentNodeId here, it reverts to the old node and
        // the second Q&A pair disappears from the path.
        if (currentNodeIdRef.current && currentNodeIdRef.current !== effectiveNodeId
            && nodesRef.current.some(n => n.id === currentNodeIdRef.current)) {
          // currentNodeId is already pointing to a valid node (set by done handler)
          // and differs from the stale URL node — skip override.
          return;
        }
        setCurrentNodeId(effectiveNodeId);
      }
      return;
    }

    // Tree changed or first load - do full reload
    const controller = new AbortController();
    lastLoadedTreeIdRef.current = targetTreeId;
    // Pass treeIdOverride explicitly since activeTreeId state may not have updated yet
    reloadTree({ nextNodeId: effectiveNodeId ?? null, signal: controller.signal, treeIdOverride: targetTreeId });

    return () => {
      controller.abort();
    };
  }, [reloadTree, effectiveTreeId, effectiveNodeId, isSending]);

  useEffect(() => {
    return () => {
      stopRecoveryTimer();
    };
  }, [stopRecoveryTimer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasCheckedRecoveryRef.current) return;
    hasCheckedRecoveryRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const isNewSession = urlParams.get('new') === '1' || urlParams.get('new_tree') === '1';
    if (isNewSession) {
      window.localStorage.removeItem(PENDING_STREAM_KEY);
      return;
    }

    const raw = window.localStorage.getItem(PENDING_STREAM_KEY);

    if (!raw) {
      // T33-3 REMOVED: The auto-recovery check based on URL params was causing
      // a 60-second recovery loop on every normal page navigation. Recovery should
      // ONLY be triggered when there's actual pending stream data in localStorage.
      return;
    }

    try {
      const meta = JSON.parse(raw);
      if (meta && typeof meta === 'object' && ('treeId' in meta)) {
        const startedAt = meta.startedAt ? Date.parse(meta.startedAt) : 0;
        const isStale = startedAt > 0 ? (Date.now() - startedAt > 10 * 60 * 1000) : false;
        if (!meta.treeId || isStale) {
          window.localStorage.removeItem(PENDING_STREAM_KEY);
          return;
        }

        // T33-4: Check if cached stream belongs to current tree
        const currentTreeId = urlParams.get('tree_id') || effectiveTreeId;

        if (meta.treeId !== currentTreeId) {
          window.localStorage.removeItem(PENDING_STREAM_KEY);
          return;
        }

        persistPendingStreamMeta(meta);
        if (meta.turnId) {
          activeTurnIdRef.current = meta.turnId;
        }
        // Only restore streaming message for ACTIVE streams (not aborted)
        // Aborted streams may not be persisted yet; keep local copy and try recovery.
        if (meta.status === 'aborted') {
          const userText = typeof meta.userText === 'string' ? meta.userText : '';
          const aiText = typeof meta.text === 'string' ? meta.text : '';
          const hasUserText = userText.length > 0;
          if (hasUserText) {
            setPendingUserMessage({
              id: `aborted-user-${meta.turnId || meta.parentNodeId || Date.now()}`,
              role: 'user',
              text: userText,
              level: null,
              isCurrent: false,
              isRoot: false,
            });
          }
          if (hasUserText || aiText.length > 0) {
            setStreamingAiMessage({
              id: `aborted-ai-${meta.turnId || meta.parentNodeId || Date.now()}`,
              role: 'ai',
              text: aiText,
              level: null,
              isCurrent: true, // Show as current for consistency
              isRoot: false,
              isStreaming: false,
              provider: meta.provider ?? null,
              model: meta.model ?? null,
              isByok: typeof meta.isByok === 'boolean' ? meta.isByok : meta.isByok ?? null,
              sourceLabel: meta.provider
                ? buildSourceLabel(meta.provider, meta.model ?? null, meta.isByok ?? null)
                : null,
            });
            lastStreamTextRef.current = aiText;
          }
          if (meta.turnId) {
            tryRecoverStream(meta);
          } else {
            stopRecoveryTimer();
          }
          return;
        }
        if (typeof meta.text === 'string' && meta.text.length > 0) {
          setStreamingAiMessage({
            id: `recover-${meta.turnId || meta.parentNodeId || Date.now()}`,
            role: 'ai',
            text: meta.text,
            level: null,
            isCurrent: true, // Show as current for consistency
            isRoot: false,
            isStreaming: true,
            provider: meta.provider ?? null,
            model: meta.model ?? null,
            isByok: typeof meta.isByok === 'boolean' ? meta.isByok : meta.isByok ?? null,
            sourceLabel: meta.provider
              ? buildSourceLabel(meta.provider, meta.model ?? null, meta.isByok ?? null)
              : null,
          });
          lastStreamTextRef.current = meta.text;
        }
        tryRecoverStream(meta);
      } else {
        window.localStorage.removeItem(PENDING_STREAM_KEY);
      }
    } catch (err) {
      console.warn('[TreeWorkspace] Failed to parse pending stream meta:', err);
      window.localStorage.removeItem(PENDING_STREAM_KEY);
    }
  }, []);

  // Prefill input if prefill param exists
  useEffect(() => {
    if (prefillParam) {
      setInputText(prefillParam);
    }
  }, [prefillParam]);

  // Restore input draft from localStorage on mount (only if no prefill)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prefillParam) return; // Don't restore if there's a prefill param

    try {
      const savedDraft = window.localStorage.getItem(INPUT_DRAFT_KEY);
      if (savedDraft) {
        setInputText(savedDraft);
      }
    } catch (err) {
      console.error('[Draft] Failed to restore input draft:', err);
    }
  }, [prefillParam]);

  // Save input draft to localStorage on change (debounced)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = setTimeout(() => {
      try {
        if (inputText.trim()) {
          window.localStorage.setItem(INPUT_DRAFT_KEY, inputText);
        } else {
          window.localStorage.removeItem(INPUT_DRAFT_KEY);
        }
      } catch (err) {
        console.error('[Draft] Failed to save input draft:', err);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [inputText]);

  const handleNodeClick = useCallback(
    (qaNodeId: string) => {
      // Convert QANode ID to the AI node ID (or user node ID if no AI node)
      // for URL and currentNodeId state
      const qaNode = qaTree?.nodes.find(n => n.id === qaNodeId);
      const nodeId = qaNode?.ai_node_id || qaNode?.user_node_id || qaNodeId;
      setCurrentNodeId(nodeId);
      updateURL(activeTreeId, nodeId);
      setViewMode('path');

      // T-NODE-SWITCH: Align the selected node's Q&A turn to the top of the chat viewport.
      // Use a microtask/tick so the ChatPane can render the new path messages first.
      setTimeout(() => {
        chatPaneRef.current?.scrollToTurnTopForMessage(nodeId, 'auto');
      }, 0);
    },
    [activeTreeId, updateURL, qaTree?.nodes]
  );

  // T56-1: Handle source chip click (navigate to node/turn)
  // T56-2: Enhanced with unified navigation behavior:
  // 1. Tree view: locate and highlight node
  // 2. Chat area: scroll to corresponding turn
  // 3. Context drawer: open with node preview + actions
  // T59-1: Added evidence support and fallback toasts for navigation failures
  const handleSourceClick = useCallback(async (source: string) => {
    // T59-1: Evidence chip support - open EvidenceDrawer directly
    if (source.startsWith('evidence:')) {
      const evidenceId = source.slice(9);
      setActiveEvidenceId(evidenceId);
      return;
    }

    const navigateToRawNodeId = (rawNodeId: string) => {
      const qaNode = qaTree?.nodes?.find((n) =>
        n.user_node_id === rawNodeId || n.ai_node_id === rawNodeId
      );
      if (!qaNode) {
        toast({
          title: t(lang, 'toast_nav_cannot_locate'),
          description: `${t(lang, 'toast_nav_cannot_locate_desc')} (${rawNodeId.slice(0, 8)}...)`,
          variant: 'default',
          duration: 4000,
        });
        setContextDrawerSource(source);
        setContextDrawerOpen(true);
        return;
      }

      handleNodeClick(qaNode.id);

      const targetMessageId = qaNode.user_node_id === rawNodeId
        ? qaNode.user_node_id
        : (qaNode.ai_node_id || qaNode.user_node_id);

      setTimeout(() => {
        const scrolled = chatPaneRef.current?.scrollToMessage(targetMessageId);
        if (!scrolled) {
          toast({
            title: t(lang, 'toast_nav_notice'),
            description: t(lang, 'toast_nav_notice_desc'),
            duration: 3000,
          });
        }
      }, 100);

      setContextDrawerSource(source);
      setContextDrawerOpen(true);
    };

    if (source.startsWith('node:')) {
      const nodeId = source.slice('node:'.length);
      navigateToRawNodeId(nodeId);
    } else if (source.startsWith('turn:')) {
      const turnId = source.slice('turn:'.length);
      try {
        const res = await getTurn(turnId, { userId: sessionUserId });
        const nodeId = res?.turn?.node_id;
        if (!nodeId) throw new Error('turn missing node_id');
        navigateToRawNodeId(nodeId);
      } catch (err) {
        console.warn('[turn] open by source failed:', err);
        toast({
          title: t(lang, 'toast_nav_failed'),
          description: t(lang, 'toast_nav_failed_desc'),
          variant: 'default',
          duration: 3500,
        });
        setContextDrawerSource(source);
        setContextDrawerOpen(true);
      }
    } else if (source.startsWith('keyframe:')) {
      const keyframeId = source.slice('keyframe:'.length);
      const nodeId = keyframeIdToNodeId.get(keyframeId) || null;
      if (!nodeId) {
        toast({
          title: t(lang, 'toast_nav_cannot_locate_keyframe'),
          description: `${t(lang, 'toast_nav_cannot_locate_keyframe_desc')} (${keyframeId.slice(0, 8)}...)`,
          duration: 4000,
        });
        setContextDrawerSource(source);
        setContextDrawerOpen(true);
        return;
      }
      navigateToRawNodeId(nodeId);
    } else if (source.startsWith('tree:')) {
      // Tree-level source - just show info in drawer
      setContextDrawerSource(source);
      setContextDrawerOpen(true);
    } else if (source.startsWith('outcome:')) {
      const outcomeId = source.slice('outcome:'.length);
      if (!activeTreeId) {
        toast({
          title: t(lang, 'toast_nav_cannot_open_outcome'),
          description: t(lang, 'toast_nav_cannot_open_outcome_desc'),
          duration: 3000,
        });
        return;
      }

      try {
        const detail = await getOutcome(activeTreeId, outcomeId);
        if (detail?.ok && detail?.outcome) {
          handleSelectOutcome(outcomeId, detail as any);
          setContextDrawerOpen(false);
          setContextDrawerSource(null);
          return;
        }
        throw new Error('invalid outcome detail response');
      } catch (err) {
        console.warn('[outcome] open by source failed:', err);
        toast({
          title: t(lang, 'toast_nav_open_outcome_failed'),
          description: t(lang, 'toast_nav_open_outcome_failed_desc'),
          variant: 'default',
          duration: 3500,
        });
        setContextDrawerSource(source);
        setContextDrawerOpen(true);
      }
    } else if (source.startsWith('resource:')) {
      // T59-1: Other source types - open context drawer with info
      setContextDrawerSource(source);
      setContextDrawerOpen(true);
    } else {
      // T59-1: Unknown source type - show helpful toast
      toast({
        title: t(lang, 'toast_nav_unknown_source'),
        description: source.slice(0, 30) + (source.length > 30 ? '...' : ''),
        duration: 3000,
      });
    }
  }, [qaTree?.nodes, handleNodeClick, toast, lang, activeTreeId, handleSelectOutcome, sessionUserId, keyframeIdToNodeId]);

  // T56-2: Context drawer actions
  const handleContextDrawerContinue = useCallback((qaNodeId: string) => {
    // Navigate to this node and continue conversation (same branch)
    handleNodeClick(qaNodeId);
    setContextDrawerOpen(false);
    setContextDrawerSource(null);
    // Focus the input
    setTimeout(() => {
      const input = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
      input?.focus();
    }, 100);
  }, [handleNodeClick]);

  const handleContextDrawerBranch = useCallback((qaNodeId: string) => {
    // Find the node and navigate to its parent to create a new branch
    const qaNode = qaTree?.nodes.find(n => n.id === qaNodeId);
    if (qaNode?.parent_id) {
      // Find parent QA node
      const parentQaNode = qaTree?.nodes.find(n =>
        n.user_node_id === qaNode.parent_id || n.ai_node_id === qaNode.parent_id
      );
      if (parentQaNode) {
        handleNodeClick(parentQaNode.id);
      }
    }
    setContextDrawerOpen(false);
    setContextDrawerSource(null);
    // Focus the input for new branch
    setTimeout(() => {
      const input = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
      input?.focus();
    }, 100);
  }, [qaTree?.nodes, handleNodeClick]);

  const contextDrawerNodeId = useMemo(() => {
    if (!contextDrawerSource) return null;
    if (contextDrawerSource.startsWith('node:')) return contextDrawerSource.slice(5);
    if (contextDrawerSource.startsWith('turn:')) return contextDrawerSource.slice(5);
    if (contextDrawerSource.startsWith('keyframe:')) {
      const keyframeId = contextDrawerSource.slice('keyframe:'.length);
      return keyframeIdToNodeId.get(keyframeId) || null;
    }
    return null;
  }, [contextDrawerSource, keyframeIdToNodeId]);


  // T56-2: Get the QA node from context drawer source
  const contextDrawerNode = useMemo(() => {
    if (!contextDrawerNodeId || !qaTree?.nodes) return null;
    const nodeId = contextDrawerNodeId;
    return qaTree.nodes.find(n =>
      n.user_node_id === nodeId || n.ai_node_id === nodeId
    ) || null;
  }, [contextDrawerNodeId, qaTree?.nodes]);

  // Load evidence for the node shown in the context drawer
  useEffect(() => {
    if (contextDrawerOpen && contextDrawerNodeId) {
      loadNodeEvidence(contextDrawerNodeId);
    }
  }, [contextDrawerOpen, contextDrawerNodeId, loadNodeEvidence]);
  const drawerEvidenceList = contextDrawerNodeId ? nodeEvidenceMap[contextDrawerNodeId] || [] : [];
  const drawerEvidenceLoading = contextDrawerNodeId ? nodeEvidenceLoading[contextDrawerNodeId] : false;

  const handleAttachEvidenceToNode = useCallback(
    async (evidenceId: string, nodeIdOverride?: string | null) => {
      const targetNodeId = nodeIdOverride || contextDrawerNodeId || currentNodeId;
      if (!targetNodeId) {
        toast({
          title: t(lang, 'toast_evidence_select_node'),
          variant: 'destructive',
        });
        return;
      }
      try {
        const nodeMeta = nodes.find((n) => n.id === targetNodeId);
        const result = await attachEvidenceToNode(targetNodeId, evidenceId, {
          nodeMeta: nodeMeta
            ? {
              id: nodeMeta.id,
              text: nodeMeta.text,
              role: nodeMeta.role,
              created_at: nodeMeta.created_at,
            }
            : undefined,
        });
        if (result) {
          await loadNodeEvidence(targetNodeId, { force: true });
          if (result.created) {
            await loadEvidenceNodes(evidenceId, { force: true });
          }
          const wasCreated = result.created !== false;
          toast({
            title: wasCreated
              ? t(lang, 'evidence_attach') || 'Evidence attached'
              : t(lang, 'evidence_attached_count')?.replace('{count}', '1') || 'Already attached',
          });
        }
      } catch (err) {
        console.error('[evidence] attach failed', err);
        toast({
          title: t(lang, 'toast_evidence_attach_failed'),
          variant: 'destructive',
        });
      }
    },
    [
      attachEvidenceToNode,
      contextDrawerNodeId,
      currentNodeId,
      nodes,
      loadNodeEvidence,
      loadEvidenceNodes,
      toast,
      lang,
    ]
  );

  // T29-QA-2: Node menu removed - clicking node directly navigates

  const upsertNode = useCallback((incoming: Node) => {
    setNodes((prev) => {
      const idx = prev.findIndex((n) => n.id === incoming.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...incoming };
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  const finalizeStreamingPlaybackIfReady = useCallback(() => {
    if (!streamingServerDoneRef.current) return;

    // If the final persisted ai_node is present, drop the streaming override to avoid duplicates.
    const id = activeStreamingPlaceholderIdRef.current;
    const hasPersisted = Boolean(id && nodesRef.current.some((n) => n.id === id));
    streamingServerDoneRef.current = false;

    if (hasPersisted) {
      setStreamingAiMessage(null);
      return;
    }

    setStreamingAiMessage((prev) => (prev ? { ...prev, isStreaming: false } : prev));
  }, []);

  const enqueueStreamingText = useCallback(
    (text: string) => {
      if (!text) return;
      
      // Removed dual buffering - render directly for maximum performance
      streamingRenderedTextRef.current += text;
      lastStreamTextRef.current = streamingRenderedTextRef.current;

      setStreamingAiMessage((prev) =>
        prev ? { ...prev, text: streamingRenderedTextRef.current, answerStarted: true } : prev
      );

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (activeStreamMeta.current) {
        const nextMeta: StreamMeta = {
          ...activeStreamMeta.current,
          text: lastStreamTextRef.current,
          status: 'active',
        };
        activeStreamMeta.current = nextMeta;
        if (now - streamingPersistLastMsRef.current >= STREAM_RENDER_PERSIST_INTERVAL_MS) {
          streamingPersistLastMsRef.current = now;
          persistPendingStreamMeta(nextMeta);
        }
      }
    },
    [persistPendingStreamMeta]
  );

  const runSseStream = useCallback(
    async (
      endpoint: string,
      payload: Record<string, any>,
      controller: AbortController,
      onEvent: (data: any) => void
    ) => {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionUserId && { 'x-omytree-user-id': sessionUserId }),
      };

      const res = await appApiFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => ({}));
          const errPayload = (errData as any)?.error;
          if (errPayload && typeof errPayload === 'object' && errPayload.code) {
            throw {
              code: errPayload.code,
              provider: errPayload.provider,
              message: formatLlmErrorMessage(errPayload, lang),
            };
          }
          const fallbackMessage =
            typeof (errData as any)?.message === 'string'
              ? (errData as any).message
              : typeof (errData as any)?.error === 'string'
                ? (errData as any).error
                : `Stream request failed: ${res.status}`;
          throw new Error(fallbackMessage);
        } else {
          const textBody = await res.text().catch(() => '');
          throw new Error(textBody || `Stream request failed: ${res.status}`);
        }
      }

      if (!res.body) {
        throw new Error('Streaming response missing body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const segments = buffer.split('\n\n');
          buffer = segments.pop() ?? '';
          for (const segment of segments) {
            if (!segment || segment.startsWith(':')) continue;
            const dataLine = segment
              .split('\n')
              .map((line) => line.trim())
              .find((line) => line.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const parsed = JSON.parse(dataLine.replace(/^data:\s*/, ''));
              onEvent(parsed);
            } catch (err) {
              controller.abort();
              throw err;
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {
          // Ignore cancellation errors
        });
      }
    },
    [sessionUserId, lang, formatLlmErrorMessage]
  );

  const handleStreamingSend = useCallback(
    async ({
      userMessage,
      nextLevel,
      providerForTurn,
      modelForTurn,
      isBrandNewTree,
      contextProfile,
      memoryScope,
      uploadIds,
      knowledgeBaseIds,
      knowledge,
    }: {
      userMessage: string;
      nextLevel: number | null;
      providerForTurn: string | null;
      modelForTurn: string | null;
      isBrandNewTree: boolean;
      contextProfile: string | null;
      memoryScope: string | null;
      uploadIds?: string[];
      knowledgeBaseIds?: string[];
      knowledge?: { baseId: string; baseName?: string; documentIds?: string[]; topK?: number } | null;
    }) => {
      const controller = new AbortController();
      if (activeStreamController.current) {
        activeStreamController.current.abort();
      }
      activeStreamController.current = controller;
      manualAbortRef.current = false;

      // RAF 批处理已移除
      let streamCompleted = false;
      let keepPendingMeta = false;
      let streamTreeId = activeTreeId;
      let streamAiNodeId: string | null = null;

      const isReasoningPreferredModel =
        (providerForTurn || '').toLowerCase().includes('deepseek') &&
        (modelForTurn || '').toLowerCase().includes('reasoner');
      // Reasoning-first UX (best-effort): buffer answer tokens until we see the first reasoning token.
      // Never block indefinitely — fallback timer will release answer streaming.
      let allowAnswerStreaming = !isReasoningPreferredModel;
      let reasoningSeen = false;
      let bufferedAnswer = '';
      let answerDelayTimer: ReturnType<typeof setTimeout> | null = null;

      const flushBufferedAnswer = () => {
        if (!bufferedAnswer) return;
        const toFlush = bufferedAnswer;
        bufferedAnswer = '';
        enqueueStreamingText(toFlush);
      };
      const pendingMeta: StreamMeta = {
        treeId: activeTreeId,
        parentNodeId: currentNodeId,
        requestParentId: currentNodeId,
        requestUserId: sessionUserId,
        provider: providerForTurn,
        model: modelForTurn,
        isByok: selectedModelOption?.isByok ?? null,
        startedAt: new Date().toISOString(),
        turnId: null,
        text: '',
        userText: userMessage,
        status: 'active',
      };
      const startedAtMs = Date.parse(pendingMeta.startedAt);
      persistPendingStreamMeta(pendingMeta);
      activeTurnIdRef.current = null;
      lastStreamTextRef.current = '';
      streamingRenderedTextRef.current = '';
      streamingReasoningTextRef.current = '';
      streamingPersistLastMsRef.current = 0;
      streamingServerDoneRef.current = false;

      const streamingPlaceholderId = `streaming-ai-${Date.now()}`;
      activeStreamingPlaceholderIdRef.current = streamingPlaceholderId;

      // DeepSeek reasoning UX: default-open reasoning for reasoning-preferred models.
      // Persist the visibility so it survives the placeholder -> persisted ai_node transition.
      if (isReasoningPreferredModel) {
        setReasoningVisibleMap((prev) =>
          prev[streamingPlaceholderId] ? prev : { ...prev, [streamingPlaceholderId]: true }
        );
      }
      setStreamingAiMessage({
        id: streamingPlaceholderId,
        role: 'ai',
        text: '',
        reasoning: '',
        reasoningVisible: isReasoningPreferredModel,
        groundingMetadata: undefined,
        groundingVisible: false,
        reasoningStarted: false,
        answerStarted: false,
        thinkingMs: null,
        reasoningSupported: isReasoningPreferredModel,
        level: nextLevel !== null ? nextLevel + 1 : null,
        isCurrent: true, // Show as current during streaming (matches final state)
        isRoot: false,
        provider: providerForTurn,
        model: modelForTurn,
        isByok: selectedModelOption?.isByok ?? null,
        sourceLabel: providerForTurn
          ? buildSourceLabel(providerForTurn, modelForTurn, selectedModelOption?.isByok ?? null)
          : null,
        isStreaming: true,
        knowledge: knowledge
          ? {
              baseId: knowledge.baseId,
              baseName: knowledge.baseName,
              documentIds: Array.isArray(knowledge.documentIds) ? knowledge.documentIds : [],
              documentCount: Array.isArray(knowledge.documentIds) ? knowledge.documentIds.length : undefined,
            }
          : undefined,
      });

      // T-SIDEBAR-EARLY: Dispatch early placeholder event so sidebar shows loading animation
      // immediately when a brand new tree starts streaming (before server responds).
      if (isBrandNewTree && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('omytree:tree-creating', {
          detail: { userMessage, placeholderId: streamingPlaceholderId },
        }));
      }

      const endpoint = isBrandNewTree ? '/api/tree/start-root/stream' : '/api/turn/stream';
      // T-fix-3: Use currentNodeIdRef.current to get the latest value immediately,
      // because React state updates (setCurrentNodeId) are async and may not be committed yet.
      const nodeIdForRequest = currentNodeIdRef.current ?? currentNodeId;
      const payload = isBrandNewTree
        ? {
          user_text: userMessage,
          provider: providerForTurn,
          model: modelForTurn,
          ...(contextProfile ? { context_profile: contextProfile } : {}),
          ...(memoryScope ? { memory_scope: memoryScope } : {}),
          ...(uploadIds && uploadIds.length > 0 ? { upload_ids: uploadIds } : {}),
          ...(knowledge ? { knowledge } : {}),
          ...(knowledgeBaseIds && knowledgeBaseIds.length > 0 ? { knowledge_base_ids: knowledgeBaseIds } : {}),
        }
        : {
          tree_id: activeTreeId,
          node_id: nodeIdForRequest,
          user_text: userMessage,
          provider: providerForTurn,
          model: modelForTurn,
          ...(contextProfile ? { context_profile: contextProfile } : {}),
          ...(memoryScope ? { memory_scope: memoryScope } : {}),
          ...(uploadIds && uploadIds.length > 0 ? { upload_ids: uploadIds } : {}),
          ...(knowledge ? { knowledge } : {}),
          ...(knowledgeBaseIds && knowledgeBaseIds.length > 0 ? { knowledge_base_ids: knowledgeBaseIds } : {}),
        };

      const onEvent = (event: any) => {
        if (!event || typeof event !== 'object') return;
        if (manualAbortRef.current) {
          if (event.type === 'delta' || event.type === 'reasoning' || event.type === 'done' || event.type === 'error') {
            return;
          }
        }
        switch (event.type) {
          case 'start': {
            if (isReasoningPreferredModel && !answerDelayTimer) {
              answerDelayTimer = setTimeout(() => {
                allowAnswerStreaming = true;
                flushBufferedAnswer();
              }, 1200);
            }
            if (event.turn_id) {
              activeTurnIdRef.current = event.turn_id;
              if (activeStreamMeta.current) {
                persistPendingStreamMeta({
                  ...activeStreamMeta.current,
                  turnId: event.turn_id,
                });
              }

              // Ultra-fast manual abort: we may not have had a turn_id when the user
              // clicked "stop". Once we get it, immediately abort on backend and
              // then close the SSE connection.
              if (pendingServerAbortRef.current) {
                const { abortUserId } = pendingServerAbortRef.current;
                pendingServerAbortRef.current = null;
                const headers: HeadersInit = abortUserId ? { 'x-omytree-user-id': abortUserId } : {};
                const turnIdToAbort = event.turn_id;

                // Use async IIFE to properly handle the abort response
                (async () => {
                  try {
                    const res = await appApiFetch(`/api/turn/${turnIdToAbort}/abort`, { method: 'POST', headers });
                    if (res.ok) {
                      const data = await res.json();

                      // Update URL and currentNodeId to the AI node if available
                      if (data.ai_node?.id && data.tree_id) {
                        // T-fix-3: Update ref immediately so next send uses correct parent
                        currentNodeIdRef.current = data.ai_node.id;
                        setCurrentNodeId(data.ai_node.id);
                        updateURL(data.tree_id, data.ai_node.id);
                        await reloadTree({ treeIdOverride: data.tree_id, nextNodeId: data.ai_node.id });
                        clearPendingStreamMeta();
                        setStreamingAiMessage(null);
                        refreshQATree();
                      } else if (data.user_node?.id && data.tree_id) {
                        // T-fix-2: Same fix as normal abort - find AI node child of user_node
                        const loadedNodes = await reloadTree({ treeIdOverride: data.tree_id, nextNodeId: data.user_node.id });
                        refreshQATree();
                        
                        const aiNode = loadedNodes?.find(n => 
                          (n.role === 'ai' || n.role === 'assistant') && n.parent_id === data.user_node.id
                        );
                        if (aiNode) {
                          // T-fix-3: Update ref immediately
                          currentNodeIdRef.current = aiNode.id;
                          setCurrentNodeId(aiNode.id);
                          updateURL(data.tree_id, aiNode.id);
                          clearPendingStreamMeta();
                          setStreamingAiMessage(null);
                        } else {
                          currentNodeIdRef.current = data.user_node.id;
                          setCurrentNodeId(data.user_node.id);
                          updateURL(data.tree_id, data.user_node.id);
                          if (activeStreamMeta.current) {
                            tryRecoverStream({
                              ...activeStreamMeta.current,
                              treeId: data.tree_id,
                              turnId: turnIdToAbort,
                              status: 'aborted',
                            });
                          }
                        }
                      } else if (data.tree_id) {
                        // Some abort responses may omit node ids. Always do a synchronous reloadTree first.
                        const loadedNodes = await reloadTree({ treeIdOverride: data.tree_id });
                        const hasAiNode = loadedNodes && loadedNodes.some(n => n.role === 'ai');
                        if (!hasAiNode && activeStreamMeta.current) {
                          tryRecoverStream({
                            ...activeStreamMeta.current,
                            treeId: data.tree_id,
                            turnId: turnIdToAbort,
                            status: 'aborted',
                          });
                        }
                      }
                    }
                  } catch (err) {
                    console.warn('[abort] Failed to notify server (late turn_id):', err);
                  } finally {
                    // T-bugfix: NOW it's safe to allow new sends - currentNodeId has been updated
                    abortInProgressRef.current = false;
                    setIsSending(false);
                  }
                })();

                if (activeStreamController.current) {
                  try {
                    activeStreamController.current.abort();
                  } catch {
                    // ignore
                  }
                }
                activeTurnIdRef.current = null;
              }
            }
            if (event.tree?.id) {
              streamTreeId = event.tree.id;
              setActiveTreeId(event.tree.id);
              if (event.tree.topic) {
                setTreeMetaTopic(event.tree.topic);
              }

              if (isBrandNewTree && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('omytree:tree-creating', {
                  detail: {
                    placeholderId: activeStreamingPlaceholderIdRef.current,
                    userMessage: activeStreamMeta.current?.userText ?? userMessage,
                    treeId: event.tree.id,
                  },
                }));
              }

              // Brand-new tree: transition URL away from ?new=1 exactly once.
              // This keeps `useSearchParams()` in sync without racing later node updates.
              if (isBrandNewTree && !newTreeUrlSyncedRef.current) {
                newTreeUrlSyncedRef.current = true;
                updateURL(event.tree.id, null);
              }
              if (activeStreamMeta.current) {
                const nextMeta = {
                  ...activeStreamMeta.current,
                  treeId: event.tree.id,
                  parentNodeId: activeStreamMeta.current.parentNodeId,
                };
                activeStreamMeta.current = nextMeta;
                persistPendingStreamMeta(nextMeta);
              }
            }
            if (event.root_node) {
              upsertNode(event.root_node);
              setCurrentNodeId(event.root_node.id);
              // For brand new trees, skip URL update here to avoid race conditions.
              // The URL will be updated once in the 'done' handler with the AI node ID.
              if (!isBrandNewTree) {
                updateURL(event.tree?.id || activeTreeId, event.root_node.id);
              }
              if (activeStreamMeta.current) {
                const nextMeta = {
                  ...activeStreamMeta.current,
                  parentNodeId: activeStreamMeta.current.parentNodeId ?? event.root_node.id,
                };
                activeStreamMeta.current = nextMeta;
                persistPendingStreamMeta(nextMeta);
              }
            }
            if (event.user_node) {
              const userNodeWithAttachments = {
                ...event.user_node,
                ...(knowledge
                  ? {
                      knowledge: {
                        baseId: knowledge.baseId,
                        baseName: knowledge.baseName,
                        documentIds: Array.isArray(knowledge.documentIds) ? knowledge.documentIds : [],
                        documentCount: Array.isArray(knowledge.documentIds)
                          ? knowledge.documentIds.length
                          : undefined,
                      },
                    }
                  : {}),
                attachments:
                  (event.user_node.attachments && event.user_node.attachments.length > 0)
                    ? event.user_node.attachments
                    : (pendingAttachmentsRef.current && pendingAttachmentsRef.current.length > 0
                      ? pendingAttachmentsRef.current
                      : undefined),
              };
              upsertNode(userNodeWithAttachments);
              // Update currentNodeId to user_node so it appears in path immediately
              setCurrentNodeId(event.user_node.id);
              // For brand new trees, skip URL update here to avoid race conditions.
              // The URL will be updated once in the 'done' handler with the AI node ID.
              if (!isBrandNewTree) {
                // Also update URL immediately so refresh won't lose the turn if streaming is aborted
                updateURL(event.tree?.id || activeTreeId, event.user_node.id);
              }
              setPendingUserMessage(null);
              if (activeStreamMeta.current) {
                const nextMeta = {
                  ...activeStreamMeta.current,
                  parentNodeId: event.user_node.id,
                };
                activeStreamMeta.current = nextMeta;
                persistPendingStreamMeta(nextMeta);
              }
            }
            break;
          }
          case 'turn': {
            if (event.turn_id) {
              activeTurnIdRef.current = event.turn_id;
              if (activeStreamMeta.current) {
                persistPendingStreamMeta({
                  ...activeStreamMeta.current,
                  turnId: event.turn_id,
                });
              }
            }
            if (event.user_node) {
              const userNodeWithAttachments = {
                ...event.user_node,
                ...(knowledge
                  ? {
                      knowledge: {
                        baseId: knowledge.baseId,
                        baseName: knowledge.baseName,
                        documentIds: Array.isArray(knowledge.documentIds) ? knowledge.documentIds : [],
                        documentCount: Array.isArray(knowledge.documentIds)
                          ? knowledge.documentIds.length
                          : undefined,
                      },
                    }
                  : {}),
                attachments:
                  (event.user_node.attachments && event.user_node.attachments.length > 0)
                    ? event.user_node.attachments
                    : (pendingAttachmentsRef.current && pendingAttachmentsRef.current.length > 0
                      ? pendingAttachmentsRef.current
                      : undefined),
              };
              upsertNode(userNodeWithAttachments);
              // Update currentNodeId to user_node so it appears in path immediately
              setCurrentNodeId(event.user_node.id);
              // Also update URL immediately so refresh won't lose the turn if streaming is aborted
              updateURL(activeTreeId, event.user_node.id);
              setPendingUserMessage(null);
              if (activeStreamMeta.current) {
                const nextMeta = {
                  ...activeStreamMeta.current,
                  parentNodeId: event.user_node.id,
                };
                activeStreamMeta.current = nextMeta;
                persistPendingStreamMeta(nextMeta);
              }
            }
            break;
          }
          case 'delta': {
            if (typeof event.text === 'string' && event.text.length > 0) {
              if (isReasoningPreferredModel && !allowAnswerStreaming && !reasoningSeen) {
                bufferedAnswer += event.text;
                return;
              }
              enqueueStreamingText(event.text);
            }
            break;
          }
          case 'reasoning': {
            if (typeof event.text === 'string' && event.text.length > 0) {
              reasoningSeen = true;
              streamingReasoningTextRef.current += event.text;

              // Enable reasoning UI on-demand (Gemini, etc.).
              // DeepSeek reasoner already defaults to visible via isReasoningPreferredModel.
              if (!isReasoningPreferredModel) {
                const targetId = activeStreamingPlaceholderIdRef.current;
                if (targetId) {
                  setReasoningVisibleMap((prev) => (prev[targetId] ? prev : { ...prev, [targetId]: true }));
                }
              }

              if (isReasoningPreferredModel && !allowAnswerStreaming) {
                allowAnswerStreaming = true;
                if (answerDelayTimer) {
                  clearTimeout(answerDelayTimer);
                  answerDelayTimer = null;
                }
              }
              setStreamingAiMessage((prev) => {
                if (!prev) return prev;
                const mergedReasoning = (prev.reasoning || '') + event.text;
                return {
                  ...prev,
                  reasoning: mergedReasoning,
                  reasoningStarted: true,
                  reasoningSupported: true,
                  reasoningVisible: true,
                };
              });
              if (isReasoningPreferredModel) {
                queueMicrotask(() => flushBufferedAnswer());
              }
            }
            break;
          }
          case 'done': {
            if (answerDelayTimer) {
              clearTimeout(answerDelayTimer);
              answerDelayTimer = null;
            }
            flushBufferedAnswer();
            streamCompleted = true;
            streamingServerDoneRef.current = true;
            // Notify sidebar to re-sort this conversation to top
            if (typeof window !== 'undefined' && streamTreeId) {
              window.dispatchEvent(new CustomEvent('omytree:tree-updated', {
                detail: { treeId: streamTreeId, updated_at: new Date().toISOString() },
              }));
            }

            const incomingCitations: Citation[] | undefined = Array.isArray((event as any)?.citations)
              ? ((event as any).citations as Citation[])
              : undefined;

            // Mark streaming as completed. We'll also update the placeholder's id to match
            // the real ai_node.id (if available) so that React sees the same key when the
            // persisted node replaces the placeholder, preventing a visible "flash" from
            // component unmount/remount.
            // Also set isCurrent: true to match the final state (the AI node will become
            // the currentNodeId), preventing the ring/border style from suddenly appearing.
            const realAiNodeId = event.ai_node?.id || null;
            if (realAiNodeId) {
              const fromId = activeStreamingPlaceholderIdRef.current;
              if (fromId && fromId !== realAiNodeId) {
                setReasoningVisibleMap((prev) => {
                  const fromVisible = Boolean(prev[fromId]);
                  if (!fromVisible) return prev;
                  if (prev[realAiNodeId]) return prev;
                  return { ...prev, [realAiNodeId]: true };
                });

                setGroundingVisibleMap((prev) => {
                  const fromVisible = Boolean(prev[fromId]);
                  if (!fromVisible) return prev;
                  if (prev[realAiNodeId]) return prev;
                  return { ...prev, [realAiNodeId]: true };
                });

                setGroundingMetadataMap((prev) => {
                  const fromMeta = prev[fromId];
                  if (!fromMeta) return prev;
                  if (prev[realAiNodeId]) return prev;
                  const { [fromId]: _omit, ...rest } = prev;
                  return { ...rest, [realAiNodeId]: fromMeta };
                });
              }
              activeStreamingPlaceholderIdRef.current = realAiNodeId;
            }

            const incomingGrounding = event?.usage?.groundingMetadata;
            if (incomingGrounding && typeof incomingGrounding === 'object') {
              const targetId = realAiNodeId || activeStreamingPlaceholderIdRef.current;
              if (targetId) {
                setGroundingMetadataMap((prev) => ({ ...prev, [targetId]: incomingGrounding }));
              }
              setStreamingAiMessage((prev) => {
                if (!prev) return prev;
                return { ...prev, groundingMetadata: incomingGrounding };
              });
            }

            // If the server provides reasoning only at the end (e.g. Gemini usage/fullReasoning),
            // auto-enable the reasoning UI for non-DeepSeek models so users see it in a separate block.
            const doneReasoning = (event.ai_node as any)?.reasoning_content;
            if (typeof doneReasoning === 'string' && doneReasoning.length > 0) {
              const targetId = realAiNodeId || activeStreamingPlaceholderIdRef.current;
              if (targetId) {
                setReasoningVisibleMap((prev) => {
                  // Respect explicit user toggles (only auto-enable when key is absent)
                  if (typeof prev[targetId] === 'boolean') return prev;
                  return { ...prev, [targetId]: true };
                });
              }
            }
            setStreamingAiMessage((prev) => {
              if (!prev) return prev;
              const incomingReasoning = doneReasoning;
              const shouldPatchReasoning =
                (typeof prev.reasoning !== 'string' || prev.reasoning.length === 0) &&
                typeof incomingReasoning === 'string' &&
                incomingReasoning.length > 0;
              const computedThinkingMs =
                Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.max(0, Date.now() - startedAtMs) : null;
              const shouldPatchThinking = (prev.thinkingMs == null) && computedThinkingMs != null;

              const shouldEnableReasoningUi = shouldPatchReasoning && !isReasoningPreferredModel;
              return {
                ...prev,
                // Finalized - buffering removed
                isStreaming: false,
                // Mark as current since this node will be selected
                isCurrent: true,
                // Use real AI node id if available so React keys match
                ...(realAiNodeId ? { id: realAiNodeId } : {}),
                ...(shouldPatchReasoning ? { reasoning: incomingReasoning } : {}),
                ...(shouldPatchReasoning ? { reasoningStarted: true } : {}),
                ...(shouldEnableReasoningUi
                  ? { reasoningSupported: true, reasoningVisible: true }
                  : {}),
                ...(shouldPatchThinking ? { thinkingMs: computedThinkingMs } : {}),
                ...(incomingCitations && incomingCitations.length > 0 ? { citations: incomingCitations } : {}),
              };
            });

            // Some providers/paths may omit `event.tree` in the final done payload.
            // Use `streamTreeId` captured from the start event to ensure we can
            // reliably transition the URL away from ?new=1.
            const treeId = event.tree?.id || streamTreeId || activeTreeId;
            if (treeId) {
              streamTreeId = treeId;
              setActiveTreeId(treeId);
              if (event.tree?.topic) {
                setTreeMetaTopic(event.tree.topic);
              }
            }
            if (event.root_node) {
              upsertNode(event.root_node);
            }
            if (event.user_node) {
              const userNodeWithAttachments = {
                ...event.user_node,
                ...(knowledge
                  ? {
                      knowledge: {
                        baseId: knowledge.baseId,
                        baseName: knowledge.baseName,
                        documentIds: Array.isArray(knowledge.documentIds) ? knowledge.documentIds : [],
                        documentCount: Array.isArray(knowledge.documentIds)
                          ? knowledge.documentIds.length
                          : undefined,
                      },
                    }
                  : {}),
                attachments:
                  (event.user_node.attachments && event.user_node.attachments.length > 0)
                    ? event.user_node.attachments
                    : (pendingAttachmentsRef.current && pendingAttachmentsRef.current.length > 0
                      ? pendingAttachmentsRef.current
                      : undefined),
              };
              upsertNode(userNodeWithAttachments);
              setPendingUserMessage(null);
            }
            if (event.ai_node) {
              // If the server's done payload omits/empties ai_node.text, we would
              // upsert an empty node and then remove the streaming placeholder,
              // making the AI bubble appear to disappear. Fall back to the
              // streamed text accumulated on the client.
              const incomingText = (event.ai_node as any)?.text;
              const streamedText = (lastStreamTextRef.current || '').trimEnd();
              const shouldPatchText =
                (typeof incomingText !== 'string' || incomingText.trim().length === 0) &&
                streamedText.trim().length > 0;

              const aiNodeToUpsertBase = shouldPatchText
                ? { ...event.ai_node, text: streamedText }
                : event.ai_node;

              const aiNodeToUpsert =
                incomingCitations && incomingCitations.length > 0
                  ? ({ ...aiNodeToUpsertBase, citations: incomingCitations } as any)
                  : aiNodeToUpsertBase;

              upsertNode(aiNodeToUpsert);
              streamAiNodeId = event.ai_node.id;
              lastCompletedAiNodeIdRef.current = event.ai_node.id;
              setCurrentNodeId(event.ai_node.id);
              if (treeId) {
                updateURL(treeId, event.ai_node.id);
              }
            }

            // Dispatch tree-created event for AppShell sidebar update (T26)
            if (treeId && isBrandNewTree && typeof window !== 'undefined') {
              const sidebarTree = {
                id: treeId,
                topic: event.tree?.topic || userMessage,
                display_title: null,
                root_title: event.root_node?.text || event.tree?.topic || userMessage,
                title: event.root_node?.text || event.tree?.topic || userMessage,
                created_at: event.tree?.created_at || new Date().toISOString(),
                updated_at: event.tree?.created_at || new Date().toISOString(),
              };
              window.dispatchEvent(new CustomEvent('omytree:tree-created', { detail: { tree: sidebarTree } }));
            }

            // T-FIX-STUCK-SESSION: Always exit new-tree mode once the streaming turn
            // completes successfully. Previously we skipped this for brand-new trees and
            // relied on URL searchParams sync, but when the user enters via forceNewTreeSession
            // (URL never has ?new=1), window.history.replaceState is used instead of
            // router.replace, so useSearchParams() never updates and the useEffect that
            // exits new-tree mode never fires — leaving isNewTreeSession permanently stuck
            // at true and causing the NEXT message to create another new tree.
            setIsNewTreeSession(false);
            // Reset URL sync flag so future ?new=1 navigations are not blocked.
            newTreeUrlSyncedRef.current = false;
            activeTurnIdRef.current = null;
            clearPendingStreamMeta();
            stopRecoveryTimer();
            // De-prioritize tree revalidation to avoid a visible "refresh" right after
            // the last token lands.
            startTransition(() => {
              refreshQATree();
            });

            pendingAttachmentsRef.current = [];

            // T56-3: Track turn completion for resume toast suggestion
            resumeToastOnTurnComplete();

            // If there's no buffered text left to reveal, finalize immediately.
            finalizeStreamingPlaybackIfReady();

            // T48-2: Handle soft limit warnings from turn response
            if (event.warnings && Array.isArray(event.warnings) && event.warnings.length > 0) {
              event.warnings.forEach((warning: any) => {
                if (warning?.severity === 'warning') {
                  // High urgency - show toast (8 seconds)
                  toast({
                    title: warning.message || t(lang, 'toast_usage_reminder'),
                    description: warning.suggestion,
                    duration: 8000,
                  });
                } else if (warning?.severity === 'info') {
                  // Lower urgency - show toast (5 seconds)
                  toast({
                    title: warning.message || t(lang, 'toast_usage_reminder'),
                    description: warning.suggestion,
                    duration: 5000,
                  });
                }
              });
            }

            break;
          }
          case 'error': {
            streamCompleted = true;
            if (answerDelayTimer) {
              clearTimeout(answerDelayTimer);
              answerDelayTimer = null;
            }
            // Clear sidebar placeholder on error for brand new trees
            if (isBrandNewTree && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('omytree:tree-create-failed'));
            }
            // Ignore "This operation was aborted" errors - these occur when the client closes the connection
            // and are expected behavior, not user-facing errors
            if (event.error?.message?.includes('operation was aborted')) {
              return;
            }

            const message =
              event.error?.message ||
              (event.error?.code
                ? formatLlmErrorMessage(
                  { code: event.error.code, provider: event.error.provider },
                  lang
                )
                : t(lang, 'toast_gen_failed'));
            setStreamingAiMessage((prev) =>
              prev ? { ...prev, isStreaming: false, error: message } : prev
            );
            setPendingUserMessage(null);
            clearPendingStreamMeta();
            activeTurnIdRef.current = null;
            stopRecoveryTimer();
            toast({
              title: message,
              variant: 'destructive',
            });
            controller.abort();
            break;
          }
          default:
            break;
        }
      };

      try {
        const isOllamaProvider = (providerForTurn || '').toLowerCase() === 'ollama';

        if (isOllamaProvider) {
          // ── Ollama Client-Side Streaming ──
          // Instead of server-side SSE, we:
          // 1. Pre-flight: verify Ollama is reachable
          // 2. Call prepare endpoint to get context messages
          // 3. Stream from user's local Ollama
          // 4. Call save endpoint to persist
          const ollamaBaseUrl = (typeof window !== 'undefined'
            ? window.localStorage.getItem('omytree.ollamaBaseUrl')
            : null) || 'http://localhost:11434';

          // Pre-flight check: verify Ollama is reachable before creating any DB records.
          // This prevents orphaned trees/turns when Ollama is not running, uninstalled,
          // or the user switched to a device without Ollama.
          try {
            const preflightController = new AbortController();
            const preflightTimeout = setTimeout(() => preflightController.abort(), 5000);
            const preflightRes = await fetch(`${ollamaBaseUrl.replace(/\/+$/, '')}/api/tags`, {
              signal: preflightController.signal,
            });
            clearTimeout(preflightTimeout);
            if (!preflightRes.ok) {
              throw new Error(`status ${preflightRes.status}`);
            }
          } catch (preflightErr: any) {
            // Ollama is not reachable — abort early without creating DB records
            const isCors = preflightErr?.message?.includes('Failed to fetch') ||
              preflightErr?.message?.includes('NetworkError') ||
              preflightErr?.message?.includes('CORS');
            const isTimeout = preflightErr?.name === 'AbortError';
            let errMsg: string;
            if (lang === 'zh-CN') {
              if (isTimeout) {
                errMsg = `连接本地 Ollama 超时 (${ollamaBaseUrl})。请确认 Ollama 正在运行。`;
              } else if (isCors) {
                errMsg = `无法连接到本地 Ollama (${ollamaBaseUrl})。请确认：\n1. Ollama 已启动\n2. 已设置环境变量 OLLAMA_ORIGINS=*`;
              } else {
                errMsg = `无法连接到本地 Ollama (${ollamaBaseUrl})。请确认 Ollama 已安装并正在运行。`;
              }
            } else {
              if (isTimeout) {
                errMsg = `Connection to local Ollama timed out (${ollamaBaseUrl}). Please verify Ollama is running.`;
              } else if (isCors) {
                errMsg = `Cannot connect to local Ollama (${ollamaBaseUrl}). Please verify:\n1. Ollama is running\n2. OLLAMA_ORIGINS=* is set`;
              } else {
                errMsg = `Cannot connect to local Ollama (${ollamaBaseUrl}). Please ensure Ollama is installed and running.`;
              }
            }
            onEvent({ type: 'error', error: { message: errMsg } });
            throw new Error(errMsg);
          }

          const prepareEndpoint = isBrandNewTree
            ? '/api/tree/start-root/prepare-ollama'
            : '/api/turn/prepare-ollama';

          const preparePayload = isBrandNewTree
            ? {
                user_text: userMessage,
                provider: providerForTurn,
                model: modelForTurn,
                ...(contextProfile ? { context_profile: contextProfile } : {}),
                ...(memoryScope ? { memory_scope: memoryScope } : {}),
                ...(uploadIds && uploadIds.length > 0 ? { upload_ids: uploadIds } : {}),
                ...(knowledge ? { knowledge } : {}),
                ...(knowledgeBaseIds && knowledgeBaseIds.length > 0 ? { knowledge_base_ids: knowledgeBaseIds } : {}),
              }
            : {
                tree_id: activeTreeId,
                node_id: currentNodeIdRef.current ?? currentNodeId,
                user_text: userMessage,
                provider: providerForTurn,
                model: modelForTurn,
                ...(contextProfile ? { context_profile: contextProfile } : {}),
                ...(memoryScope ? { memory_scope: memoryScope } : {}),
                ...(uploadIds && uploadIds.length > 0 ? { upload_ids: uploadIds } : {}),
                ...(knowledge ? { knowledge } : {}),
                ...(knowledgeBaseIds && knowledgeBaseIds.length > 0 ? { knowledge_base_ids: knowledgeBaseIds } : {}),
              };

          const prepareHeaders: HeadersInit = {
            'Content-Type': 'application/json',
            ...(sessionUserId && { 'x-omytree-user-id': sessionUserId }),
          };

          // Step 1: Prepare (server builds context)
          const prepareRes = await appApiFetch(prepareEndpoint, {
            method: 'POST',
            headers: prepareHeaders,
            body: JSON.stringify(preparePayload),
            signal: controller.signal,
          });

          if (!prepareRes.ok) {
            const errData = await prepareRes.json().catch(() => ({}));
            throw new Error((errData as any)?.message || `Prepare failed: ${prepareRes.status}`);
          }

          const prepareData = await prepareRes.json();
          if (!prepareData.ok) {
            throw new Error(prepareData.message || 'Prepare failed');
          }

          const { messages: ollamaMessages, turn_id: ollamaTurnId, citations: ollamaCitations } = prepareData;

          // Synthesize 'start' event so the existing handler updates UI
          const startEvent: any = {
            type: 'start',
            turn_id: ollamaTurnId,
          };
          if (prepareData.tree) {
            startEvent.tree = prepareData.tree;
            streamTreeId = prepareData.tree.id;
          }
          if (prepareData.root_node) {
            startEvent.root_node = prepareData.root_node;
          }
          if (prepareData.user_node) {
            startEvent.user_node = prepareData.user_node;
          }
          onEvent(startEvent);

          // Step 2: Stream from user's local Ollama (native /api/chat with think support)
          const ollamaUrl = `${ollamaBaseUrl.replace(/\/+$/, '')}/api/chat`;
          let ollamaRes: Response;
          try {
            ollamaRes = await fetch(ollamaUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelForTurn || prepareData.model || 'llama3.2',
                messages: ollamaMessages,
                stream: true,
                think: true,
              }),
              signal: controller.signal,
            });
          } catch (fetchErr: any) {
            if (fetchErr?.name === 'AbortError') throw fetchErr;
            // Cancel the pending turn so it doesn't stay as 'pending_ollama' forever
            try {
              await appApiFetch('/api/turn/cancel-ollama', {
                method: 'POST',
                headers: prepareHeaders,
                body: JSON.stringify({ turn_id: ollamaTurnId, reason: 'Ollama connection failed' }),
              });
            } catch { /* best-effort */ }
            onEvent({
              type: 'error',
              error: {
                message: lang === 'zh-CN'
                  ? `Ollama 连接中断 (${ollamaBaseUrl})。请检查 Ollama 是否仍在运行。`
                  : `Ollama connection lost (${ollamaBaseUrl}). Please check if Ollama is still running.`,
              },
            });
            throw fetchErr;
          }

          if (!ollamaRes.ok) {
            const errText = await ollamaRes.text().catch(() => '');
            const errMsg = `Ollama error ${ollamaRes.status}: ${errText.slice(0, 200)}`;
            // Cancel the pending turn on Ollama HTTP error
            try {
              await appApiFetch('/api/turn/cancel-ollama', {
                method: 'POST',
                headers: prepareHeaders,
                body: JSON.stringify({ turn_id: ollamaTurnId, reason: errMsg }),
              });
            } catch { /* best-effort */ }
            onEvent({ type: 'error', error: { message: errMsg } });
            throw new Error(errMsg);
          }

          // Parse native Ollama NDJSON stream
          // Each line is a JSON object: {"message":{"role":"assistant","content":"...","thinking":"..."},"done":false}
          const reader = ollamaRes.body?.getReader();
          if (!reader) throw new Error('No readable stream from Ollama');

          const decoder = new TextDecoder();
          let ollamaBuffer = '';
          let fullAiText = '';
          let fullReasoningText = '';
          let ollamaUsage: any = null;
          // Fallback: track <think> tags in content for models that don't use native thinking field
          let inThinkTag = false;
          let thinkTagBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ollamaBuffer += decoder.decode(value, { stream: true });

            const lines = ollamaBuffer.split('\n');
            ollamaBuffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              try {
                const chunk = JSON.parse(trimmed);

                // Handle thinking content (native field from think: true)
                const thinkingContent = chunk?.message?.thinking;
                if (typeof thinkingContent === 'string' && thinkingContent.length > 0) {
                  fullReasoningText += thinkingContent;
                  onEvent({ type: 'reasoning', text: thinkingContent });
                }

                // Handle regular content — with <think> tag fallback
                const content = chunk?.message?.content;
                if (typeof content === 'string' && content.length > 0) {
                  // Fallback: some models embed <think>...</think> in content instead of using native thinking field
                  let remaining = content;
                  while (remaining.length > 0) {
                    if (inThinkTag) {
                      const closeIdx = remaining.indexOf('</think>');
                      if (closeIdx === -1) {
                        // Still inside <think> — all content is reasoning
                        thinkTagBuffer += remaining;
                        fullReasoningText += remaining;
                        onEvent({ type: 'reasoning', text: remaining });
                        remaining = '';
                      } else {
                        // Found closing tag
                        const thinkPart = remaining.slice(0, closeIdx);
                        if (thinkPart.length > 0) {
                          fullReasoningText += thinkPart;
                          onEvent({ type: 'reasoning', text: thinkPart });
                        }
                        inThinkTag = false;
                        thinkTagBuffer = '';
                        remaining = remaining.slice(closeIdx + '</think>'.length);
                      }
                    } else {
                      const openIdx = remaining.indexOf('<think>');
                      if (openIdx === -1) {
                        // No <think> tag — all content is regular text
                        fullAiText += remaining;
                        onEvent({ type: 'delta', text: remaining });
                        remaining = '';
                      } else {
                        // Found opening tag — emit text before it, then enter think mode
                        const beforeThink = remaining.slice(0, openIdx);
                        if (beforeThink.length > 0) {
                          fullAiText += beforeThink;
                          onEvent({ type: 'delta', text: beforeThink });
                        }
                        inThinkTag = true;
                        thinkTagBuffer = '';
                        remaining = remaining.slice(openIdx + '<think>'.length);
                      }
                    }
                  }
                }

                // Capture usage from final chunk (done: true)
                if (chunk.done === true) {
                  ollamaUsage = {
                    prompt_tokens: chunk.prompt_eval_count || 0,
                    completion_tokens: chunk.eval_count || 0,
                    total_tokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
                  };
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          // Step 3: Save (server persists AI response)
          const savePayload = {
            turn_id: ollamaTurnId,
            ai_text: fullAiText,
            ...(fullReasoningText ? { reasoning_text: fullReasoningText } : {}),
            ...(ollamaUsage ? { usage: ollamaUsage } : {}),
          };

          const saveRes = await appApiFetch('/api/turn/save-ollama', {
            method: 'POST',
            headers: prepareHeaders,
            body: JSON.stringify(savePayload),
          });

          const saveData = await saveRes.json().catch(() => ({ ok: false }));

          // Synthesize 'done' event
          onEvent({
            type: 'done',
            tree: prepareData.tree || { id: streamTreeId || activeTreeId },
            user_node: prepareData.user_node,
            ai_node: saveData.ok ? saveData.ai_node : {
              id: `ollama-ai-${Date.now()}`,
              text: fullAiText,
              role: 'ai',
              reasoning_content: fullReasoningText || null,
            },
            citations: ollamaCitations || [],
            turn_id: ollamaTurnId,
          });

        } else {
          // ── Standard SSE Streaming (non-Ollama) ──
          await runSseStream(endpoint, payload, controller, onEvent);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          if (manualAbortRef.current) {
            manualAbortRef.current = false;
            // 手动中断：视为本次流已完成（不要触发恢复/重载逻辑）
            streamCompleted = true;
            keepPendingMeta = true;

            // For Ollama, handleAbortStream saves partial text via save-ollama
            // and manages streamingAiMessage directly. Skip text manipulation here
            // to avoid overwriting the state set by handleAbortStream.
            const isOllamaManualAbort = (providerForTurn || '').toLowerCase() === 'ollama';
            if (!isOllamaManualAbort) {
              setStreamingAiMessage((prev) => {
                const mergedText = streamingRenderedTextRef.current;
                lastStreamTextRef.current = mergedText;
                if (activeStreamMeta.current) {
                  persistPendingStreamMeta({
                    ...activeStreamMeta.current,
                    text: mergedText,
                    userText: activeStreamMeta.current.userText ?? userMessage,
                    status: 'aborted',
                  });
                }
                if (prev) return { ...prev, text: mergedText, isStreaming: false };
                if (!mergedText) return prev;
                return {
                  id: `aborted-ai-${Date.now()}`,
                  role: 'ai',
                  text: mergedText,
                  level: null,
                  isCurrent: false,
                  isRoot: false,
                  isStreaming: false,
                };
              });
            }
            activeTurnIdRef.current = null;
            stopRecoveryTimer();
            return;
          }
          // Unexpected abort (e.g., refresh or tree switch) - try to recover by polling for the completed turn
          if (activeStreamMeta.current) {
            tryRecoverStream(activeStreamMeta.current);
          }
          setIsSending(false);
          setStreamingAiMessage((prev) =>
            prev ? { ...prev, isStreaming: false } : prev
          );
          setPendingUserMessage(null);
          return;
        }
        const message =
          err?.code
            ? formatLlmErrorMessage({ code: err.code, provider: err.provider }, lang)
            : err?.message || t(lang, 'toast_stream_error');
        setStreamingAiMessage((prev) =>
          prev ? { ...prev, isStreaming: false, error: message } : prev
        );
        setPendingUserMessage(null);
        setInputText(userMessage);
        toast({ title: message, variant: 'destructive' });
        streamCompleted = true;
      } finally {
        // T-fix-3: Avoid unlocking sending while an abort is still settling.
        // The abort handler (normal or ultra-fast) will unlock once it has updated
        // currentNodeId/currentNodeIdRef based on the server abort response.
        if (!abortInProgressRef.current) {
          setIsSending(false);
        }
        activeStreamController.current = null;
        if (streamCompleted) {
          if (!keepPendingMeta) {
            clearPendingStreamMeta();
          }
          stopRecoveryTimer();
        }
        if (!streamCompleted) {
          // Keep partial content visible but stop streaming animation.
          setStreamingAiMessage((prev) =>
            prev ? { ...prev, text: streamingRenderedTextRef.current, isStreaming: false } : prev
          );
          setPendingUserMessage(null);
          const targetTreeId = streamTreeId || activeTreeId;
          if (targetTreeId) {
            // T-SWITCH-FIX-2: Guard against stale reloadTree calls.
            // After a tree switch, prevTreeIdRef.current points to the NEW tree.
            // If the streaming tree (targetTreeId) doesn't match, skip reload to
            // avoid overwriting the new tree's nodes/URL with old tree data.
            const staleTreeCapture = targetTreeId;
            setTimeout(async () => {
              // Double-check: if the user has already navigated to a different tree,
              // do NOT reload the old tree's data.
              const currentTreeNow = prevTreeIdRef.current;
              if (currentTreeNow && currentTreeNow !== staleTreeCapture) {
                return;
              }
              const nodesAfter = await reloadTree({
                treeIdOverride: staleTreeCapture,
                nextNodeId: streamAiNodeId || currentNodeIdRef.current || null,
              });
              if (nodesAfter && nodesAfter.some((n) => n.role === 'ai' && (n.text?.length ?? 0) > 0)) {
                setStreamingAiMessage(null);
              }
            }, 300);
          }
        }
        // Always reset pending attachment ref after a streaming attempt completes or fails
        pendingAttachmentsRef.current = [];
      }
    },
    [
      activeTreeId,
      buildSourceLabel,
      currentNodeId,
      lang,
      refreshQATree,
      runSseStream,
      sessionUserId,
      selectedModelOption?.isByok,
      toast,
      updateURL,
      upsertNode,
      setTreeMetaTopic,
      reloadTree,
      clearPendingStreamMeta,
      persistPendingStreamMeta,
      enqueueStreamingText,
      finalizeStreamingPlaybackIfReady,
      tryRecoverStream,
      stopRecoveryTimer,
      clearUploads,
      fileProcessingMode,
    ]
  );

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || isSending) return;

    // T-BYOK-UPLOAD-FIX: Prevent sending while attachments are still uploading or have failed.
    // Otherwise we may clear the composer and send without upload_ids, making files "disappear"
    // and unreadable by the LLM (especially noticeable for slower BYOK uploads).
    const hasUploadingUploads = uploadItems.some((u) => u.status === 'uploading');
    if (hasUploadingUploads) {
      toast({
        title: t(lang, 'toast_upload_in_progress'),
        description: t(lang, 'toast_upload_in_progress_desc'),
      });
      return;
    }

    const hasFailedUploads = uploadItems.some((u) => u.status === 'error');
    if (hasFailedUploads) {
      toast({
        title: t(lang, 'toast_upload_some_failed'),
        description: t(lang, 'toast_upload_some_failed_desc'),
        variant: 'destructive',
      });
      return;
    }

    const userMessage = inputText.trim();
    const advancedEnabled = Boolean(session?.user?.enable_advanced_context);
    // T-FIX-STUCK-SESSION: Guard against stale isNewTreeSession. If we already have
    // an activeTreeId and nodes from a completed first turn, this is NOT a new tree,
    // even if isNewTreeSession hasn't been reset yet due to async URL/state sync.
    // Only create a brand-new tree when there's genuinely no tree loaded.
    // Note: the early-return above already handles (activeTreeId && nodes.length===0)
    // as "tree still loading", so reaching here with !activeTreeId means no tree exists.
    const isBrandNewTree = !activeTreeId && nodes.length === 0;
    if (advancedEnabled && isBrandNewTree && !newTreeProfile) {
      setNewTreeProfileError('请选择档位后再创建新树');
      return;
    }
    setNewTreeProfileError(null);
    const contextProfileForPayload =
      advancedEnabled && isBrandNewTree
        ? newTreeProfile
        : null; // context_profile derives from newTreeProfile (T53-1)
    const memoryScopeForPayload =
      advancedEnabled && isBrandNewTree
        ? newTreeMemoryScope
        : null;
    if (isBrandNewTree) {
      setLastContextProfile(contextProfileForPayload ?? 'lite');
      setLastMemoryScope(memoryScopeForPayload ?? 'branch');
    }
    // T85: Get upload IDs to attach to this turn (must be done before we clear the composer)
    const currentUploadIds = getUploadIds();
    if (uploadItems.length > 0 && currentUploadIds.length === 0) {
      toast({
        title: t(lang, 'toast_upload_not_ready'),
        description: t(lang, 'toast_upload_not_ready_desc'),
      });
      return;
    }

    // T-UploadLimits: Enforce max attachments per turn client-side
    // free: 1 file/turn, pro: 3 files/turn
    const userPlan = session?.user?.plan || 'free';
    const uploadLimit = userPlan === 'pro' ? 3 : (userPlan === 'team' ? 10 : 1);
    const isByokUsed = isUsingByokProvider;
    if (!isByokUsed && currentUploadIds.length > uploadLimit) {
      toast({
        title: t(lang, 'upload_error_generic'),
        description: `${t(lang, 'toast_upload_limit_desc')} (${uploadLimit})`,
        variant: 'destructive',
      });
      return;
    }

    const providerForTurn = selectedModelOption?.provider || null;
    const modelForTurn = selectedModelOption?.model || null;
    setInputText('');
    setIsSending(true);

    // Calculate next level for pending message
    const nextLevel = currentNode
      ? (typeof currentNode.level === 'number' ? currentNode.level + 1 : null)
      : (nodes.length > 0 ? 1 : 0);

    // T85-fix: Convert current uploads to attachments for pending message display
    const pendingAttachments = uploadItems
      .filter(item => item.status === 'success' && !item.tempId)
      .map(item => ({
        id: item.id,
        fileName: item.fileName,
        ext: item.ext,
        sizeBytes: item.sizeBytes,
      }));
    // Keep a ref so streaming events can reattach before the server echoes attachments
    pendingAttachmentsRef.current = pendingAttachments;

    // T85: Clear composer attachments after send
    clearUploads();

    const knowledgePayload = selectedKnowledge.kb?.id
      ? {
        baseId: selectedKnowledge.kb.id,
        baseName: selectedKnowledge.kb.name,
        ...(selectedKnowledge.docs.length > 0
          ? { documentIds: selectedKnowledge.docs.map((d) => d.id) }
          : {}),
        topK: 5,
      }
      : null;

    // Create a temporary pending user message to show immediately
    const tempUserMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'user',
      text: userMessage,
      level: nextLevel,
      isCurrent: false,
      // Keep first-turn pending bubble layout consistent with persisted root node.
      isRoot: isBrandNewTree,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined, // T85-fix
      knowledge: selectedKnowledge.kb ? {
        baseId: selectedKnowledge.kb.id,
        baseName: selectedKnowledge.kb.name,
        documentIds: selectedKnowledge.docs.map(d => d.id),
        documentCount: selectedKnowledge.docs.length > 0 
          ? selectedKnowledge.docs.length 
          : (selectedKnowledge.kb.knowledge_count || (selectedKnowledge.kb.document_count as number)),
      } : undefined,
    };
    setPendingUserMessage(tempUserMessage);

    // T30: Enable streaming for all providers, not just Gemini/Google
    const shouldStream = true;

    const legacyKbIds = selectedKnowledge.kb?.id
      ? [selectedKnowledge.kb.id]
      : (selectedKBs.length > 0 ? selectedKBs.map((kb) => kb.id) : undefined);

    // KB-2.5: best-effort warnings
    await maybeWarnKnowledgeSelection();

    if (shouldStream) {
      try {
        if (activeTreeId && nodes.length === 0) {
          toast({ title: t(lang, 'toast_tree_loading'), variant: 'destructive' });
          setIsSending(false);
          setPendingUserMessage(null);
          return;
        }
        await handleStreamingSend({
          userMessage,
          nextLevel,
          providerForTurn,
          modelForTurn,
          isBrandNewTree,
          contextProfile: contextProfileForPayload,
          memoryScope: memoryScopeForPayload,
          uploadIds: currentUploadIds,
          knowledgeBaseIds: legacyKbIds,
          knowledge: knowledgePayload,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setIsSending(false);
          setStreamingAiMessage(null);
          setPendingUserMessage(null);
          return;
        }
        const errorMsg =
          err?.code
            ? formatLlmErrorMessage({ code: err.code, provider: err.provider }, lang)
            : err?.message || t(lang, 'toast_something_wrong');
        toast({
          title: errorMsg,
          variant: 'destructive',
        });
        setInputText(userMessage);
        setPendingUserMessage(null);
        setStreamingAiMessage((prev) =>
          prev ? { ...prev, isStreaming: false, error: errorMsg } : prev
        );
        setIsSending(false);
        return;
      }
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(sessionUserId && { 'x-omytree-user-id': sessionUserId }),
      };

      if (activeTreeId && nodes.length === 0) {
        toast({ title: t(lang, 'toast_tree_loading'), variant: 'destructive' });
        setIsSending(false);
        setPendingUserMessage(null);
        return;
      }

      if (isBrandNewTree) {
        const startRes = await appApiFetch('/api/tree/start-root', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_text: userMessage,
            provider: providerForTurn,
            model: modelForTurn,
            ...(contextProfileForPayload ? { context_profile: contextProfileForPayload } : {}),
            ...(memoryScopeForPayload ? { memory_scope: memoryScopeForPayload } : {}),
            ...(knowledgePayload ? { knowledge: knowledgePayload } : {}),
            ...(legacyKbIds && legacyKbIds.length > 0 ? { knowledge_base_ids: legacyKbIds } : {}),
          }),
        });

        if (!startRes.ok) {
          const errData = await startRes.json().catch(() => ({ error: 'Failed to start tree' }));
          const errPayload = errData?.error;
          if (errPayload && typeof errPayload === 'object' && errPayload.code) {
            throw {
              code: errPayload.code,
              provider: errPayload.provider,
              message: formatLlmErrorMessage(errPayload, lang),
            };
          }
          const errorCode = typeof errData?.code === 'string'
            ? errData.code
            : typeof errData?.error === 'string'
              ? errData.error
              : null;
          if (errorCode) {
            throw {
              code: errorCode,
              message: formatLlmErrorMessage({ code: errorCode }, lang),
            };
          }
          throw new Error(errData.message || errData.error || `Failed to start tree: ${startRes.status}`);
        }

        const startData = await startRes.json();
        if (startData?.ok === false && startData?.error) {
          const detail = startData.error.detail || startData.error.message || null;
          if (detail) {
            toast({ title: detail, variant: 'destructive' });
          }
        }
        const treeId = startData.tree?.id;
        const userNodeResp: Node | undefined = startData.user_node;
        const rootNodeResp: Node | undefined = startData.root_node;
        const aiNodeResp: Node | undefined = startData.ai_node;
        const startCitations: Citation[] | undefined = Array.isArray(startData?.citations) ? startData.citations : undefined;
        if (treeId) {
          setActiveTreeId(treeId);
        }
        // Set tree topic from API response
        if (startData.tree?.topic) {
          setTreeMetaTopic(startData.tree.topic);
        }
        const nextNodes: Node[] = [];
        if (rootNodeResp) nextNodes.push(rootNodeResp);
        if (userNodeResp) nextNodes.push(userNodeResp);
        if (aiNodeResp) {
          nextNodes.push(
            startCitations && startCitations.length > 0
              ? ({ ...aiNodeResp, citations: startCitations } as any)
              : aiNodeResp
          );
        }
        setNodes(nextNodes);

        if (treeId && typeof window !== 'undefined') {
          const sidebarTree = {
            id: treeId,
            topic: startData.tree?.topic || userMessage,
            display_title: null,
            root_title: rootNodeResp?.text || startData.tree?.topic || userMessage,
            title: rootNodeResp?.text || startData.tree?.topic || userMessage,
            created_at: startData.tree?.created_at || new Date().toISOString(),
            updated_at: startData.tree?.created_at || new Date().toISOString(),
          };
          window.dispatchEvent(new CustomEvent('omytree:tree-created', { detail: { tree: sidebarTree } }));
        }

        const nextNodeId = aiNodeResp?.id ?? userNodeResp?.id ?? rootNodeResp?.id ?? null;
        if (treeId) {
          updateURL(treeId, nextNodeId);
        }
        if (nextNodeId) {
          setCurrentNodeId(nextNodeId);
        }
        // Same rationale as the streaming path: avoid toggling new-tree session off while
        // the URL may still carry ?new=1 (searchParams not yet synced), which would cause
        // the new-session effect to immediately re-enter and reset state.
        if (typeof window !== 'undefined') {
          const stillNew =
            window.location.search.includes('new=1') || window.location.search.includes('new_tree=1');
          if (!stillNew) {
            setIsNewTreeSession(false);
          }
        }
        setPendingUserMessage(null);
        return;
      }

      const res = await appApiFetch('/api/turn', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tree_id: activeTreeId,
          node_id: currentNodeId,
          user_text: userMessage,
          provider: providerForTurn,
          model: modelForTurn,
          ...(knowledgePayload ? { knowledge: knowledgePayload } : {}),
          ...(legacyKbIds && legacyKbIds.length > 0 ? { knowledge_base_ids: legacyKbIds } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errPayload = errData?.error;
        if (errPayload && typeof errPayload === 'object' && errPayload.code) {
          throw {
            code: errPayload.code,
            provider: errPayload.provider,
            message: formatLlmErrorMessage(errPayload, lang),
          };
        }
        const errorCode = typeof errData?.code === 'string'
          ? errData.code
          : typeof errData?.error === 'string'
            ? errData.error
            : null;
        if (errorCode === 'QUOTA_EXCEEDED') {
          const quotaType = errData.meta?.quota_type;
          const errorMessage = quotaType === 'daily'
            ? (lang === 'zh-CN'
              ? '今日免费请求次数已用完，明天再来吧。或者在设置中绑定自己的 API Key 继续使用。'
              : "You've used all your free requests for today. Come back tomorrow, or add your own API key in Settings to continue.")
            : (lang === 'zh-CN'
              ? '本月免费请求次数已用完，请在设置中绑定自己的 API Key 继续使用。'
              : "You've used all your free requests for this month. Add your own API key in Settings to continue.");
          throw { code: 'QUOTA_EXCEEDED', message: errorMessage };
        }
        if (errorCode === 'OFFICIAL_LLM_DISABLED') {
          const errorMessage = lang === 'zh-CN'
            ? '官方模型暂时不可用，请在设置中绑定自己的 API Key 或稍后再试。'
            : 'The official model is temporarily unavailable. Please add your own API key in Settings or try again later.';
          throw { code: 'OFFICIAL_LLM_DISABLED', message: errorMessage };
        }
        if (errorCode === 'plan_tree_limit_reached' || errorCode === 'plan_node_limit_reached') {
          throw {
            code: errorCode,
            message: formatLlmErrorMessage({ code: errorCode }, lang),
          };
        }
        const fallbackMessage =
          typeof errData?.message === 'string'
            ? errData.message
            : typeof errData?.error === 'string'
              ? errData.error
              : null;
        throw new Error(fallbackMessage || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      if (data?.ok === false && data?.error) {
        if (typeof data.error === 'object' && data.error.code) {
          throw {
            code: data.error.code,
            provider: data.error.provider,
            message: formatLlmErrorMessage(data.error, lang),
          };
        }
        const detail = data.error.detail || data.error.message || null;
        if (detail) {
          toast({ title: detail, variant: 'destructive' });
        }
      }
      const newUserNode = data.user_node;
      const newAiNode = data.ai_node;
      const citations: Citation[] | undefined = Array.isArray(data?.citations) ? data.citations : undefined;
      const newAiNodeWithCitations =
        citations && citations.length > 0 && newAiNode
          ? ({ ...newAiNode, citations } as any)
          : newAiNode;

      // Clear pending message and add real nodes
      setPendingUserMessage(null);
      setNodes((prev) => [...prev, newUserNode, newAiNodeWithCitations]);
      setCurrentNodeId(newAiNode.id);
      updateURL(activeTreeId, newAiNode.id);

      // Refresh the QA tree to show new nodes in TreeCanvas
      refreshQATree();
    } catch (err: any) {
      console.error('[tree] Turn error:', err);
      const errorMsg =
        err?.code === 'QUOTA_EXCEEDED' || err?.code === 'OFFICIAL_LLM_DISABLED'
          ? err.message
          : err?.message ||
          (err?.code
            ? formatLlmErrorMessage({ code: err.code, provider: err.provider }, lang)
            : t(lang, 'toast_something_wrong'));
      toast({
        title: errorMsg,
        variant: 'destructive',
      });
      setInputText(userMessage);
      setPendingUserMessage(null);
    } finally {
      setIsSending(false);
      pendingAttachmentsRef.current = [];
    }
  }, [
    inputText,
    isSending,
    activeTreeId,
    nodes.length,
    currentNode,
    currentNodeId,
    newTreeProfile,
    newTreeMemoryScope,
    session?.user?.enable_advanced_context,
    sessionUserId,
    updateURL,
    isNewTreeSession,
    refreshQATree,
    selectedModelOption,
    handleStreamingSend,
    lang,
    toast,
    formatLlmErrorMessage,
  ]);

  const handleAbortStream = useCallback(async () => {
    manualAbortRef.current = true;
    const mergedText = streamingRenderedTextRef.current;
    lastStreamTextRef.current = mergedText;
    const hasPartialText = Boolean(mergedText.trim());
    const abortUserId = activeStreamMeta.current?.requestUserId ?? sessionUserId ?? null;

    // T-SIDEBAR-ABORT: On abort, transition the sidebar placeholder to a real tree entry
    // if a tree was already created (prepare/start completed). Otherwise clear the placeholder.
    if (typeof window !== 'undefined') {
      const abortTreeId = activeStreamMeta.current?.treeId;
      if (abortTreeId) {
        const sidebarTree = {
          id: abortTreeId,
          topic: activeStreamMeta.current?.userText || '',
          display_title: null,
          root_title: activeStreamMeta.current?.userText || '',
          title: activeStreamMeta.current?.userText || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        window.dispatchEvent(new CustomEvent('omytree:tree-created', { detail: { tree: sidebarTree } }));
      } else {
        window.dispatchEvent(new CustomEvent('omytree:tree-create-failed'));
      }
    }

    // Reset new-tree mode so subsequent navigation/send works correctly.
    if (activeStreamMeta.current?.treeId) {
      setIsNewTreeSession(false);
      newTreeUrlSyncedRef.current = false;
    }

    // Persist current text and mark as aborted
    setStreamingAiMessage((prev) => {
      if (activeStreamMeta.current) {
        persistPendingStreamMeta({
          ...activeStreamMeta.current,
          text: mergedText,
          status: 'aborted',
        });
      }
      if (prev) {
        return { ...prev, text: mergedText, isStreaming: false };
      }
      if (!mergedText) return prev;
      return {
        id: `aborted-ai-${Date.now()}`,
        role: 'ai',
        text: mergedText,
        level: null,
        isCurrent: false,
        isRoot: false,
        isStreaming: false,
      };
    });

    // Mark abort as in-progress so the streaming flow won't re-enable sending early.
    abortInProgressRef.current = true;
    
    // If we don't have a turn_id yet (ultra-fast stop), keep the SSE connection
    // until the server emits the start event, then abort via /api/turn/:id/abort.
    const turnId = activeTurnIdRef.current;
    if (!turnId) {
      // T-bugfix: DON'T set isSending(false) yet for ultra-fast abort!
      // We must wait for the 'start' event handler to process the abort response
      // and update currentNodeId, otherwise a new send will use the old parent_id.
      pendingServerAbortRef.current = { abortUserId, hasPartialText };
      return;
    }

    // Normal abort: keep isSending=true until we have updated currentNodeId and/or loaded nodes.
    // This prevents a follow-up send from reusing an old parent_id and overwriting the visible path.
    // Abort the stream controller first (closes SSE)
    if (activeStreamController.current) {
      activeStreamController.current.abort();
    }

    // For Ollama: no server-side stream to abort. Save partial response directly to DB.
    const isOllamaAbort = (activeStreamMeta.current?.provider || '').toLowerCase() === 'ollama';
    if (isOllamaAbort) {
      if (hasPartialText && turnId) {
        try {
          const saveHeaders: HeadersInit = {
            'Content-Type': 'application/json',
            ...(abortUserId ? { 'x-omytree-user-id': abortUserId } : {}),
          };
          const saveRes = await appApiFetch('/api/turn/save-ollama', {
            method: 'POST',
            headers: saveHeaders,
            body: JSON.stringify({
              turn_id: turnId,
              ai_text: mergedText,
              ...(streamingReasoningTextRef.current ? { reasoning_text: streamingReasoningTextRef.current } : {}),
            }),
          });
          const saveData = await saveRes.json().catch(() => ({ ok: false }));
          if (saveData.ok && saveData.ai_node?.id) {
            currentNodeIdRef.current = saveData.ai_node.id;
            setCurrentNodeId(saveData.ai_node.id);
            const treeIdForUrl = activeStreamMeta.current?.treeId;
            if (treeIdForUrl) {
              updateURL(treeIdForUrl, saveData.ai_node.id);
              await reloadTree({ treeIdOverride: treeIdForUrl, nextNodeId: saveData.ai_node.id });
            }
            clearPendingStreamMeta();
            setStreamingAiMessage(null);
            refreshQATree();
          }
        } catch (saveErr) {
          console.warn('[abort] Ollama save-partial failed:', saveErr);
        }
      }
      abortInProgressRef.current = false;
      setIsSending(false);
      activeTurnIdRef.current = null;
      return;
    }

    // Non-Ollama: use server-side abort endpoint
    const headers: HeadersInit = abortUserId ? { 'x-omytree-user-id': abortUserId } : {};
    try {
      const res = await appApiFetch(`/api/turn/${turnId}/abort`, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();

        // Update URL to the new AI node if available
        if (data.ai_node?.id && data.tree_id) {
          // T-fix-3: Update ref immediately so next send uses correct parent
          currentNodeIdRef.current = data.ai_node.id;
          setCurrentNodeId(data.ai_node.id);
          updateURL(data.tree_id, data.ai_node.id);
          await reloadTree({ treeIdOverride: data.tree_id, nextNodeId: data.ai_node.id });
          clearPendingStreamMeta();
          // Clear streaming message since data is now persisted
          setStreamingAiMessage(null);
          refreshQATree();
        } else if (data.user_node?.id && data.tree_id) {
          // Fallback to user node if AI node not created yet.
          // T-fix-2: We must NOT set currentNodeId to user_node.id here!
          // If we do, the next send will use user_node as parent, skipping the AI node entirely.
          // Instead, reload tree and find the AI node that should be the child of this user node.
          const loadedNodes = await reloadTree({ treeIdOverride: data.tree_id, nextNodeId: data.user_node.id });
          refreshQATree();
          
          // T-fix-2: Find the AI node that is the child of this user node
          const aiNode = loadedNodes?.find(n => 
            (n.role === 'ai' || n.role === 'assistant') && n.parent_id === data.user_node.id
          );
          if (aiNode) {
            // AI node exists in DB, use it as currentNodeId
            // T-fix-3: Update ref immediately
            currentNodeIdRef.current = aiNode.id;
            setCurrentNodeId(aiNode.id);
            updateURL(data.tree_id, aiNode.id);
            clearPendingStreamMeta();
            setStreamingAiMessage(null);
          } else {
            // AI node not yet in DB - keep streaming placeholder and start recovery.
            // CRITICAL: Still set currentNodeId to user_node temporarily, but recovery will fix it.
            // The streaming AI placeholder will show the empty reply visually.
            currentNodeIdRef.current = data.user_node.id;
            setCurrentNodeId(data.user_node.id);
            updateURL(data.tree_id, data.user_node.id);
            if (activeStreamMeta.current) {
              // Recovery will poll until AI node appears and then update currentNodeId
              tryRecoverStream({
                ...activeStreamMeta.current,
                treeId: data.tree_id,
                turnId,
                status: 'aborted',
              });
            }
          }
        } else if (data.timeout) {
          refreshQATree();
          // T-fix: Do a synchronous reloadTree first to ensure nodes are loaded.
          if (activeStreamMeta.current?.treeId) {
            const loadedNodes = await reloadTree({ treeIdOverride: activeStreamMeta.current.treeId });
            const hasAiNode = loadedNodes && loadedNodes.some(n => n.role === 'ai');
            if (!hasAiNode) {
              tryRecoverStream({
                ...activeStreamMeta.current,
                turnId,
                status: 'aborted',
              });
            }
          }
        } else if (data.tree_id) {
          // Defensive: recover even when the abort response does not include node ids.
          // T-fix: Always do a synchronous reloadTree to ensure nodes are populated.
          const loadedNodes = await reloadTree({ treeIdOverride: data.tree_id });
          const hasAiNode = loadedNodes && loadedNodes.some(n => n.role === 'ai');
          if (!hasAiNode && activeStreamMeta.current) {
            tryRecoverStream({
              ...activeStreamMeta.current,
              treeId: data.tree_id,
              turnId,
              status: 'aborted',
            });
          }
        }
      }
    } catch (err) {
      console.warn('[abort] Failed to notify server:', err);
    } finally {
      // Safe to unlock sending now (abort response processed or failed).
      abortInProgressRef.current = false;
      setIsSending(false);
    }

    activeTurnIdRef.current = null;
  }, [
    persistPendingStreamMeta,
    setIsSending,
    sessionUserId,
    clearPendingStreamMeta,
    refreshQATree,
    updateURL,
    reloadTree,
    tryRecoverStream,
    setIsNewTreeSession,
  ]);

  const handlePruneBranch = useCallback(async () => {
    if (!currentNode || !currentNode.parent_id || !activeTreeId) {
      return;
    }
    setIsPruning(true);
    const parentId = currentNode.parent_id;

    try {
      const headers: HeadersInit = sessionUserId ? { 'x-omytree-user-id': sessionUserId } : {};
      const res = await appApiFetch(`/api/node/${currentNode.id}/prune`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to prune branch: ${res.status}`);
      }

      currentNodeIdRef.current = parentId;
      setPruneDialogOpen(false);
      setCurrentNodeId(parentId);
      updateURL(activeTreeId, parentId);
      await reloadTree({ nextNodeId: parentId, treeIdOverride: activeTreeId });
      // Sync TreeCanvas: refresh QA tree data so pruned nodes disappear immediately
      refreshQATree();

      toast({
        title: t(lang, 'toast_branch_deleted'),
        description: t(lang, 'toast_branch_deleted_desc'),
      });
    } catch (err) {
      console.error('[tree] Failed to prune branch:', err);
      toast({
        title: t(lang, 'toast_branch_delete_failed'),
        description: t(lang, 'toast_branch_delete_failed_desc'),
        variant: 'destructive',
      });
    } finally {
      setIsPruning(false);
    }
  }, [currentNode, activeTreeId, reloadTree, refreshQATree, sessionUserId, toast, updateURL]);

  // T28-1: Handle "Delete from here" action
  const handleDeleteFromClick = useCallback((messageId: string) => {
    // Find the node to ensure it's a valid user node (not root)
    const node = nodes.find(n => n.id === messageId);
    if (!node || node.role !== 'user' || !node.parent_id) {
      toast({
        title: t(lang, 'toast_cannot_delete'),
        description: t(lang, 'toast_cannot_delete_desc'),
        variant: 'destructive',
      });
      return;
    }
    setDeleteFromNodeId(messageId);
    setDeleteFromDialogOpen(true);
  }, [nodes, toast]);

  const handleDeleteFromConfirm = useCallback(async () => {
    if (!deleteFromNodeId || !activeTreeId) return;

    setIsDeleting(true);
    try {
      const headers: HeadersInit = sessionUserId ? { 'x-omytree-user-id': sessionUserId } : {};
      await executeDelete(deleteFromNodeId, headers);
    } catch (err: any) {
      console.error('[tree] Failed to delete from:', err);
      toast({
        title: t(lang, 'delete_failed'),
        description: err.message || t(lang, 'delete_failed_retry'),
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  }, [deleteFromNodeId, activeTreeId, sessionUserId, toast, lang]);

  // Execute the actual deletion
  const executeDelete = useCallback(async (nodeId: string, headers: HeadersInit) => {
    setIsDeleting(true);
    try {
      const res = await appApiFetch(`/api/node/${nodeId}/delete-from`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `Failed to delete: ${res.status}`);
      }

      const data = await res.json();
      const navigateToId = data.navigate_to_node_id;

      setDeleteFromDialogOpen(false);
      setDeleteFromNodeId(null);

      if (navigateToId) {
        currentNodeIdRef.current = navigateToId;
        setCurrentNodeId(navigateToId);
        updateURL(activeTreeId!, navigateToId);
      }

      await reloadTree({ nextNodeId: navigateToId, treeIdOverride: activeTreeId! });
      // Sync TreeCanvas: refresh QA tree data so deleted nodes disappear immediately
      refreshQATree();

      toast({
        title: t(lang, 'toast_deleted'),
        description: `${t(lang, 'toast_deleted_desc')}（${data.deleted_count}）`,
      });
    } catch (err: any) {
      console.error('[tree] Failed to execute delete:', err);
      toast({
        title: t(lang, 'toast_delete_failed_generic'),
        description: err.message || t(lang, 'toast_delete_failed_retry'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [activeTreeId, sessionUserId, toast, updateURL, reloadTree, refreshQATree, lang]);

  // T28-1: Handle "Edit question" action
  const handleEditQuestionClick = useCallback((messageId: string, currentText: string) => {
    // Find the node to ensure it's a valid user node (not root)
    const node = nodes.find(n => n.id === messageId);
    if (!node || node.role !== 'user') {
      toast({
        title: t(lang, 'toast_cannot_edit'),
        description: t(lang, 'toast_cannot_edit_user_only'),
        variant: 'destructive',
      });
      return;
    }
    setEditNodeId(messageId);
    setEditNewText(currentText);
    setEditAttachments(node.attachments || []);
    setEditPendingUploadIds([]);
  }, [nodes, toast]);

  const handleEditQuestionConfirm = useCallback(async () => {
    if (!editNodeId || !activeTreeId || !editNewText.trim()) return;

    const trimmedText = editNewText.trim();
    const targetNode = nodes.find(n => n.id === editNodeId);
    if (!targetNode || targetNode.role !== 'user') {
      toast({
        title: t(lang, 'toast_cannot_edit'),
        description: t(lang, 'toast_cannot_edit_user_only'),
        variant: 'destructive',
      });
      return;
    }

    // 从 qaTree 中查找对应的 QANode (它包含 provider/model 信息)
    // editNodeId 可能是 user_node_id 或其他 node id,需要在 qaTree 中查找
    const qaNode = qaTree?.nodes.find(
      n => n.user_node_id === editNodeId ||
        n.ai_node_id === editNodeId ||
        n.id === editNodeId
    );

    const payload: any = { new_text: trimmedText };
    if (qaNode?.provider) {
      payload.provider = qaNode.provider;
    }
    if (qaNode?.model) {
      payload.model = qaNode.model;
    }
    if (qaNode?.is_byok !== undefined) {
      payload.is_byok = qaNode.is_byok;
    }

    // T85: Attachments during edit (allow add/remove)
    payload.upload_ids = (editAttachments || []).map((a) => a.id).filter(Boolean);

    const provider = qaNode?.provider ?? null;
    const model = qaNode?.model ?? null;
    const isByok = qaNode?.is_byok ?? null;
    const nextLevel = typeof targetNode.level === 'number' ? targetNode.level + 1 : null;
    const originalText = targetNode.text || '';

    if (activeStreamController.current) {
      activeStreamController.current.abort();
    }
    const controller = new AbortController();
    activeStreamController.current = controller;
    manualAbortRef.current = false;

    // RAF 批处理已移除

    let streamCompleted = false;
    let keepPendingMeta = false;
    let streamTreeId = activeTreeId;
    let streamAiNodeId: string | null = null;
    let streamStarted = false;
    const pendingMeta: StreamMeta = {
      treeId: activeTreeId,
      parentNodeId: editNodeId,
      requestParentId: editNodeId,
      requestUserId: sessionUserId,
      provider,
      model,
      isByok,
      startedAt: new Date().toISOString(),
      turnId: null,
      text: '',
      userText: trimmedText,
      status: 'active',
    };
    persistPendingStreamMeta(pendingMeta);
    activeTurnIdRef.current = null;
    lastStreamTextRef.current = '';
    streamingRenderedTextRef.current = '';
    streamingPersistLastMsRef.current = 0;
    streamingServerDoneRef.current = false;

    setIsEditing(true);
    setPendingUserMessage(null);

    setNodes((prev) =>
      prev.map((n) => (n.id === editNodeId ? { ...n, text: trimmedText, attachments: editAttachments } : n))
    );
    currentNodeIdRef.current = editNodeId;
    setCurrentNodeId(editNodeId);
    updateURL(activeTreeId, editNodeId);

    const streamingPlaceholderId = `streaming-ai-${Date.now()}`;
    activeStreamingPlaceholderIdRef.current = streamingPlaceholderId;

    setStreamingAiMessage({
      id: streamingPlaceholderId,
      role: 'ai',
      text: '',
      level: nextLevel,
      isCurrent: true, // Show as current during streaming (matches final state)
      isRoot: false,
      provider,
      model,
      isByok,
      sourceLabel: provider ? buildSourceLabel(provider, model, isByok) : null,
      isStreaming: true,
    });

    try {
      await runSseStream(
        `/api/node/${editNodeId}/edit-question/stream`,
        payload,
        controller,
        (event: any) => {
          if (!event || typeof event !== 'object') return;
          if (manualAbortRef.current) {
            if (event.type === 'delta' || event.type === 'done' || event.type === 'error') {
              return;
            }
          }
          switch (event.type) {
            case 'start': {
              streamStarted = true;
              if (event.turn_id) {
                activeTurnIdRef.current = event.turn_id;
                if (activeStreamMeta.current) {
                  persistPendingStreamMeta({
                    ...activeStreamMeta.current,
                    turnId: event.turn_id,
                  });
                }
              }
              if (event.user_node) {
                upsertNode(event.user_node);
                currentNodeIdRef.current = event.user_node.id;
                setCurrentNodeId(event.user_node.id);
                updateURL(activeTreeId, event.user_node.id);
              }
              setEditNodeId(null);
              setEditNewText('');
              setEditAttachments([]);
              setEditPendingUploadIds([]);
              break;
            }
            case 'delta': {
              if (typeof event.text === 'string' && event.text.length > 0) {
                enqueueStreamingText(event.text);
              }
              break;
            }
            case 'done': {
              streamCompleted = true;
              streamingServerDoneRef.current = true;
              // Notify sidebar to re-sort this conversation to top
              if (typeof window !== 'undefined' && activeTreeId) {
                window.dispatchEvent(new CustomEvent('omytree:tree-updated', {
                  detail: { treeId: activeTreeId, updated_at: new Date().toISOString() },
                }));
              }
              const realAiNodeId = event.ai_node?.id || null;
              if (realAiNodeId) {
                activeStreamingPlaceholderIdRef.current = realAiNodeId;
              }
              setStreamingAiMessage((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  ...(realAiNodeId ? { id: realAiNodeId } : {}),
                  isStreaming: false,
                  isCurrent: true,
                };
              });

              if (event.user_node) {
                upsertNode(event.user_node);
              }
              if (event.ai_node) {
                // Same protection as the main streaming flow: avoid upserting an
                // empty ai_node.text which would make the regenerated answer look blank.
                const incomingText = (event.ai_node as any)?.text;
                const streamedText = (lastStreamTextRef.current || '').trimEnd();
                const shouldPatchText =
                  (typeof incomingText !== 'string' || incomingText.trim().length === 0) &&
                  streamedText.trim().length > 0;

                const aiNodeToUpsert = shouldPatchText
                  ? { ...event.ai_node, text: streamedText }
                  : event.ai_node;

                upsertNode(aiNodeToUpsert);
                streamAiNodeId = event.ai_node.id;
                lastCompletedAiNodeIdRef.current = event.ai_node.id;
                currentNodeIdRef.current = event.ai_node.id;
                setCurrentNodeId(event.ai_node.id);
                updateURL(activeTreeId, event.ai_node.id);
              }
              activeTurnIdRef.current = null;
              clearPendingStreamMeta();
              stopRecoveryTimer();
              refreshQATree();

              setTimeout(() => {
                reloadTree({ nextNodeId: streamAiNodeId || editNodeId, treeIdOverride: activeTreeId ?? undefined });
              }, 300);

              toast({
                title: t(lang, 'toast_question_updated'),
                description: t(lang, 'toast_question_updated_desc'),
              });

              // If there's no buffered text left to reveal, finalize immediately.
              finalizeStreamingPlaybackIfReady();
              break;
            }
            case 'error': {
              streamCompleted = true;
              const message =
                event.error?.message ||
                (event.error?.code
                  ? formatLlmErrorMessage(
                    { code: event.error.code, provider: event.error.provider },
                    lang
                  )
                  : t(lang, 'toast_gen_failed'));
              // Stop streaming and flush text so users don't lose already-received output.
              setStreamingAiMessage((prev) =>
                prev ? { ...prev, isStreaming: false, error: message } : prev
              );
              if (!streamStarted) {
                setNodes((prev) => prev.map((n) => (n.id === editNodeId ? { ...n, text: originalText } : n)));
              }
              clearPendingStreamMeta();
              activeTurnIdRef.current = null;
              stopRecoveryTimer();
              toast({
                title: message,
                variant: 'destructive',
              });
              controller.abort();
              break;
            }
            default:
              break;
          }
        }
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (manualAbortRef.current) {
          manualAbortRef.current = false;
          keepPendingMeta = true;
          setStreamingAiMessage((prev) => {
            const mergedText = streamingRenderedTextRef.current;
            lastStreamTextRef.current = mergedText;
            if (activeStreamMeta.current) {
              persistPendingStreamMeta({
                ...activeStreamMeta.current,
                text: mergedText,
                userText: activeStreamMeta.current.userText ?? trimmedText,
                status: 'aborted',
              });
            }
            if (prev) return { ...prev, text: mergedText, isStreaming: false };
            if (!mergedText) return prev;
            return {
              id: `aborted-ai-${Date.now()}`,
              role: 'ai',
              text: mergedText,
              level: nextLevel,
              isCurrent: false,
              isRoot: false,
              isStreaming: false,
            };
          });
          setPendingUserMessage(null);
          activeTurnIdRef.current = null;
          stopRecoveryTimer();
          if (activeStreamMeta.current?.turnId) {
            tryRecoverStream(activeStreamMeta.current);
          }
          return;
        }
        if (activeStreamMeta.current) {
          tryRecoverStream(activeStreamMeta.current);
        }
        setStreamingAiMessage((prev) =>
          prev ? { ...prev, isStreaming: false } : prev
        );
        setPendingUserMessage(null);
        return;
      }
      const message =
        err?.code
          ? formatLlmErrorMessage({ code: err.code, provider: err.provider }, lang)
          : err?.message || t(lang, 'toast_stream_error');
      setStreamingAiMessage((prev) =>
        prev ? { ...prev, isStreaming: false, error: message } : prev
      );
      if (!streamStarted) {
        setNodes((prev) => prev.map((n) => (n.id === editNodeId ? { ...n, text: originalText } : n)));
      }
      setPendingUserMessage(null);
      toast({ title: message, variant: 'destructive' });
      streamCompleted = true;
    } finally {
      setIsEditing(false);
      activeStreamController.current = null;
      if (streamCompleted) {
        if (!keepPendingMeta) {
          clearPendingStreamMeta();
        }
        stopRecoveryTimer();
      }
      if (!streamCompleted) {
        // Keep partial content visible but stop streaming animation.
        setStreamingAiMessage((prev) =>
          prev ? { ...prev, text: streamingRenderedTextRef.current, isStreaming: false } : prev
        );
        setPendingUserMessage(null);
        const targetTreeId = streamTreeId || activeTreeId;
        if (targetTreeId) {
          setTimeout(async () => {
            const nodesAfter = await reloadTree({
              treeIdOverride: targetTreeId,
              nextNodeId: streamAiNodeId || editNodeId,
            });
            if (nodesAfter && nodesAfter.some((n) => n.role === 'ai' && (n.text?.length ?? 0) > 0)) {
              setStreamingAiMessage(null);
            }
          }, 300);
        }
      }
    }
  }, [
    editNodeId,
    activeTreeId,
    editNewText,
    nodes,
    qaTree,
    buildSourceLabel,
    runSseStream,
    persistPendingStreamMeta,
    clearPendingStreamMeta,
    enqueueStreamingText,
    finalizeStreamingPlaybackIfReady,
    stopRecoveryTimer,
    tryRecoverStream,
    reloadTree,
    updateURL,
    toast,
    lang,
    formatLlmErrorMessage,
    refreshQATree,
    sessionUserId,
  ]);

  const handleEditCancel = useCallback(() => {
    setEditNodeId(null);
    setEditNewText('');
    setEditAttachments([]);
    setEditPendingUploadIds([]);
  }, []);

  return (
    <LayoutGroup>
      <div className="flex flex-col bg-background overflow-hidden" style={{ height: '100%', maxHeight: '100dvh' }}>
        {/* Header - only show in standalone mode */}
        {layoutVariant === 'standalone' && (
          <header className="shrink-0 border-b border-border glass-panel rounded-none glass-stable">
            <div className="flex h-14 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">oMyTree Demo</h1>
                {currentNode && (
                  <div className="flex items-center gap-2 text-sm">
                    <motion.span
                      layoutId="user-query-text"
                      className="inline-block rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {currentIndex >= 0 ? `#${currentIndex}` : 'Root'}{' '}
                      {currentNode.role === 'system'
                        ? 'Root'
                        : `"${currentNode.text.substring(0, 30)}..."`}
                    </motion.span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <a
                  href="/app"
                  className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Back
                </a>
              </div>
            </div>
          </header>
        )}

        {/* Main Content - chat + right tree panel */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 min-w-[320px] md:min-w-[420px] flex flex-col min-h-0 relative">
            <ChatPane
              ref={chatPaneRef}
              treeTitle={treeTopic || 'Conversation'}
              isNewTreeSession={isNewTreeSession}
              nodeLabel={nodeLabel}
              contextProfile={treeContextProfile as any}
              memoryScope={treeMemoryScope as any}
              treeId={activeTreeId}
              currentNodeId={currentNodeId}
              sessionUserId={sessionUserId}
              isUsingByok={isUsingByokProvider}
              advancedEnabled={advancedEnabled}
              keyframes={Object.values(keyframesMap)}
              onUnpinKeyframe={(nodeId) => handleToggleKeyframePin(nodeId, true)}
              onUpdateKeyframeAnnotation={handleUpdateKeyframeAnnotation}
              newTreeProfile={newTreeProfile}
              newTreeScope={newTreeMemoryScope}
              onNewTreeProfileChange={isNewTreeSession ? (val) => {
                setNewTreeProfile(val);
                setNewTreeProfileError(null);
              } : undefined}
              onNewTreeScopeChange={isNewTreeSession ? (val) => setNewTreeMemoryScope(val) : undefined}
              profileError={isNewTreeSession ? newTreeProfileError : null}
              onExportJson={activeTreeId ? async () => {
                try {
                  await downloadTreeJson(activeTreeId, sessionUserId || undefined);
                  toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_json_desc') });
                } catch (err) {
                  console.error('export failed', err);
                  toast({ title: t(lang, 'toast_export_tree_failed'), variant: 'destructive' });
                }
              } : undefined}
              onExportMarkdown={activeTreeId ? async () => {
                try {
                  await downloadTreeMarkdown(activeTreeId, sessionUserId || undefined);
                  toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_md_desc') });
                } catch (err) {
                  console.error('export md failed', err);
                  toast({ title: t(lang, 'toast_export_md_failed'), variant: 'destructive' });
                }
              } : undefined}
              isShared={!!shareToken}
              onCopyShareLink={handleCopyShareLink}
              onToggleShare={handleToggleShare}
              messages={chatMessages}
              selectedKBs={selectedKBs}
              onAddKB={handleAddKB}
              onRemoveKB={handleRemoveKB}
              selectedKnowledge={selectedKnowledge}
              onApplyKnowledge={handleApplyKnowledge}
              onRemoveKnowledgeDoc={handleRemoveKnowledgeDoc}
              onOpenKnowledgeManager={handleOpenKnowledgeManager}
              onToggleReasoningVisible={handleToggleReasoningVisible}
              onToggleGroundingVisible={handleToggleGroundingVisible}
              inputValue={inputText}
              onInputChange={(value) => {
                setInputText(value);
              }}
              onSend={handleSendMessage}
              isSending={isSending}
              autoFocusInput={isNewTreeSession}
              lang={lang}
              onEditQuestion={handleEditQuestionClick}
              editingMessageId={editNodeId}
              editDraft={editNewText}
              onEditDraftChange={setEditNewText}
              onEditCancel={handleEditCancel}
              onEditConfirm={handleEditQuestionConfirm}
              editSubmitting={isEditing}
              editAttachments={editAttachments}
              editPendingUploads={editPendingUploads}
              onEditRemoveAttachment={handleEditRemoveAttachment}
              onEditUploadFiles={handleEditUploadFiles}
              onEditRemovePendingUpload={handleEditRemovePendingUpload}
              onEditRetryPendingUpload={handleEditRetryPendingUpload}
              onDeleteFrom={handleDeleteFromClick}
              messageActionsDisabled={isSending || isEditing || isDeleting || isPruning}
              keyframesMap={keyframesMap}
              onCreateInlineAnnotation={handleCreateInlineAnnotation}
              onUpdateInlineAnnotation={handleUpdateInlineAnnotation}
              onDeleteInlineAnnotation={handleDeleteInlineAnnotation}
              modelsLoading={modelsLoading}
              modelError={modelError}
              // T29-QA-5: Two-segment picker props
              providerOptions={providerOptions}
              selectedProviderId={selectedProviderId}
              selectedModelIdNew={selectedModelIdNew}
              onProviderChange={handleProviderChange}
              onModelChangeNew={handleModelChangeNew}
              // T30: Mobile tree view
              onOpenMobileTree={() => setMobileTreeOpen(true)}
              onOpenMobileSidebar={onOpenMobileSidebar}
              onAbortStream={handleAbortStream}
              // T61: Memo panel anchor click
              onSourceClick={handleSourceClick}
              // T85: File upload
              onFileUpload={handleFileUpload}
              isUploading={isUploading}
              uploadChips={uploadChips}
              onRemoveUpload={handleRemoveUpload}
              onRetryUpload={handleRetryUpload}
              uploadAccept={uploadConstraints.accept}
              uploadFormatsHint={uploadFormatsHint}
              uploadMaxSizeHint={uploadMaxSizeHint}
              // T87: Upload preview
              onPreviewUpload={fileProcessingMode === 'local' ? handlePreviewUpload : undefined}
              uploadHint={uploadHint}
              // T93-12: Outcome selection
              onSelectOutcome={handleSelectOutcome}
              // T93-17: Outcome detail
              activeOutcomeId={activeOutcomeId}
              activeOutcomeDetail={activeOutcomeDetail}
              onOutcomeDetailChange={handleOutcomeDetailChange}
              onClearOutcome={handleClearOutcome}
            />

            {/* T87: Upload Preview Panel */}
            <UploadPreviewPanel
              uploadId={previewUploadId}
              open={previewOpen}
              onClose={handleClosePreview}
              userId={sessionUserId}
            />

            {/* Delete Branch Confirmation Dialog */}
            <AlertDialog open={pruneDialogOpen} onOpenChange={setPruneDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t(lang, 'delete_branch_title')}</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-1">
                    <p>{t(lang, 'delete_branch_desc')}</p>
                    <p>{t(lang, 'delete_branch_warning')}</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPruning}>{t(lang, 'delete_branch_cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handlePruneBranch}
                    disabled={isPruning}
                    className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
                  >
                    {isPruning ? t(lang, 'delete_branch_deleting') : t(lang, 'delete_branch_confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* T28-1: Delete From Here Confirmation Dialog */}
            <AlertDialog open={deleteFromDialogOpen} onOpenChange={setDeleteFromDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t(lang, 'delete_from_here_title')}</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-1">
                    <p>{t(lang, 'delete_from_here_desc')}</p>
                    <p>{t(lang, 'delete_from_here_warning')}</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>{t(lang, 'delete_branch_cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteFromConfirm}
                    disabled={isDeleting}
                    className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
                  >
                    {isDeleting ? t(lang, 'delete_branch_deleting') : t(lang, 'delete_branch_confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>

          {/* T29-0: Resizable divider between chat and tree panel (desktop only) */}
          {isTreePanelOpen !== null && isTreePanelOpen && treeDrawerWidth !== null && (
            <ResizeHandle
              onResize={setTreeDrawerWidth}
              onResizeEnd={handleTreeDrawerResizeEnd}
              minWidth={TREE_DRAWER_MIN_WIDTH}
              maxWidth={treeDrawerMaxWidth}
              direction="right"
            />
          )}

          {/* T56-1: Right Drawer with Tabs (Desktop only) - collapsible drawer */}
          {/* Wait for localStorage hydration before rendering to prevent flash */}
          {isTreePanelOpen !== null && treeDrawerWidth !== null && (
            <RightDrawerTabs
              isOpen={isTreePanelOpen}
              onToggle={handleToggleTreePanel}
              treeTitle={treeTopic}
              treeId={activeTreeId}
              qaNodes={qaTree?.nodes || []}
              selectedQANodeId={selectedQANodeId}
              onSelectNode={handleNodeClick}
              onCreateOutcome={() => chatPaneRef.current?.openOutcomeCreateModal()}
              width={treeDrawerWidth}
              keyframeNodeIds={keyframeNodeIds}
              lang={lang}
              activeOutcomePathIds={activeOutcomePathIds}
              activeOutcomeKeyframeIds={activeOutcomeKeyframeIds}
            />
          )}

          {/* T30: Mobile tree view Sheet */}
          <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
            <SheetContent side="right" className="w-[320px] p-0" hideClose>
              <SheetHeader className="px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <SheetTitle className="text-sm font-medium truncate">
                      {treeTopic || t(lang, 'tree_untitled')}
                    </SheetTitle>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                      </Button>
                    </SheetClose>
                  </div>
                </div>
                <SheetDescription className="sr-only">Mobile tree view</SheetDescription>
              </SheetHeader>

              {/* Tree canvas */}
              <div className="h-[calc(100dvh-5rem)] overflow-hidden">
                {activeTreeId ? (
                  <TreeCanvas
                    nodes={qaTree?.nodes || []}
                    selectedId={selectedQANodeId}
                    onSelect={(nodeId) => {
                      // T54-1: Mobile tree panel stays open after node click
                      // Dialog still navigates to the clicked node
                      handleNodeClick(nodeId);
                      // Note: We intentionally do NOT close the mobile tree panel now
                      // Previously: setMobileTreeOpen(false);
                    }}
                    onCreateOutcome={() => chatPaneRef.current?.openOutcomeCreateModal()}
                    keyframeNodeIds={keyframeNodeIds}
                    lang={lang}
                    isMobile={true}
                    activeOutcomePathIds={activeOutcomePathIds}
                    activeOutcomeKeyframeIds={activeOutcomeKeyframeIds}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-6 text-center">
                    {t(lang, 'tree_view_empty')}
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* T56-2: Context Drawer - shows node preview when source chip is clicked */}
        <ContextDrawer
          isOpen={contextDrawerOpen}
          onClose={() => {
            setContextDrawerOpen(false);
            setContextDrawerSource(null);
          }}
          source={contextDrawerSource}
          node={contextDrawerNode}
          onContinue={handleContextDrawerContinue}
          onBranch={handleContextDrawerBranch}
          evidence={drawerEvidenceList}
          evidenceLoading={drawerEvidenceLoading}
          treeEvidence={evidence}
          onAttachEvidence={(evidenceId) => handleAttachEvidenceToNode(evidenceId, contextDrawerNodeId)}
          onEvidenceClick={setActiveEvidenceId}
          evidenceGaps={evidenceGaps}
          evidenceGapsLoading={outcomeDraftLoading}
          lang={lang}
        />
        <EvidenceDrawer
          evidence={activeEvidence}
          nodes={activeEvidenceNodes}
          isOpen={Boolean(activeEvidence)}
          onClose={() => setActiveEvidenceId(null)}
          onAttach={
            activeEvidence
              ? () => handleAttachEvidenceToNode(activeEvidence.id, currentNodeId)
              : undefined
          }
          onSourceClick={handleSourceClick}
          isLoadingNodes={activeEvidenceNodesLoading}
          currentNodeLabel={currentNodeDisplay || undefined}
          lang={lang}
        />

        <style jsx global>{`
        @keyframes demo-node-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      </div>
    </LayoutGroup>
  );
}
