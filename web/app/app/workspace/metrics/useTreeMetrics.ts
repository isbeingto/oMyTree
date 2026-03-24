import { useQuery } from '@tanstack/react-query';
import { AppApiError, appApiGet } from '@/lib/app-api-client';

export type TreeMetricsV1 = {
  version: 'v1';
  tree_id: string;
  node_count: number;
  depth_max: number;
  branch_node_count: number;
  user_question_count: number;
  ai_answer_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export function useTreeMetrics(
  treeId: string | null | undefined,
  userId?: string | null,
  refreshToken?: string | number | null
) {
  const query = useQuery({
    queryKey: ["app", "workspace", "tree-metrics", treeId ?? null, userId ?? null, refreshToken ?? null],
    queryFn: async () => {
      if (!treeId) return null;
      const data = await appApiGet<{ metrics?: TreeMetricsV1 }>(`/tree/${treeId}/metrics`, {
        headers: userId ? { "x-omytree-user-id": userId } : undefined,
        cache: "no-store",
      });
      return data.metrics || null;
    },
    enabled: Boolean(treeId),
    staleTime: 10_000,
  });

  const errorMessage =
    query.error instanceof AppApiError
      ? query.error.message
      : query.error instanceof Error
        ? query.error.message
        : null;

  return { metrics: query.data || null, isLoading: query.isLoading, error: errorMessage, refetch: query.refetch };
}
