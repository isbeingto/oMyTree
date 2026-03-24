import type { paths, components } from "./types/openapi";
import { getBackendUrl } from "./base-url";

import type {
  ApiOkNoDataResponse,
  ApiOkResponse,
  ApiOkResponseWithMeta,
  KnowledgeBase,
  KnowledgeContext,
  KnowledgeDocument,
  KnowledgeSearchChunk,
  PaginationMeta,
} from "./types/knowledge";

export type {
  ApiOkNoDataResponse,
  ApiOkResponse,
  ApiOkResponseWithMeta,
  KnowledgeBase,
  KnowledgeContext,
  KnowledgeDocument,
  KnowledgeSearchChunk,
  PaginationMeta,
} from "./types/knowledge";

import { logEvent } from "./observe";

const EXPLICIT_API_BASE = typeof window === "undefined"
  ? process.env.NEXT_PUBLIC_API_BASE || getBackendUrl()
  : (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE)
    ? process.env.NEXT_PUBLIC_API_BASE.replace(/\/+$/, "")
    : null;

const RELATIVE_API_ROOT = "/api";

function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // On server side, always use full URL
  if (typeof window === "undefined") {
    const baseUrl = EXPLICIT_API_BASE || getBackendUrl();
    return `${baseUrl}${normalizedPath}`;
  }
  // On client side, use relative URL if no explicit base
  if (EXPLICIT_API_BASE) {
    return `${EXPLICIT_API_BASE}${normalizedPath}`;
  }
  return `${RELATIVE_API_ROOT}${normalizedPath}`;
}

type ReplayRequest = paths["/api/events/replay"]["post"]["requestBody"]["content"]["application/json"];
type ReplayResponse = paths["/api/events/replay"]["post"]["responses"][200]["content"]["application/json"];

type TreeResponse = paths["/api/tree/{id}"]["get"]["responses"][200]["content"]["application/json"];

// Outcomes v2
export type Outcome = components["schemas"]["Outcome"];
export type OutcomeCreateRequest = components["schemas"]["OutcomeCreateRequest"];
export type OutcomeCreateResponse = components["schemas"]["OutcomeCreateResponse"];
export type OutcomePreviewRequest = components["schemas"]["OutcomePreviewRequest"];
export type OutcomePreviewResponse = components["schemas"]["OutcomePreviewResponse"];
export type OutcomeDetailResponse = components["schemas"]["OutcomeDetailResponse"];
export type OutcomePatchRequest = components["schemas"]["OutcomePatchRequest"];
export type OutcomeRegenerateResponse = components["schemas"]["OutcomeRegenerateResponse"];
export type OutcomeAsset = components["schemas"]["OutcomeAsset"];
export type OutcomePublishResponse = {
  ok?: boolean;
  asset?: OutcomeAsset;
};
export type OutcomeUnpublishResponse = {
  ok?: boolean;
};

type ListOutcomesResponse =
  paths["/api/tree/{treeId}/outcomes"]["get"]["responses"][200]["content"]["application/json"];

function extractTraceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as Record<string, unknown>).trace_id;
  return typeof candidate === "string" ? candidate : null;
}

type RequestOptions = {
  userId?: string | null;
  workspaceId?: string | null;
};

function normalizeWorkspaceIdHeader(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Lightweight UUID check (avoid importing uuid in web bundle)
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidLike.test(trimmed) ? trimmed : null;
}

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeWorkspaceIdHeader(window.localStorage.getItem("omytree.activeWorkspaceId"));
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit, options: RequestOptions = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  const body = init.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isFormData) {
    // Let fetch/browser set the multipart boundary automatically.
    headers.delete("Content-Type");
  }
  if (options.userId) {
    headers.set("x-omytree-user-id", options.userId);
  }
  if (!headers.has("x-omytree-workspace-id")) {
    const fromOptions = normalizeWorkspaceIdHeader(options.workspaceId);
    const fromStorage = fromOptions ? null : getWorkspaceIdFromStorage();
    const workspaceId = fromOptions || fromStorage;
    if (workspaceId) {
      headers.set("x-omytree-workspace-id", workspaceId);
    }
  }
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers
  });

  const responseClone = response.clone();
  const headerTraceId = response.headers.get("x-trace-id");

  const toCleanText = (input: string) => {
    const stripped = input
      // Remove HTML tags to avoid dumping whole error pages into UI.
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.length > 400 ? `${stripped.slice(0, 400)}…` : stripped;
  };

  if (!response.ok) {
    let bodyTraceId: string | null = null;
    let errorCode: string | null = null;
    let errorHint: string | null = null;
    let errorText: string | null = null;
    let errorDetail: unknown = null;
    try {
      const cloneJson = await responseClone.json();
      bodyTraceId = extractTraceId(cloneJson);
      if (cloneJson && typeof cloneJson === "object") {
        const record = cloneJson as Record<string, unknown>;
        if (typeof record.code === "string") errorCode = record.code;
        if (typeof record.hint === "string") errorHint = record.hint;
        // api/lib/errors.js uses { error, code, hint, detail }
        if (typeof record.error === "string") errorText = record.error;
        // Fallbacks for other envelopes
        if (!errorText && typeof record.message === "string") errorText = record.message;

        if ("detail" in record) {
          errorDetail = record.detail;
        }
      }
    } catch {
      bodyTraceId = null;
    }

    let text = "";
    try {
      text = await response.text();
    } catch {
      text = "";
    }

    const traceId = headerTraceId ?? bodyTraceId;
    const baseMessage = errorText || toCleanText(text) || `Request failed with ${response.status}`;
    const hintLine = errorHint && errorHint.trim() ? ` Hint: ${errorHint.trim()}` : "";
    const codeLine = errorCode && errorCode.trim() ? ` (${errorCode.trim()})` : "";
    const traceLine = traceId ? ` [trace ${traceId}]` : "";

    logEvent({
      route: path,
      method,
      status: response.status,
      traceId
    });

    const err = new Error(`${baseMessage}${codeLine}${hintLine}${traceLine}`);
    (err as any).status = response.status;
    (err as any).code = errorCode;
    (err as any).hint = errorHint;
    (err as any).traceId = traceId;
    (err as any).detail = errorDetail;
    throw err;
  }

  const data = (await response.json()) as T;
  const traceId = headerTraceId ?? extractTraceId(data);

  logEvent({
    route: path,
    method,
    status: response.status,
    traceId
  });

  return data;
}

export async function replay(body: ReplayRequest, options: RequestOptions = {}): Promise<ReplayResponse> {
  return request<ReplayResponse>("/events/replay", {
    method: "POST",
    body: JSON.stringify(body)
  }, options);
}

export async function getTree(id: string, options: RequestOptions = {}): Promise<TreeResponse> {
  return request<TreeResponse>(`/tree/${encodeURIComponent(id)}`, {
    method: "GET"
  }, options);
}

// ============================================================
// Workspaces API (P2-API-001)
// ============================================================

export type WorkspaceSummary = {
  id: string;
  kind: "personal" | "team";
  name: string;
  owner_user_id: string;
  role: "owner" | "admin" | "member";
  is_active: boolean;
  weknora_configured: boolean;
  created_at: string;
  updated_at: string;
};

export type ListWorkspacesResponse = {
  ok: boolean;
  data: WorkspaceSummary[];
  active_workspace_id: string;
  trace_id?: string;
};

export type ActivateWorkspaceResponse = {
  ok: boolean;
  active_workspace_id: string;
  trace_id?: string;
};

export async function listWorkspaces(options: RequestOptions = {}): Promise<ListWorkspacesResponse> {
  return request<ListWorkspacesResponse>(
    `/workspaces`,
    { method: "GET", cache: "no-store" },
    options
  );
}

export async function activateWorkspace(workspaceId: string, options: RequestOptions = {}): Promise<ActivateWorkspaceResponse> {
  return request<ActivateWorkspaceResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/activate`,
    { method: "POST" },
    options
  );
}

// ============================================================
// Outcomes v2
// ============================================================

export async function listOutcomes(
  treeId: string,
  params: { limit?: number; offset?: number } = {},
  options: RequestOptions = {}
): Promise<ListOutcomesResponse> {
  const qs = new URLSearchParams();
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<ListOutcomesResponse>(`/tree/${encodeURIComponent(treeId)}/outcomes${suffix}`, {
    method: 'GET',
    cache: 'no-store',
  }, options);
}

export async function createOutcome(
  treeId: string,
  body: OutcomeCreateRequest,
  options: RequestOptions = {}
): Promise<OutcomeCreateResponse> {
  return request<OutcomeCreateResponse>(`/tree/${encodeURIComponent(treeId)}/outcomes`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, options);
}

export async function previewOutcome(
  treeId: string,
  body: OutcomePreviewRequest,
  options: RequestOptions = {}
): Promise<OutcomePreviewResponse> {
  return request<OutcomePreviewResponse>(`/tree/${encodeURIComponent(treeId)}/outcomes/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, options);
}

export async function getOutcome(
  treeId: string,
  outcomeId: string,
  options: RequestOptions = {}
): Promise<OutcomeDetailResponse> {
  return request<OutcomeDetailResponse>(`/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`, {
    method: 'GET',
    cache: 'no-store',
  }, options);
}

export async function patchOutcome(
  treeId: string,
  outcomeId: string,
  body: OutcomePatchRequest,
  options: RequestOptions = {}
): Promise<{ ok?: boolean; outcome?: Outcome }> {
  return request<{ ok?: boolean; outcome?: Outcome }>(
    `/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    options
  );
}

export async function deleteOutcome(
  treeId: string,
  outcomeId: string,
  options: RequestOptions = {}
): Promise<{ ok?: boolean }> {
  return request<{ ok?: boolean }>(
    `/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}`,
    { method: 'DELETE' },
    options
  );
}

export async function regenerateOutcome(
  treeId: string,
  outcomeId: string,
  options: RequestOptions = {}
): Promise<OutcomeRegenerateResponse> {
  return request<OutcomeRegenerateResponse>(
    `/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/regenerate`,
    { method: 'POST' },
    options
  );
}

export async function publishOutcome(
  treeId: string,
  outcomeId: string,
  options: RequestOptions = {}
): Promise<OutcomePublishResponse> {
  return request<OutcomePublishResponse>(
    `/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`,
    { method: 'POST' },
    options
  );
}

export async function unpublishOutcome(
  treeId: string,
  outcomeId: string,
  options: RequestOptions = {}
): Promise<OutcomeUnpublishResponse> {
  return request<OutcomeUnpublishResponse>(
    `/tree/${encodeURIComponent(treeId)}/outcomes/${encodeURIComponent(outcomeId)}/publish`,
    { method: 'DELETE' },
    options
  );
}

export function getApiBase(): string {
  return EXPLICIT_API_BASE ?? RELATIVE_API_ROOT;
}

// ============================================================
// Knowledge (WeKnora via oMyTree adapter)
// ============================================================

export type KnowledgeSearchRequest = {
  query_text: string;
  vector_threshold?: number;
  keyword_threshold?: number;
  match_count?: number;
  disable_keywords_match?: boolean;
  disable_vector_match?: boolean;
};

export async function listKnowledgeBases(options: RequestOptions = {}): Promise<ApiOkResponse<KnowledgeBase[]>> {
  return request<ApiOkResponse<KnowledgeBase[]>>(
    "/knowledge/bases",
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function createKnowledgeBase(
  body: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeBase>> {
  return request<ApiOkResponse<KnowledgeBase>>(
    "/knowledge/bases",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    options
  );
}

export async function getKnowledgeBase(
  baseId: string,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeBase>> {
  return request<ApiOkResponse<KnowledgeBase>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function updateKnowledgeBase(
  baseId: string,
  body: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeBase>> {
  return request<ApiOkResponse<KnowledgeBase>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    options
  );
}

export async function deleteKnowledgeBase(
  baseId: string,
  options: RequestOptions = {}
): Promise<ApiOkNoDataResponse> {
  return request<ApiOkNoDataResponse>(
    `/knowledge/bases/${encodeURIComponent(baseId)}`,
    {
      method: "DELETE",
    },
    options
  );
}

export async function uploadKnowledgeDocumentFile(
  baseId: string,
  file: File,
  fields: Record<string, string | number | boolean | null | undefined> = {},
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeDocument>> {
  const form = new FormData();
  form.append("file", file);
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    form.append(key, String(value));
  });

  return request<ApiOkResponse<KnowledgeDocument>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}/documents/file`,
    {
      method: "POST",
      body: form,
    },
    options
  );
}

export async function listKnowledgeDocuments(
  baseId: string,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeDocument[]>> {
  return request<ApiOkResponse<KnowledgeDocument[]>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}/documents`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function listKnowledgeBaseActivity(
  baseId: string,
  options: RequestOptions = {}
): Promise<ApiOkResponse<any[]>> {
  return request<ApiOkResponse<any[]>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}/activity`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function getKnowledgeDocument(
  docId: string,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeDocument>> {
  return request<ApiOkResponse<KnowledgeDocument>>(
    `/knowledge/documents/${encodeURIComponent(docId)}`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

// KB-RENAME: Update/rename a document
export async function updateKnowledgeDocument(
  docId: string,
  body: { title?: string; description?: string },
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeDocument>> {
  return request<ApiOkResponse<KnowledgeDocument>>(
    `/knowledge/documents/${encodeURIComponent(docId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    options
  );
}

export async function getKnowledgeDocumentDownloadUrl(
  docId: string,
  options: RequestOptions = {}
): Promise<ApiOkResponse<{ url: string; exp?: number }>> {
  return request<ApiOkResponse<{ url: string; exp?: number }>>(
    `/knowledge/documents/${encodeURIComponent(docId)}/download-url`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function getKnowledgeDocumentChunks(
  docId: string,
  params: { page?: number; page_size?: number } = {},
  options: RequestOptions = {}
): Promise<ApiOkResponseWithMeta<KnowledgeSearchChunk[], PaginationMeta>> {
  const qs = new URLSearchParams();
  if (typeof params.page === 'number') qs.set('page', String(params.page));
  if (typeof params.page_size === 'number') qs.set('page_size', String(params.page_size));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return request<ApiOkResponseWithMeta<KnowledgeSearchChunk[], PaginationMeta>>(
    `/knowledge/documents/${encodeURIComponent(docId)}/chunks${suffix}`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

export async function deleteKnowledgeDocument(
  baseId: string,
  docId: string,
  options: RequestOptions = {}
): Promise<ApiOkNoDataResponse> {
  return request<ApiOkNoDataResponse>(
    `/knowledge/bases/${encodeURIComponent(baseId)}/documents/${encodeURIComponent(docId)}`,
    {
      method: "DELETE",
    },
    options
  );
}

export async function searchKnowledgeBase(
  baseId: string,
  body: KnowledgeSearchRequest,
  options: RequestOptions = {}
): Promise<ApiOkResponse<KnowledgeSearchChunk[]>> {
  return request<ApiOkResponse<KnowledgeSearchChunk[]>>(
    `/knowledge/bases/${encodeURIComponent(baseId)}/search`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    options
  );
}

// Helper to shape payload for turn APIs (KB-B.1)
export function buildKnowledgeContext(input: KnowledgeContext | null | undefined): KnowledgeContext | null {
  if (!input) return null;
  if (!input.baseId) return null;
  return {
    baseId: input.baseId,
    documentIds: Array.isArray(input.documentIds) ? input.documentIds : undefined,
    topK: typeof input.topK === "number" ? input.topK : undefined,
  };
}

// T2-3: Tree workspace API functions
export interface TreeSnapshotResponse {
  ok: boolean;
  tree: {
    id: string;
    topic: string;
    root: {
      id: string;
      parent_id: null;
      level: number;
      role: string;
      text: string;
      children: Array<{
        id: string;
        parent_id: string;
        level: number;
        role: string;
        text: string;
        children: any[];
      }>;
    };
  };
  trace_id: string;
}

export interface NodeResponse {
  ok: boolean;
  node: {
    id: string;
    tree_id: string;
    parent_id: string | null;
    level: number;
    role: string;
    text: string;
    created_at: string;
  };
  trace_id: string;
}

// ============================================================
// Turn (read-only)
// ============================================================

export type TurnDetailResponse = {
  ok: boolean;
  turn?: {
    id: string;
    tree_id: string;
    node_id: string;
    parent_id: string | null;
    user_text: string;
    ai_text: string;
    status: string;
    created_at: string;
    provider?: string | null;
    model?: string | null;
    is_byok?: boolean | null;
    intent?: string | null;
  };
  node?: {
    id: string;
    tree_id: string;
    parent_id: string | null;
    level: number;
    role: string;
    text: string;
    created_at: string;
    topic_tag?: string | null;
    soft_deleted_at?: string | null;
  };
  relevance_audit?: unknown;
  trace_id?: string;
};

export async function getSnapshot(treeId: string, options: RequestOptions = {}): Promise<TreeSnapshotResponse> {
  return request<TreeSnapshotResponse>(`/tree/${encodeURIComponent(treeId)}/snapshot`, {
    method: "GET",
    cache: "no-store"
  }, options);
}

export async function getNode(id: string, options: RequestOptions = {}): Promise<NodeResponse> {
  return request<NodeResponse>(`/node/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store"
  }, options);
}

export async function getTurn(id: string, options: RequestOptions = {}): Promise<TurnDetailResponse> {
  return request<TurnDetailResponse>(`/turn/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store"
  }, options);
}

// ============================================================
// Keyframes (Pins)
// ============================================================

export type InlineAnnotationAnchor = {
  type: 'text-offset' | 'legacy';
  start?: number;
  end?: number;
  prefix?: string;
  suffix?: string;
};

export type InlineAnnotation = {
  id: string;
  quote: string;
  anchor: InlineAnnotationAnchor;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type KeyframeAnnotation = string | InlineAnnotation[] | null;

export type Keyframe = {
  id: string;
  node_id: string;
  annotation: KeyframeAnnotation;
  is_pinned: boolean;
  created_at: string;
};

export type FetchKeyframesResponse = {
  ok: boolean;
  keyframes: Keyframe[];
  trace_id?: string;
};

export type UpsertKeyframeResponse = {
  ok: boolean;
  keyframe: Keyframe | null;
  trace_id?: string;
};

export type DeleteKeyframeResponse = {
  ok: boolean;
  deleted: number;
  trace_id?: string;
};

export async function fetchKeyframes(treeId: string, options: RequestOptions = {}): Promise<FetchKeyframesResponse> {
  return request<FetchKeyframesResponse>(`/tree/${encodeURIComponent(treeId)}/keyframes`, {
    method: "GET",
    cache: "no-store"
  }, options);
}

export async function upsertKeyframe(
  treeId: string,
  nodeId: string,
  annotation: KeyframeAnnotation = null,
  options: RequestOptions = {}
): Promise<UpsertKeyframeResponse> {
  return request<UpsertKeyframeResponse>(`/tree/${encodeURIComponent(treeId)}/keyframes`, {
    method: "POST",
    body: JSON.stringify({
      node_id: nodeId,
      annotation,
    })
  }, options);
}

export async function deleteKeyframe(
  treeId: string,
  nodeId: string,
  options: RequestOptions = {}
): Promise<DeleteKeyframeResponse> {
  return request<DeleteKeyframeResponse>(`/tree/${encodeURIComponent(treeId)}/keyframes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  }, options);
}

// ============================================================
// Golden Path
// ============================================================

export type FetchGoldenPathResponse = {
  ok: boolean;
  node_ids: string[];
  trace_id?: string;
};

export async function fetchGoldenPath(treeId: string, options: RequestOptions = {}): Promise<FetchGoldenPathResponse> {
  return request<FetchGoldenPathResponse>(`/tree/${encodeURIComponent(treeId)}/golden-path`, {
    method: "GET",
    cache: "no-store"
  }, options);
}

// ============================================================
// Narrative Report (Legacy - kept for backward compatibility)
// ============================================================

export type GenerateNarrativeResponse = {
  ok: boolean;
  content: string;
  keyframes_count?: number;
  duration_ms?: number;
  persisted?: boolean;
  trace_id?: string;
};

export type FetchNarrativeResponse = {
  ok: boolean;
  content: string | null;
  updated_at: string | null;
  trace_id?: string;
};

export async function generateNarrative(treeId: string, options: RequestOptions = {}): Promise<GenerateNarrativeResponse> {
  return request<GenerateNarrativeResponse>(`/tree/${encodeURIComponent(treeId)}/narrative`, {
    method: "POST",
    body: JSON.stringify({}),
  }, options);
}

export async function fetchNarrative(treeId: string, options: RequestOptions = {}): Promise<FetchNarrativeResponse> {
  return request<FetchNarrativeResponse>(`/tree/${encodeURIComponent(treeId)}/narrative`, {
    method: "GET",
    cache: "no-store",
  }, options);
}

// ============================================================
// PathSnapshot API (P1-1: Path capture for replay & comparison)
// ============================================================

export type PathSnapshotStep = {
  step_index: number;
  keyframe_id: string;
  node_id: string;
  parent_id: string | null;
  level: number;
  role: string;
  annotation: string | null;
  created_at: string;
  text_preview: string;
};

export type PathSnapshot = {
  id: string;
  created_at: string;
  prompt_version: string;
  title: string | null;
  keyframe_count: number;
  node_count: number;
  input: {
    title?: string;
    keyframe_ids?: string[];
    node_ids?: string[];
    scope?: string;
    generated_from?: string;
    step_count?: number;
    steps?: PathSnapshotStep[];
  };
};

export type PathSnapshotCreateResponse = {
  ok: boolean;
  snapshot: {
    id: string;
    created_at: string;
    title: string | null;
    keyframe_count: number;
    node_count: number;
    scope: string;
  };
  content_markdown: string;
  trace_id?: string;
};

export type PathSnapshotResponse = {
  ok: boolean;
  snapshot: PathSnapshot | null;
  content_markdown: string | null;
  trace_id?: string;
};

export type PathSnapshotListResponse = {
  ok: boolean;
  snapshots: PathSnapshot[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  trace_id?: string;
};

export type PathSnapshotReplayStep = {
  step_index: number;
  node_id: string;
  annotation: string | null;
  role: string;
  text_preview: string;
  is_valid: boolean;
};

export type PathSnapshotReplayResponse = {
  ok: boolean;
  snapshot_id: string;
  title: string | null;
  total_steps: number;
  valid_steps: number;
  steps: PathSnapshotReplayStep[];
  warnings?: string[];
  trace_id?: string;
};

/**
 * Create a PathSnapshot from current keyframes
 */
export async function createPathSnapshot(
  treeId: string,
  body: { title?: string; scope?: "keyframes" | "subtree" | "custom" } = {},
  options: RequestOptions = {}
): Promise<PathSnapshotCreateResponse> {
  return request<PathSnapshotCreateResponse>(`/tree/${encodeURIComponent(treeId)}/path-snapshots`, {
    method: "POST",
    body: JSON.stringify(body),
  }, options);
}

/**
 * List PathSnapshots for a tree
 */
export async function listPathSnapshots(
  treeId: string,
  params: { limit?: number; offset?: number } = {},
  options: RequestOptions = {}
): Promise<PathSnapshotListResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));
  const query = searchParams.toString();
  const url = `/tree/${encodeURIComponent(treeId)}/path-snapshots${query ? `?${query}` : ""}`;
  return request<PathSnapshotListResponse>(url, {
    method: "GET",
    cache: "no-store",
  }, options);
}

/**
 * Get the latest PathSnapshot for a tree
 */
export async function fetchPathSnapshotLatest(
  treeId: string,
  options: RequestOptions = {}
): Promise<PathSnapshotResponse> {
  return request<PathSnapshotResponse>(`/tree/${encodeURIComponent(treeId)}/path-snapshots/latest`, {
    method: "GET",
    cache: "no-store",
  }, options);
}

/**
 * Get a specific PathSnapshot by ID
 */
export async function fetchPathSnapshot(
  treeId: string,
  snapshotId: string,
  options: RequestOptions = {}
): Promise<PathSnapshotResponse> {
  return request<PathSnapshotResponse>(
    `/tree/${encodeURIComponent(treeId)}/path-snapshots/${encodeURIComponent(snapshotId)}`,
    {
      method: "GET",
      cache: "no-store",
    },
    options
  );
}

/**
 * Get replay data for stepping through a PathSnapshot
 */
export async function fetchPathSnapshotReplay(
  treeId: string,
  snapshotId: string,
  options: RequestOptions = {}
): Promise<PathSnapshotReplayResponse> {
  return request<PathSnapshotReplayResponse>(
    `/tree/${encodeURIComponent(treeId)}/path-snapshots/${encodeURIComponent(snapshotId)}/replay`,
    {
      method: "POST",
    },
    options
  );
}

// ============================================================
// BranchDiff API (P1-2: Compare two paths)
// ============================================================

export type BranchDiffPoint = {
  summary: string;
  node_ids_a: string[];
  node_ids_b: string[];
  rationale: string;
};

export type BranchDiffArtifact = {
  id: string;
  created_at: string;
  prompt_version: string;
  input: Record<string, unknown>;
};

export type BranchDiffResponse = {
  ok: boolean;
  diff: BranchDiffArtifact;
  diff_points: BranchDiffPoint[];
  warnings?: Array<Record<string, unknown>>;
  content_markdown: string;
  trace_id?: string;
};

/**
 * Compare two paths and return structured diff points
 * Requires either (node_id_a, node_id_b) or (path_snapshot_id_a, path_snapshot_id_b)
 */
export async function createBranchDiff(
  treeId: string,
  body: {
    node_id_a?: string;
    node_id_b?: string;
    path_snapshot_id_a?: string;
    path_snapshot_id_b?: string;
  },
  options: RequestOptions = {}
): Promise<BranchDiffResponse> {
  return request<BranchDiffResponse>(`/tree/${encodeURIComponent(treeId)}/branch-diff`, {
    method: "POST",
    body: JSON.stringify(body),
  }, options);
}
