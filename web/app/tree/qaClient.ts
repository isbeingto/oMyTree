import { useState, useEffect, useCallback } from 'react';
import { appApiFetch } from '@/lib/app-api-client';

export type QANode = {
  id: string;
  tree_id: string | null;
  user_node_id: string;
  user_text: string;
  ai_node_id: string | null;
  ai_text: string | null;
  parent_id: string | null;
  children_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  provider?: string | null;
  model?: string | null;
  is_byok?: boolean | null;
};

export type QATree = {
  treeId: string;
  nodes: QANode[];
  rootId: string | null;
  byId: Record<string, QANode>;
  children: Record<string, string[]>;
  parent: Record<string, string | null>;
  narrative_report?: string | null;
  // T37-0: Context metadata for capsule panel
  context_profile?: 'lite' | 'standard' | 'max' | null;
  memory_scope?: 'branch' | 'tree' | null;
  // T47-2: Tree summary for debug panel
  tree_summary?: {
    semantic?: string | null;
    meta?: {
      version?: number;
      updated_at?: string;
      node_count?: number;
    };
  } | null;
};

export function useQATree(treeId: string | null) {
  const [data, setData] = useState<QATree | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Manual refresh function
  const mutate = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!treeId) {
      setData(null);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await appApiFetch(`/api/tree/${treeId}/qa`);
        if (!res.ok) {
          throw new Error(`Failed to fetch QA tree: ${res.statusText}`);
        }
        const json = await res.json();
        const nodes: QANode[] = json.nodes || [];
        const rootId = json.root_id || null;

        const byId: Record<string, QANode> = {};
        const children: Record<string, string[]> = {};
        const parent: Record<string, string | null> = {};

        nodes.forEach((node) => {
          byId[node.id] = node;
          children[node.id] = node.children_ids || [];
          parent[node.id] = node.parent_id;
        });

        setData({
          treeId,
          nodes,
          rootId,
          byId,
          children,
          parent,
          narrative_report: json.narrative_report || null,
          // T37-0: Include context metadata from API response
          context_profile: json.context_profile || null,
          memory_scope: json.memory_scope || null,
          // T47-2: Include tree summary from API response
          tree_summary: json.tree_summary || null,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [treeId, refreshKey]);

  return { data, isLoading, error, mutate };
}
