'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { appApiFetch } from '@/lib/app-api-client';
import type { ResumeSnapshot } from '../app/workspace/ResumePanel';

/**
 * T56-1: Snapshot API Hooks
 * 
 * Provides React hooks for interacting with the Resume Snapshot API:
 * - useResumeSnapshot: manages snapshot loading, generation, and updates
 */

interface UseResumeSnapshotOptions {
  /** Automatically fetch the latest/pinned snapshot on mount */
  autoFetch?: boolean;
  /** Callback when a new snapshot is generated */
  onSnapshotGenerated?: (snapshot: ResumeSnapshot) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

interface UseResumeSnapshotResult {
  /** Currently loaded snapshot */
  snapshot: ResumeSnapshot | null;
  /** List of all snapshots for history */
  snapshots: ResumeSnapshot[];
  /** Whether data is being fetched/generated */
  isLoading: boolean;
  /** Whether snapshot generation is in progress */
  isGenerating: boolean;
  /** Error message if any */
  error: string | null;
  /** Fetch the list of snapshots for a tree */
  fetchSnapshots: (limit?: number) => Promise<void>;
  /** Generate a new snapshot */
  generateSnapshot: (options?: { 
    scopeNodeId?: string; 
    mode?: 'incremental' | 'full';
    pinned?: boolean;
    userNotes?: string;
    anchorNodeId?: string;
  }) => Promise<{ snapshot: ResumeSnapshot | null; error: string | null }>;
  /** Load a specific snapshot by ID */
  loadSnapshot: (snapshotId: string) => Promise<void>;
  /** Toggle the pinned state of a snapshot */
  togglePin: (snapshotId: string, pinned: boolean) => Promise<void>;
  /** Clear current snapshot and error */
  reset: () => void;
}

/**
 * Hook for managing Resume Snapshots
 */
export function useResumeSnapshot(
  treeId: string | null | undefined,
  options: UseResumeSnapshotOptions = {}
): UseResumeSnapshotResult {
  const { autoFetch = true, onSnapshotGenerated, onError } = options;
  
  const [snapshot, setSnapshot] = useState<ResumeSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<ResumeSnapshot[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const isLoading = isFetching || isGenerating;
  const [error, setError] = useState<string | null>(null);
  
  // Track if we've auto-fetched for this treeId
  const fetchedTreeIdRef = useRef<string | null>(null);

  // Fetch list of snapshots
  const fetchSnapshots = useCallback(async (limit = 20) => {
    if (!treeId) return;
    
    setIsFetching(true);
    setError(null);
    
    try {
      const res = await appApiFetch(`/api/trees/${treeId}/snapshots?limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = data.snapshots || [];
      setSnapshots(list);
      
      // Set the first snapshot (pinned or latest) as current if none selected
      if (list.length > 0 && !snapshot) {
        setSnapshot(list[0]);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch snapshots';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsFetching(false);
    }
  }, [treeId, snapshot, onError]);

  // Generate a new snapshot
  const generateSnapshot = useCallback(async (opts?: {
    scopeNodeId?: string;
    mode?: 'incremental' | 'full';
    pinned?: boolean;
    userNotes?: string;
    anchorNodeId?: string;
  }) => {
    if (!treeId) {
      return { snapshot: null, error: 'missing_tree_id' };
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const res = await appApiFetch(`/api/trees/${treeId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope_node_id: opts?.scopeNodeId || null,
          mode: opts?.mode || 'incremental',
          pinned: opts?.pinned || false,
          user_notes: opts?.userNotes || null,
          anchor_node_id: opts?.anchorNodeId || null,
        }),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      const newSnapshot = data.snapshot;
      
      setSnapshot(newSnapshot);
      // Add to beginning of history
      setSnapshots(prev => [newSnapshot, ...prev.filter(s => s.id !== newSnapshot.id)]);
      
      onSnapshotGenerated?.(newSnapshot);
      return { snapshot: newSnapshot, error: null };
    } catch (err: any) {
      const msg = err.message || 'Failed to generate snapshot';
      setError(msg);
      onError?.(msg);
      return { snapshot: null, error: msg };
    } finally {
      setIsGenerating(false);
    }
  }, [treeId, onSnapshotGenerated, onError]);

  // Load a specific snapshot by ID
  const loadSnapshot = useCallback(async (snapshotId: string) => {
    setIsFetching(true);
    setError(null);
    
    try {
      const res = await appApiFetch(`/api/snapshots/${snapshotId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      setSnapshot(data.snapshot);
    } catch (err: any) {
      const msg = err.message || 'Failed to load snapshot';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsFetching(false);
    }
  }, [onError]);

  // Toggle pinned state
  const togglePin = useCallback(async (snapshotId: string, pinned: boolean) => {
    try {
      const res = await appApiFetch(`/api/snapshots/${snapshotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      const updated = data.snapshot;
      
      // Update current snapshot if it's the one being toggled
      if (snapshot?.id === snapshotId) {
        setSnapshot(updated);
      }
      
      // Update in history list and re-sort (pinned first)
      setSnapshots(prev => {
        const newList = prev.map(s => s.id === snapshotId ? updated : s);
        // If pinned=true, unpinned any others and move this to top
        if (pinned) {
          return newList
            .map(s => s.id === snapshotId ? s : { ...s, pinned: false })
            .sort((a, b) => {
              if (a.pinned && !b.pinned) return -1;
              if (!a.pinned && b.pinned) return 1;
              return new Date(b.ts).getTime() - new Date(a.ts).getTime();
            });
        }
        return newList;
      });
    } catch (err: any) {
      const msg = err.message || 'Failed to update snapshot';
      setError(msg);
      onError?.(msg);
    }
  }, [snapshot, onError]);

  // Reset state
  const reset = useCallback(() => {
    setSnapshot(null);
    setSnapshots([]);
    setError(null);
    setIsFetching(false);
    setIsGenerating(false);
  }, []);

  // Auto-fetch on mount or when treeId changes
  useEffect(() => {
    if (autoFetch && treeId && treeId !== fetchedTreeIdRef.current) {
      fetchedTreeIdRef.current = treeId;
      fetchSnapshots();
    }
    
    // Reset when treeId changes
    if (!treeId) {
      reset();
      fetchedTreeIdRef.current = null;
    }
  }, [treeId, autoFetch, fetchSnapshots, reset]);

  return {
    snapshot,
    snapshots,
    isLoading,
    isGenerating,
    error,
    fetchSnapshots,
    generateSnapshot,
    loadSnapshot,
    togglePin,
    reset,
  };
}

export default useResumeSnapshot;
