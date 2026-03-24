"use client";

import { useCallback, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { AppApiError, appApiGet } from "@/lib/app-api-client";

export interface MyTree {
  id: string;
  topic: string;
  display_title: string | null;
  root_title: string;
  title: string; // T15-9: Unified display title
  created_at: string;
  updated_at: string;
}

export interface MyTreesResponse {
  ok: boolean;
  trees: MyTree[];
  total?: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
  trace_id?: string;
}

export interface UseMyTreesResult {
  trees: MyTree[];
  /** Alias for compatibility with callers expecting `data` */
  data: MyTree[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  addTree: (tree: MyTree) => void;
  removeTree: (treeId: string) => void;
  updateTree: (treeId: string, updates: Partial<MyTree>) => void;
  /** Whether there are more trees to load */
  hasMore: boolean;
  /** Load next page of trees */
  loadMore: () => Promise<void>;
  /** Whether loadMore is currently fetching */
  isLoadingMore: boolean;
  /** Total number of trees on the server */
  total: number;
}

const PAGE_SIZE = 50;

// ── Query Key factory ──────────────────────────────────────────────
export const myTreesKeys = {
  all: ["app", "my-trees"] as const,
  list: (userId: string | null | undefined) =>
    [...myTreesKeys.all, userId ?? "anonymous"] as const,
};

// ── Fetch a single page ────────────────────────────────────────────
async function fetchMyTreesPage(userId: string, offset: number, limit: number): Promise<MyTreesResponse> {
  const data = await appApiGet<MyTreesResponse>(`/trees?limit=${limit}&offset=${offset}`, {
    headers: { "x-omytree-user-id": userId },
    cache: "no-store",
  });
  return data;
}

// ── Fetch first page (used by react-query) ─────────────────────────
async function fetchMyTrees(userId: string): Promise<MyTreesResponse> {
  return fetchMyTreesPage(userId, 0, PAGE_SIZE);
}

// ── Reusable queryOptions (can be used with useQuery or prefetch) ─
export function myTreesQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: myTreesKeys.list(userId),
    queryFn: () => fetchMyTrees(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000, // 30s — auto-refresh after expiry
    retry: (failureCount, error) => {
      // Don't retry on 401
      if (error instanceof AppApiError && error.status === 401) return false;
      return failureCount < 1;
    },
  });
}

function useSafeSession() {
  try {
    return useSession();
  } catch (err) {
    console.warn("[useMyTrees] useSession failed, assuming unauthenticated context", err);
    return { data: null, status: "unauthenticated" as const };
  }
}

export function useMyTrees(): UseMyTreesResult {
  const { data: session, status } = useSafeSession();
  const userId = status === "authenticated" ? session?.user?.id : undefined;
  const queryClient = useQueryClient();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreLock = useRef(false);

  const { data: response, isLoading, error } = useQuery(myTreesQueryOptions(userId));

  const trees = Array.isArray(response?.trees) ? response.trees : [];
  const total = response?.total ?? trees.length;
  const hasMore = response?.has_more ?? false;

  // ── Load more pages ─────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!userId || loadMoreLock.current) return;
    loadMoreLock.current = true;
    setIsLoadingMore(true);
    try {
      const currentData = queryClient.getQueryData<MyTreesResponse>(myTreesKeys.list(userId));
      const currentTrees = Array.isArray(currentData?.trees) ? currentData.trees : [];
      const offset = currentTrees.length;
      const page = await fetchMyTreesPage(userId, offset, PAGE_SIZE);
      const newTrees = Array.isArray(page?.trees) ? page.trees : [];

      // Merge into cache — deduplicate by id
      queryClient.setQueryData<MyTreesResponse>(myTreesKeys.list(userId), (prev) => {
        const prevTrees = Array.isArray(prev?.trees) ? prev.trees : [];
        const existingIds = new Set(prevTrees.map(t => t.id));
        const merged = [...prevTrees, ...newTrees.filter(t => !existingIds.has(t.id))];
        return {
          ...(prev ?? { ok: true }),
          trees: merged,
          total: page.total ?? merged.length,
          has_more: page.has_more ?? false,
          offset: offset,
          limit: PAGE_SIZE,
        };
      });
    } finally {
      setIsLoadingMore(false);
      loadMoreLock.current = false;
    }
  }, [userId, queryClient]);

  // ── Optimistic helpers that write directly to the query cache ───
  const addTree = useCallback(
    (tree: MyTree) => {
      queryClient.setQueryData<MyTreesResponse>(myTreesKeys.list(userId), (prev) => {
        const prevTrees = Array.isArray(prev?.trees) ? prev.trees : [];
        if (prevTrees.some((t) => t.id === tree.id)) return prev ?? { ok: true, trees: prevTrees };
        return {
          ...(prev ?? { ok: true }),
          trees: [tree, ...prevTrees],
          total: (prev?.total ?? prevTrees.length) + 1,
        };
      });
    },
    [queryClient, userId],
  );

  const removeTree = useCallback(
    (treeId: string) => {
      queryClient.setQueryData<MyTreesResponse>(myTreesKeys.list(userId), (prev) => {
        const prevTrees = Array.isArray(prev?.trees) ? prev.trees : [];
        const filtered = prevTrees.filter((t) => t.id !== treeId);
        return {
          ...(prev ?? { ok: true }),
          trees: filtered,
          total: Math.max((prev?.total ?? prevTrees.length) - 1, 0),
        };
      });
    },
    [queryClient, userId],
  );

  const updateTree = useCallback(
    (treeId: string, updates: Partial<MyTree>) => {
      queryClient.setQueryData<MyTreesResponse>(myTreesKeys.list(userId), (prev) => {
        const prevTrees = Array.isArray(prev?.trees) ? prev.trees : [];
        const updated = prevTrees.map((t) => (t.id === treeId ? { ...t, ...updates } : t));
        // Re-sort by updated_at DESC so the updated tree floats to the top of the sidebar
        const sorted = [...updated].sort((a, b) => {
          const ta = new Date(a.updated_at || a.created_at || 0).getTime();
          const tb = new Date(b.updated_at || b.created_at || 0).getTime();
          return tb - ta;
        });
        return {
          ...(prev ?? { ok: true }),
          trees: sorted,
        };
      });
    },
    [queryClient, userId],
  );

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: myTreesKeys.list(userId) });
  }, [queryClient, userId]);

  const safeTrees = Array.isArray(trees) ? trees : [];

  return {
    trees: safeTrees,
    data: safeTrees,
    isLoading: status === "loading" || isLoading,
    error: error instanceof Error ? error : null,
    refetch,
    addTree,
    removeTree,
    updateTree,
    hasMore,
    loadMore,
    isLoadingMore,
    total,
  };
}

export default useMyTrees;
