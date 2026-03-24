'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { t, type Lang } from '@/lib/i18n';

/**
 * T56-3: Resume Toast Hook
 * 
 * Implements "suggest generating Resume" toast with non-intrusive behavior:
 * - Only triggers once per session/tree
 * - Never repeats after dismissal
 * - Follows "game save point" metaphor: prompt at milestone, easy to ignore
 * 
 * Triggers (at least 3):
 * 1. Continuous dialogue > N turns (default: 5)
 * 2. Branch burst: multiple nodes created in short time (default: 3 in 60s)
 * 3. Session idle timeout before leaving (optional)
 */

export interface UseResumeToastOptions {
  /** Tree ID to track (reset tracking when tree changes) */
  treeId: string | null;
  /** Current language */
  lang?: Lang;
  /** Number of turns before suggesting resume (default: 5) */
  turnThreshold?: number;
  /** Number of nodes for burst detection (default: 3) */
  burstNodeCount?: number;
  /** Time window for burst detection in ms (default: 60000 = 60s) */
  burstTimeWindowMs?: number;
  /** Whether resume snapshot already exists for this tree */
  hasExistingSnapshot?: boolean;
  /** Callback when user clicks "Generate Resume" in toast */
  onGenerateResume?: () => void;
}

// Session storage key prefix for tracking dismissed toasts
const DISMISSED_KEY_PREFIX = 'omytree:resume-toast-dismissed:';
const TURN_COUNT_KEY_PREFIX = 'omytree:resume-turn-count:';

/**
 * Check if toast was already dismissed for this tree in this session
 */
function wasToastDismissed(treeId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${treeId}`) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark toast as dismissed for this tree in this session
 */
function markToastDismissed(treeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${treeId}`, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get turn count from session storage
 */
function getTurnCount(treeId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const val = sessionStorage.getItem(`${TURN_COUNT_KEY_PREFIX}${treeId}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set turn count in session storage
 */
function setTurnCount(treeId: string, count: number): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${TURN_COUNT_KEY_PREFIX}${treeId}`, String(count));
  } catch {
    // Ignore storage errors
  }
}

export function useResumeToast({
  treeId,
  lang = 'en',
  turnThreshold = 5,
  burstNodeCount = 3,
  burstTimeWindowMs = 60000,
  hasExistingSnapshot = false,
  onGenerateResume,
}: UseResumeToastOptions) {
  const { toast } = useToast();
  
  // Track node creation timestamps for burst detection
  const nodeTimestampsRef = useRef<number[]>([]);
  // Track if toast was already shown this session (in-memory fallback)
  const toastShownRef = useRef(false);
  // Previous tree ID to detect tree changes
  const prevTreeIdRef = useRef<string | null>(null);

  // Reset tracking when tree changes
  useEffect(() => {
    if (treeId !== prevTreeIdRef.current) {
      prevTreeIdRef.current = treeId;
      nodeTimestampsRef.current = [];
      toastShownRef.current = false;
    }
  }, [treeId]);

  /**
   * Show the resume suggestion toast (only once per tree per session)
   */
  const showResumeToast = useCallback(() => {
    if (!treeId) return;
    if (toastShownRef.current) return;
    if (wasToastDismissed(treeId)) return;
    
    // If tree already has a snapshot, don't nag
    if (hasExistingSnapshot) {
      markToastDismissed(treeId);
      return;
    }

    toastShownRef.current = true;
    markToastDismissed(treeId);

    const title = t(lang, 'toast_resume_title');
    const description = t(lang, 'toast_resume_desc');
    const actionLabel = t(lang, 'toast_resume_action');

    toast({
      title,
      description,
      duration: 8000, // 8 seconds, enough to read but not annoying
      action: onGenerateResume ? (
        <button
          onClick={() => {
            onGenerateResume();
          }}
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-primary px-2.5 h-8 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors sm:px-3 sm:text-sm"
        >
          {actionLabel}
        </button>
      ) : undefined,
    });
  }, [treeId, lang, hasExistingSnapshot, onGenerateResume, toast]);

  /**
   * Call this when a turn completes (AI response received)
   */
  const onTurnComplete = useCallback(() => {
    if (!treeId) return;
    if (toastShownRef.current || wasToastDismissed(treeId)) return;

    // Increment turn count
    const currentCount = getTurnCount(treeId);
    const newCount = currentCount + 1;
    setTurnCount(treeId, newCount);

    // Trigger 1: Turn threshold reached
    if (newCount >= turnThreshold) {
      showResumeToast();
      return;
    }

    // Trigger 2: Branch burst detection
    const now = Date.now();
    nodeTimestampsRef.current.push(now);
    // Keep only timestamps within the time window
    nodeTimestampsRef.current = nodeTimestampsRef.current.filter(
      ts => now - ts <= burstTimeWindowMs
    );
    
    if (nodeTimestampsRef.current.length >= burstNodeCount) {
      showResumeToast();
    }
  }, [treeId, turnThreshold, burstNodeCount, burstTimeWindowMs, showResumeToast]);

  /**
   * Call this when evidence is attached (future)
   */
  const onEvidenceAttached = useCallback(() => {
    if (!treeId) return;
    if (toastShownRef.current || wasToastDismissed(treeId)) return;
    showResumeToast();
  }, [treeId, showResumeToast]);

  /**
   * Call this when outcome is saved (future)
   */
  const onOutcomeSaved = useCallback(() => {
    if (!treeId) return;
    if (toastShownRef.current || wasToastDismissed(treeId)) return;
    showResumeToast();
  }, [treeId, showResumeToast]);

  /**
   * Manual trigger (e.g., for testing or specific user actions)
   */
  const triggerManually = useCallback(() => {
    showResumeToast();
  }, [showResumeToast]);

  /**
   * Reset tracking (e.g., after generating a snapshot)
   */
  const resetTracking = useCallback(() => {
    if (!treeId) return;
    toastShownRef.current = false;
    nodeTimestampsRef.current = [];
    setTurnCount(treeId, 0);
    // Note: We keep the dismissed flag so we don't show again after user generated
  }, [treeId]);

  return {
    onTurnComplete,
    onEvidenceAttached,
    onOutcomeSaved,
    triggerManually,
    resetTracking,
  };
}
