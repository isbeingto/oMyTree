'use client';

import { useMemo, type MutableRefObject } from 'react';
import { FolderTree, ChevronRight, PanelRightOpen, Milestone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';
import { QANode } from '../../tree/qaClient';
import { TreeCanvas } from './TreeCanvas';

/**
 * T60: Right Drawer - TreeCanvas Only
 * 
 * Simplified to show only tree visualization.
 * Resume/Outcome/Evidence tabs removed (Layer-2 moved to top capsule).
 */

export interface RightDrawerTabsProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Toggle drawer open/close */
  onToggle: () => void;
  /** Tree title (topic) */
  treeTitle?: string | null;
  /** Current tree ID */
  treeId?: string | null;
  /** QA nodes for the tree */
  qaNodes: QANode[];
  /** Currently selected QA node ID */
  selectedQANodeId: string | null;
  /** Callback when user selects a node */
  onSelectNode: (nodeId: string) => void;
  /** T93-13: Create outcome for the selected/current node */
  onCreateOutcome?: () => void;
  /** Optional class name for outer container */
  className?: string;
  /** T29-0: Dynamic width in pixels (desktop only, when open) */
  width?: number;
  /** Keyframes: Set of node IDs that are pinned */
  keyframeNodeIds?: Set<string>;
  /** Preferred language */
  lang?: Lang;
  /** T93-12: Outcome path highlighting */
  activeOutcomePathIds?: Set<string>;
  activeOutcomeKeyframeIds?: Set<string>;
}

/**
 * T60: Right Drawer - Main component (TreeCanvas only, no tabs)
 */
export function RightDrawerTabs({
  isOpen,
  onToggle,
  treeTitle,
  treeId,
  qaNodes,
  selectedQANodeId,
  onSelectNode,
  onCreateOutcome,
  className,
  width,
  keyframeNodeIds,
  lang = 'en',
  activeOutcomePathIds,
  activeOutcomeKeyframeIds,
}: RightDrawerTabsProps) {
  const effectiveLang: Lang = lang ?? 'en';
  const drawerTransitionClass = 'transition-[width] duration-180 ease-out motion-reduce:transition-none';

  // Clean title without "树" suffix
  const displayTitle = useMemo(() => {
    return treeTitle?.trim() || t(effectiveLang, 'tree_untitled');
  }, [treeTitle, effectiveLang]);

  // Collapsed state: show only a thin bar with expand button
  if (!isOpen) {
    return (
      <aside
        className={cn(
          'hidden lg:flex flex-col items-center border-l border-border',
          'w-14 py-4 gap-4 sidebar-dot-bg',
          drawerTransitionClass,
          className
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onToggle}
          title={t(effectiveLang, 'tree_view_expand')}
        >
          <PanelRightOpen className="h-5 w-5" />
        </Button>
      </aside>
    );
  }

  // Expanded state - just TreeCanvas (no tabs)
  const widthStyle = width ? { width: `${width}px` } : undefined;

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-l border-border',
        !width && 'w-64 xl:w-72 2xl:w-80',
        'relative bg-background', // T29: Replaced sidebar-dot-bg with bg-background to avoid double dots when TreeCanvas is present
        'min-h-0 overflow-hidden',
        drawerTransitionClass,
        'flex-shrink-0',
        className
      )}
      style={widthStyle}
      data-testid="right-drawer"
    >
      {/* T60: Floating glass header (no tabs, just title + collapse) */}
      <div className="absolute top-2 left-2 right-2 z-20">
        <div className="apple-glass-capsule !rounded-xl !py-2.5 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FolderTree className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate" title={displayTitle}>
                {displayTitle}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onToggle}
                title={t(effectiveLang, 'tree_view_collapse')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tree Canvas content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {treeId ? (
          <TreeCanvas
            nodes={qaNodes}
            selectedId={selectedQANodeId}
            onSelect={onSelectNode}
            onCreateOutcome={onCreateOutcome}
            keyframeNodeIds={keyframeNodeIds}
            lang={effectiveLang}
            activeOutcomePathIds={activeOutcomePathIds}
            activeOutcomeKeyframeIds={activeOutcomeKeyframeIds}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-6 text-center tree-canvas-bg">
            {t(effectiveLang, 'tree_view_empty')}
          </div>
        )}
      </div>
    </aside>
  );
}

export default RightDrawerTabs;
