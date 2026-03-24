'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createOutcome,
  deleteOutcome,
  getOutcome,
  listOutcomes,
  patchOutcome,
  previewOutcome,
  regenerateOutcome,
  type Outcome,
  type OutcomeCreateRequest,
  type OutcomePatchRequest,
  type OutcomeDetailResponse,
  type OutcomePreviewRequest,
  type OutcomePreviewResponse,
} from '@/lib/api';

interface UseOutcomesOptions {
  userId?: string | null;
  enabled?: boolean;
  autoFetch?: boolean;
}

function parseErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function useOutcomes(treeId: string | null | undefined, options: UseOutcomesOptions = {}) {
  const { userId, enabled = true, autoFetch = true } = options;

  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomesById = useMemo(() => {
    const map = new Map<string, Outcome>();
    outcomes.forEach((o) => {
      if (o?.id) map.set(o.id, o);
    });
    return map;
  }, [outcomes]);

  const refresh = useCallback(async (params: { limit?: number; offset?: number } = {}) => {
    if (!treeId || !enabled) {
      setOutcomes([]);
      return [] as Outcome[];
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await listOutcomes(treeId, params, { userId });
      const list = (data?.outcomes ?? []) as Outcome[];
      setOutcomes(list);
      return list;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return [] as Outcome[];
    } finally {
      setIsLoading(false);
    }
  }, [treeId, enabled, userId]);

  const create = useCallback(async (payload: OutcomeCreateRequest) => {
    if (!treeId || !enabled) return null;

    setIsMutating(true);
    setError(null);
    try {
      const data = await createOutcome(treeId, payload, { userId });
      const created = data?.outcome as Outcome | undefined;
      if (created?.id) {
        setOutcomes((prev) => {
          const next = [created, ...prev.filter((o) => o.id !== created.id)];
          return next;
        });
      }
      return data;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [treeId, enabled, userId]);

  const preview = useCallback(async (payload: OutcomePreviewRequest): Promise<OutcomePreviewResponse | null> => {
    if (!treeId || !enabled) return null;

    setIsLoading(true);
    setError(null);
    try {
      const data = await previewOutcome(treeId, payload, { userId });
      return data;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [treeId, enabled, userId]);

  const getDetail = useCallback(async (outcomeId: string): Promise<OutcomeDetailResponse | null> => {
    if (!treeId || !enabled || !outcomeId) return null;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getOutcome(treeId, outcomeId, { userId });
      const fetched = data?.outcome as Outcome | undefined;
      if (fetched?.id) {
        setOutcomes((prev) => {
          const next = prev.some((o) => o.id === fetched.id)
            ? prev.map((o) => (o.id === fetched.id ? fetched : o))
            : [fetched, ...prev];
          return next;
        });
      }
      return data;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [treeId, enabled, userId]);

  const update = useCallback(async (outcomeId: string, patch: OutcomePatchRequest) => {
    if (!treeId || !enabled || !outcomeId) return null;

    setIsMutating(true);
    setError(null);
    try {
      const data = await patchOutcome(treeId, outcomeId, patch, { userId });
      const updated = data?.outcome as Outcome | undefined;
      if (updated?.id) {
        setOutcomes((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
      return data;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [treeId, enabled, userId]);

  const remove = useCallback(async (outcomeId: string) => {
    if (!treeId || !enabled || !outcomeId) return false;

    setIsMutating(true);
    setError(null);
    try {
      const data = await deleteOutcome(treeId, outcomeId, { userId });
      if (data?.ok) {
        setOutcomes((prev) => prev.filter((o) => o.id !== outcomeId));
        return true;
      }
      return false;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return false;
    } finally {
      setIsMutating(false);
    }
  }, [treeId, enabled, userId]);

  const regenerate = useCallback(async (outcomeId: string) => {
    if (!treeId || !enabled || !outcomeId) return null;

    setIsMutating(true);
    setError(null);
    try {
      const data = await regenerateOutcome(treeId, outcomeId, { userId });
      const updated = data?.outcome as Outcome | undefined;
      if (updated?.id) {
        setOutcomes((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
      return data;
    } catch (err) {
      const msg = parseErrorMessage(err);
      setError(msg);
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [treeId, enabled, userId]);

  useEffect(() => {
    if (!treeId || !enabled) {
      setOutcomes([]);
      return;
    }
    if (!autoFetch) return;
    void refresh({ limit: 20, offset: 0 });
  }, [treeId, enabled, autoFetch, refresh]);

  return {
    outcomes,
    outcomesById,
    isLoading,
    isMutating,
    error,
    refresh,
    preview,
    create,
    getDetail,
    update,
    remove,
    regenerate,
  };
}

export default useOutcomes;
