import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppApiError } from "@/lib/app-api-client";
import {
  listSharedTrees,
  revokeTreeShare,
  settingsKeys,
  type SharedTreeEntry,
} from "./hooks/useSettingsApi";

export type { SharedTreeEntry };

export function useUserShares(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: settingsKeys.sharedTrees(userId),
    queryFn: async () => {
      if (!userId) return [] as SharedTreeEntry[];
      const data = await listSharedTrees(userId);
      return Array.isArray(data.shared_trees) ? data.shared_trees : [];
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: async (treeId: string) => {
      if (!userId) throw new Error("Missing user id");
      await revokeTreeShare(treeId, userId);
      return treeId;
    },
    onSuccess: (treeId) => {
      queryClient.setQueryData<SharedTreeEntry[]>(settingsKeys.sharedTrees(userId), (prev) =>
        Array.isArray(prev) ? prev.filter((entry) => entry.tree_id !== treeId) : prev
      );
    },
  });

  const errorMessage =
    query.error instanceof AppApiError
      ? query.error.message
      : query.error instanceof Error
        ? query.error.message
        : null;

  return {
    sharedTrees: query.data || [],
    isLoading: query.isLoading,
    error: errorMessage,
    refetch: query.refetch,
    revokeShare: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
  };
}
