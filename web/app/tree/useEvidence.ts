'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { appApiFetch } from '@/lib/app-api-client';

export type EvidenceType = 'url' | 'file' | 'text';

export interface EvidenceItem {
  id: string;
  tree_id: string;
  type: EvidenceType;
  title: string;
  summary?: string | null;
  source_url?: string | null;
  stored_path?: string | null;
  text_content?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  attached_node_count?: number | null;
  attached_at?: string | null;
}

export interface EvidenceNodeLink {
  id: string;
  text: string | null;
  role: string | null;
  created_at: string | null;
  attached_at?: string | null;
}

export interface CreateEvidencePayload {
  tree_id?: string;
  type: EvidenceType;
  title: string;
  summary?: string;
  source_url?: string;
  text_content?: string;
  tags?: string[];
}

export interface UploadEvidencePayload {
  tree_id?: string;
  title: string;
  summary?: string;
  file: File;
  tags?: string[];
}

interface UseEvidenceOptions {
  onEvidenceAttached?: () => void;
  userId?: string | null;
  enabled?: boolean;
}

function parseErrorMessage(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  return String(err);
}

async function readJsonSafely(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Evidence data + actions for the current tree.
 * Covers tree-level evidence list, node attachments, and evidence→nodes lookup.
 */
export function useEvidence(
  treeId: string | null,
  options: UseEvidenceOptions = {}
) {
  const { onEvidenceAttached, userId, enabled = true } = options;
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // nodeId -> evidence[]
  const [nodeEvidenceMap, setNodeEvidenceMap] = useState<Record<string, EvidenceItem[]>>({});
  const [nodeEvidenceLoading, setNodeEvidenceLoading] = useState<Record<string, boolean>>({});

  // evidenceId -> nodes[]
  const [evidenceNodesMap, setEvidenceNodesMap] = useState<Record<string, EvidenceNodeLink[]>>({});
  const [evidenceNodesLoading, setEvidenceNodesLoading] = useState<Record<string, boolean>>({});

  const evidenceIndex = useMemo(() => {
    const map = new Map<string, EvidenceItem>();
    evidence.forEach((item) => map.set(item.id, item));
    return map;
  }, [evidence]);

  const authHeaders = useMemo(() => {
    return userId ? { 'x-omytree-user-id': userId } : undefined;
  }, [userId]);

  const refreshEvidence = useCallback(async () => {
    if (!treeId || !enabled) {
      setEvidence([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await appApiFetch(`/api/trees/${treeId}/evidence`, {
        headers: authHeaders,
      });
      const body = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(body.message || body.error || `Failed to fetch evidence (${res.status})`);
      }
      const list: EvidenceItem[] = body.evidence || [];
      // Ensure descending by created_at on the client as well
      list.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      setEvidence(list);
    } catch (err: any) {
      setError(parseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [treeId, authHeaders, enabled]);

  const fetchEvidenceById = useCallback(async (id: string): Promise<EvidenceItem | null> => {
    if (!enabled) return null;
    try {
      const res = await appApiFetch(`/api/evidence/${id}`, {
        headers: authHeaders,
      });
      const body = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(body.message || body.error || `Failed to load evidence (${res.status})`);
      }
      return body.evidence || null;
    } catch (err) {
      console.error('[evidence] fetchEvidenceById error', err);
      return null;
    }
  }, [authHeaders, enabled]);

  const createEvidence = useCallback(
    async (payload: CreateEvidencePayload): Promise<EvidenceItem | null> => {
      if (!treeId && !payload.tree_id) {
        setError('Tree ID is required to create evidence');
        return null;
      }
      if (!enabled) return null;
      setError(null);
      try {
        const res = await appApiFetch('/api/evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
          body: JSON.stringify({
            ...payload,
            tree_id: payload.tree_id || treeId,
          }),
        });
        const body = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(body.message || body.error || `Failed to create evidence (${res.status})`);
        }
        const created: EvidenceItem = body.evidence;
        setEvidence((prev) => [created, ...prev]);
        return created;
      } catch (err: any) {
        const msg = parseErrorMessage(err);
        setError(msg);
        return null;
      }
    },
    [treeId, authHeaders, enabled]
  );

  const uploadEvidence = useCallback(
    async (payload: UploadEvidencePayload): Promise<EvidenceItem | null> => {
      if (!treeId && !payload.tree_id) {
        setError('Tree ID is required to upload evidence');
        return null;
      }
      if (!enabled) return null;
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', payload.file);
        formData.append('tree_id', payload.tree_id || treeId || '');
        formData.append('title', payload.title);
        if (payload.summary) formData.append('summary', payload.summary);
        if (payload.tags) formData.append('tags', JSON.stringify(payload.tags));

        const res = await appApiFetch('/api/evidence/upload', {
          method: 'POST',
          body: formData,
          headers: authHeaders,
        });
        const body = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(body.message || body.error || `Failed to upload evidence (${res.status})`);
        }
        const created: EvidenceItem = body.evidence;
        setEvidence((prev) => [created, ...prev]);
        return created;
      } catch (err: any) {
        const msg = parseErrorMessage(err);
        setError(msg);
        return null;
      }
    },
    [treeId, authHeaders, enabled]
  );

  const loadNodeEvidence = useCallback(
    async (nodeId: string, { force = false }: { force?: boolean } = {}) => {
      if (!enabled) return [];
      if (!nodeId) return [];
      if (nodeEvidenceMap[nodeId] && !force) return nodeEvidenceMap[nodeId];

      setNodeEvidenceLoading((prev) => ({ ...prev, [nodeId]: true }));
      try {
        const res = await appApiFetch(`/api/nodes/${nodeId}/evidence`, {
          headers: authHeaders,
        });
        const body = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(body.message || body.error || `Failed to load node evidence (${res.status})`);
        }
        const list: EvidenceItem[] = body.evidence || [];
        setNodeEvidenceMap((prev) => ({ ...prev, [nodeId]: list }));
        // Keep attached counts in sync when we have a definitive list
        setEvidence((prev) =>
          prev.map((item) =>
            list.find((ev) => ev.id === item.id)
              ? { ...item, attached_node_count: Math.max((item.attached_node_count || 0), 1) }
              : item
          )
        );
        return list;
      } catch (err) {
        console.error('[evidence] loadNodeEvidence error', err);
        return [];
      } finally {
        setNodeEvidenceLoading((prev) => ({ ...prev, [nodeId]: false }));
      }
    },
    [nodeEvidenceMap, authHeaders, enabled]
  );

  const loadEvidenceNodes = useCallback(
    async (evidenceId: string, { force = false }: { force?: boolean } = {}) => {
      if (!enabled) return [];
      if (!evidenceId) return [];
      if (evidenceNodesMap[evidenceId] && !force) return evidenceNodesMap[evidenceId];

      setEvidenceNodesLoading((prev) => ({ ...prev, [evidenceId]: true }));
      try {
        const res = await appApiFetch(`/api/evidence/${evidenceId}/nodes`, {
          headers: authHeaders,
        });
        const body = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(body.message || body.error || `Failed to load evidence nodes (${res.status})`);
        }
        const list: EvidenceNodeLink[] = body.nodes || [];
        setEvidenceNodesMap((prev) => ({ ...prev, [evidenceId]: list }));
        return list;
      } catch (err) {
        console.error('[evidence] loadEvidenceNodes error', err);
        return [];
      } finally {
        setEvidenceNodesLoading((prev) => ({ ...prev, [evidenceId]: false }));
      }
    },
    [evidenceNodesMap, authHeaders, enabled]
  );

  const attachEvidenceToNode = useCallback(
    async (
      nodeId: string,
      evidenceId: string,
      options: { nodeMeta?: EvidenceNodeLink } = {}
    ) => {
      if (!nodeId || !evidenceId) {
        setError('Node and evidence are required for attachment');
        return null;
      }
      if (!enabled) return null;
      setError(null);
      try {
        const res = await appApiFetch(`/api/nodes/${nodeId}/evidence/${evidenceId}`, {
          method: 'POST',
          headers: authHeaders,
        });
        const body = await readJsonSafely(res);
        if (!res.ok) {
          throw new Error(body.message || body.error || `Failed to attach evidence (${res.status})`);
        }

        // Update counts and node map
        const evidenceItem =
          evidenceIndex.get(evidenceId) || (await fetchEvidenceById(evidenceId));

        if (evidenceItem) {
          setNodeEvidenceMap((prev) => {
            const existing = prev[nodeId] || [];
            const alreadyLinked = existing.some((ev) => ev.id === evidenceId);
            return {
              ...prev,
              [nodeId]: alreadyLinked ? existing : [evidenceItem, ...existing],
            };
          });
        }

        if (body.created) {
          // Update tree-level evidence count
          setEvidence((prev) =>
            prev.map((item) =>
              item.id === evidenceId
                ? {
                    ...item,
                    attached_node_count: (item.attached_node_count || 0) + 1,
                  }
                : item
            )
          );
          onEvidenceAttached?.();
        }

        // Update evidence->nodes map with optional node metadata
        if (options.nodeMeta) {
          setEvidenceNodesMap((prev) => {
            const list = prev[evidenceId] || [];
            const hasNode = list.some((n) => n.id === options.nodeMeta?.id);
            if (hasNode) return prev;
            return {
              ...prev,
              [evidenceId]: [options.nodeMeta as EvidenceNodeLink, ...list],
            };
          });
        } else if (body.created) {
          // Ensure we refresh later to reflect the new link
          setEvidenceNodesMap((prev) => {
            const copy = { ...prev };
            delete copy[evidenceId];
            return copy;
          });
        }

        return body;
      } catch (err: any) {
        const msg = parseErrorMessage(err);
        setError(msg);
        return null;
      }
    },
    [evidenceIndex, fetchEvidenceById, onEvidenceAttached, authHeaders, enabled]
  );

  // Auto-refresh when tree changes
  useEffect(() => {
    setEvidence([]);
    setNodeEvidenceMap({});
    setEvidenceNodesMap({});
    if (treeId && enabled) {
      refreshEvidence();
    } else {
      setIsLoading(false);
    }
  }, [treeId, refreshEvidence, enabled]);

  return {
    evidence,
    isLoading,
    error,
    refreshEvidence,
    createEvidence,
    uploadEvidence,
    attachEvidenceToNode,
    nodeEvidenceMap,
    loadNodeEvidence,
    nodeEvidenceLoading,
    evidenceNodesMap,
    loadEvidenceNodes,
    evidenceNodesLoading,
  };
}

export default useEvidence;
