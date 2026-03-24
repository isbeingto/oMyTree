'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { appApiFetch } from '@/lib/app-api-client';

export type OutcomeType = 'decision' | 'brief' | 'report';

export interface OutcomeDraftSection {
  key: string;
  title: string;
  summary: string;
  sources: string[];
}

export interface EvidenceRequirement {
  section_key: string;
  title: string;
  needs: string;
  sources: string[];
  gaps: string[];
  status: 'missing' | 'needs_material' | 'resolved' | 'ignored' | string;
}

export interface OutcomeDraft {
  id: string;
  tree_id: string;
  snapshot_id: string | null;
  outcome_type: OutcomeType | string;
  outline_sections: OutcomeDraftSection[];
  evidence_requirements: EvidenceRequirement[];
  gap_count: number;
  created_at: string | null;
  updated_at: string | null;
}

interface UseOutcomeDraftOptions {
  enabled?: boolean;
  autoFetch?: boolean;
}

interface UseOutcomeDraftResult {
  draft: OutcomeDraft | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<OutcomeDraft | null>;
}

function parseErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeSection(raw: unknown, index: number): OutcomeDraftSection {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const key = asString(obj.key, `section_${index + 1}`);
  const title = asString(obj.title, key);
  return {
    key,
    title,
    summary: asString(obj.summary, ''),
    sources: asStringArray(obj.sources),
  };
}

function normalizeRequirement(raw: unknown, index: number): EvidenceRequirement {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sectionKey = asString(obj.section_key, `section_${index + 1}`);
  const title = asString(obj.title, `Requirement ${index + 1}`);
  const status = asString(obj.status, 'missing');
  return {
    section_key: sectionKey,
    title,
    needs: asString(obj.needs, ''),
    sources: asStringArray(obj.sources),
    gaps: asStringArray(obj.gaps),
    status,
  };
}

function normalizeDraft(raw: unknown): OutcomeDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = asString(obj.id, '');
  if (!id) return null;
  const outlineSections = Array.isArray(obj.outline_sections) ? obj.outline_sections : [];
  const evidenceRequirements = Array.isArray(obj.evidence_requirements) ? obj.evidence_requirements : [];
  return {
    id,
    tree_id: asString(obj.tree_id, ''),
    snapshot_id: asNullableString(obj.snapshot_id),
    outcome_type: asString(obj.outcome_type, 'brief'),
    outline_sections: outlineSections.map(normalizeSection),
    evidence_requirements: evidenceRequirements.map(normalizeRequirement),
    gap_count: typeof obj.gap_count === 'number' ? obj.gap_count : 0,
    created_at: asNullableString(obj.created_at),
    updated_at: asNullableString(obj.updated_at),
  };
}

export function useOutcomeDraft(
  treeId: string | null | undefined,
  options: UseOutcomeDraftOptions = {}
): UseOutcomeDraftResult {
  const { enabled = true, autoFetch = true } = options;

  const [draft, setDraft] = useState<OutcomeDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<OutcomeDraft | null> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!treeId || !enabled) {
      setDraft(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await appApiFetch(`/api/trees/${treeId}/outcomes?limit=1`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (body as Record<string, unknown>)?.message;
        const fallback = (body as Record<string, unknown>)?.error;
        throw new Error(asString(message, asString(fallback, `Failed to fetch outcome draft (${res.status})`)));
      }

      const drafts = Array.isArray((body as Record<string, unknown>).drafts)
        ? ((body as Record<string, unknown>).drafts as unknown[])
        : [];
      const nextDraft = drafts.length > 0 ? normalizeDraft(drafts[0]) : null;
      if (requestId === requestIdRef.current) {
        setDraft(nextDraft);
      }
      return nextDraft;
    } catch (err) {
      const msg = parseErrorMessage(err);
      if (requestId === requestIdRef.current) {
        setError(msg);
        setDraft(null);
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [treeId, enabled]);

  useEffect(() => {
    if (!treeId || !enabled) {
      setDraft(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (!autoFetch) return;
    void refresh();
  }, [treeId, enabled, autoFetch, refresh]);

  return {
    draft,
    isLoading,
    error,
    refresh,
  };
}

export default useOutcomeDraft;
