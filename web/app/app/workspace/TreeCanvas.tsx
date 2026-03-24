  /** Keyframes: Set of node IDs with annotations (show badge) */
'use client';

import type React from 'react';
import {
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useCallback,
  useState,
  useLayoutEffect,
  useImperativeHandle,
} from 'react';
import { t, type Lang } from '@/lib/i18n';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { QANode } from '../../tree/qaClient';
import {
  layoutTree,
  computeActivePath,
  computeActiveTrackSegments,
  type TreeLayout,
  type TreeNode,
  type TreeEdge,
} from '../../tree/treeLayout';
import {
  buildBranchPath,
  formatAnswerPreview,
  formatCardTitle,
  formatTooltip,
  getNodeState,
  getNodeTier,
  computeNearbyNodes,
  getEdgeTier,
  type NodeTier,
  type EdgeTier,
} from '../../tree/treeRenderUtils';

// T22-9: Zoom controlled by slider only
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.0;
const DEFAULT_SCALE = 0.85;
const ZOOM_STEP = 0.05;
const ZOOM_STORAGE_KEY = 'tree-canvas-zoom';

// ============== T-VIEWPORT-CULL: Viewport Culling Constants ==============
// Buffer zone (in world-space pixels) beyond the visible viewport.
// Nodes/edges within this buffer are still rendered to prevent pop-in during panning.
const VIEWPORT_CULL_BUFFER = 300;
// Minimum number of nodes before culling kicks in. For small trees, render everything.
const VIEWPORT_CULL_THRESHOLD = 50;

// Root node styling constants
const ROOT_OUTER_RING_RADIUS = 20;  // Outer ring for root emphasis
const ROOT_INNER_GLOW_RADIUS = 16;  // Inner glow ring

// ============================================================
// Line width hierarchy: trunk > nearby > distant
// ============================================================
const LINE_WIDTH_TRUNK = 4;
const LINE_WIDTH_NEAR = 2.5;
const LINE_WIDTH_FAR = 1.5;

// Node dot radius hierarchy
const DOT_RADIUS_ACTIVE = 14;  // Selected node - largest
const DOT_RADIUS_TRUNK = 13;   // On main path
const DOT_RADIUS_NEAR = 11;    // Nearby siblings/children
const DOT_RADIUS_DEFAULT = 10; // Distant nodes

// T29-2: Removed INDEX_OFFSET_X and INDEX_OFFSET_Y - no longer showing # labels

// Node morphing: Dot → Card (centered on node position)
// Card sized for 2 lines of text with generous padding
const NODE_CARD_WIDTH = 200;
const NODE_CARD_HEIGHT = 64;
const NODE_CARD_RADIUS = 12;
const NODE_CARD_PADDING_X = 16;
const NODE_CARD_PADDING_Y = 14;

// Animation duration - slow enough for "growth" feel
const MORPH_DURATION_MS = 350;

// ============================================================
// Three-tier color system using CSS variables
// ============================================================
// Lines
const COLOR_LINE_TRUNK = 'hsl(var(--tree-line-trunk) / var(--tree-line-trunk-opacity))';
const COLOR_LINE_NEAR = 'hsl(var(--tree-line-near) / var(--tree-line-near-opacity))';
const COLOR_LINE_FAR = 'hsl(var(--tree-line-far) / var(--tree-line-far-opacity))';

// Nodes
const COLOR_NODE_ACTIVE = 'hsl(var(--tree-node-active))';
const COLOR_NODE_ACTIVE_GLOW = 'hsl(var(--tree-node-active-glow) / 0.35)';
const COLOR_NODE_TRUNK = 'hsl(var(--tree-node-trunk))';
const COLOR_NODE_NEAR = 'hsl(var(--tree-node-near))';
const COLOR_NODE_DEFAULT = 'hsl(var(--tree-node-default))';

// UI elements
const COLOR_LABEL = 'hsl(var(--muted-foreground) / 0.85)';
const COLOR_TOOLTIP_BG = 'hsl(var(--popover))';
const COLOR_TOOLTIP_BORDER = 'hsl(var(--border))';
const COLOR_TOOLTIP_TEXT = 'hsl(var(--popover-foreground))';
const TOOLTIP_SHADOW = 'drop-shadow(0 2px 6px rgba(0,0,0,0.10))';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export type TreeCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  scrollToNode: (nodeId: string) => void;
};

export type TreeCanvasProps = {
  nodes: QANode[];
  selectedId?: string | null;
  onSelect?: (nodeId: string) => void;
  /** T93-13: Create Layer2 Outcome (results) for the selected/current node */
  onCreateOutcome?: () => void;
  /** UI language for small labels/badges */
  lang?: Lang;
  /** Keyframes: Set of node IDs with annotations (show badge) */
  keyframeNodeIds?: Set<string>;
  /** T55-3: Snapshot anchors (flags) on tree nodes */
  snapshotAnchors?: Array<{
    snapshot_id: string;
    anchor_node_id: string;
    label: string;
    ts: string;
    pinned: boolean;
  }>;
  /** T55-3: Callback when snapshot flag is clicked */
  onSnapshotClick?: (snapshotId: string) => void;
  // T29-QA-2: Menu removed - click node directly to navigate
  /** T54-1: Mobile mode - disables hover tooltip */
  isMobile?: boolean;
  /** T93-12: Outcome path highlighting */
  activeOutcomePathIds?: Set<string>;
  activeOutcomeKeyframeIds?: Set<string>;
};

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(
  function TreeCanvas({ 
    nodes, 
    selectedId, 
    onSelect, 
    onCreateOutcome,
    keyframeNodeIds, 
    snapshotAnchors, 
    onSnapshotClick, 
    isMobile = false, 
    lang = 'en',
    activeOutcomePathIds,
    activeOutcomeKeyframeIds
  }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerSizeRef = useRef({ width: 0, height: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    
    // T55-3: Track hovered snapshot flag
    const [hoveredSnapshotId, setHoveredSnapshotId] = useState<string | null>(null);
    
    // Load persisted zoom scale from localStorage synchronously to avoid flicker
    const getSavedScale = (): number => {
      if (typeof window === 'undefined') return DEFAULT_SCALE;
      try {
        const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) {
            return parsed;
          }
        }
      } catch {}
      return DEFAULT_SCALE;
    };
    
    const [viewport, setViewport] = useState({ 
      scale: DEFAULT_SCALE, 
      translateX: 0, 
      translateY: 0 
    });
    const viewportRef = useRef(viewport);
    const transformGroupRef = useRef<SVGGElement | null>(null);
    const syncGlowVarsRef = useRef<
      (next: { scale: number; translateX: number; translateY: number }) => void
    >(() => {});
    const initialViewportRef = useRef(viewport);
    // Store user's preferred scale (from localStorage or manual adjustment)
    const userScaleRef = useRef<number | null>(null);
    const layoutInitializedRef = useRef(false);
    // Track the previous container width to detect when the panel opens/closes
    const prevContainerWidthRef = useRef<number>(0);
    
    // Load persisted zoom scale from localStorage on client mount
    useEffect(() => {
      if (userScaleRef.current !== null) return;
      const savedScale = getSavedScale();
      userScaleRef.current = savedScale;
      setViewport(prev => ({ ...prev, scale: savedScale }));
    }, []);
    const isPanningRef = useRef(false);
    const isPinchingRef = useRef(false);
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchStartRef = useRef<null | {
      distance: number;
      startScale: number;
      startTranslateX: number;
      startTranslateY: number;
      worldAtCenterX: number;
      worldAtCenterY: number;
    }>(null);
    const pinchRafRef = useRef<number | null>(null);
    const pendingPinchViewportRef = useRef<null | { scale: number; translateX: number; translateY: number }>(null);
    const lastPointerRef = useRef({ x: 0, y: 0 });
    const panRafRef = useRef<number | null>(null);
    const pendingPanDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
        // T-VIEWPORT-CULL: Track if culling should be active based on node count
        const shouldCullRef = useRef(nodes.length >= VIEWPORT_CULL_THRESHOLD);
        shouldCullRef.current = nodes.length >= VIEWPORT_CULL_THRESHOLD;

        const applyViewportTransform = useCallback((next: { scale: number; translateX: number; translateY: number }) => {
          const g = transformGroupRef.current;
          if (!g) return;
          // Keep consistent with the JSX transform below
          g.setAttribute(
            'transform',
            `matrix(${next.scale},0,0,${next.scale},${next.translateX},${next.translateY})`
          );
          // Keep glow in sync during DOM-driven pan/zoom (no React re-render)
          syncGlowVarsRef.current(next);

          // T-VIEWPORT-CULL: During pan/pinch on large trees, periodically
          // commit viewport to React state for cull boundary updates
          if (shouldCullRef.current && (isPanningRef.current || isPinchingRef.current)) {
            const now = Date.now();
            if (now - lastCullSyncRef.current > 200) {
              lastCullSyncRef.current = now;
              if (cullUpdateTimerRef.current) clearTimeout(cullUpdateTimerRef.current);
              cullUpdateTimerRef.current = setTimeout(() => {
                setViewport(prev => {
                  // Only update if significantly different to avoid unnecessary re-renders
                  const dx = Math.abs(prev.translateX - next.translateX);
                  const dy = Math.abs(prev.translateY - next.translateY);
                  const ds = Math.abs(prev.scale - next.scale);
                  if (dx > 30 || dy > 30 || ds > 0.02) {
                    return { ...next };
                  }
                  return prev;
                });
              }, 50);
            }
          }
        }, []); // No deps needed — uses refs only

        // Keep DOM transform in sync with React state when viewport changes for reasons other than panning
        useLayoutEffect(() => {
          viewportRef.current = viewport;
          applyViewportTransform(viewport);
        }, [viewport, applyViewportTransform]);

    // T29-QA-2: Menu removed - click node directly to navigate

    const layout: TreeLayout = useMemo(() => layoutTree(nodes), [nodes]);
    const activePath = useMemo(() => computeActivePath(nodes, selectedId), [nodes, selectedId]);
    const nearbyIds = useMemo(() => computeNearbyNodes(nodes, selectedId), [nodes, selectedId]);
    const activeSegments = useMemo(
      () => computeActiveTrackSegments(layout, activePath),
      [layout, activePath]
    );

    // ============== T-VIEWPORT-CULL: Viewport Culling ==============
    // Compute the visible world-space bounding box from the current viewport transform.
    // Only nodes/edges within this box (+ buffer) get rendered.
    // For small trees (< VIEWPORT_CULL_THRESHOLD nodes), skip culling entirely.
    const shouldCull = layout.nodes.length >= VIEWPORT_CULL_THRESHOLD;

    const visibleWorldBounds = useMemo(() => {
      if (!shouldCull) return null;
      const { width, height } = containerSize;
      if (width === 0 || height === 0) return null;
      const { scale, translateX, translateY } = viewport;
      if (scale <= 0) return null;
      // Convert screen corners to world coordinates
      const worldMinX = (0 - translateX) / scale - VIEWPORT_CULL_BUFFER;
      const worldMinY = (0 - translateY) / scale - VIEWPORT_CULL_BUFFER;
      const worldMaxX = (width - translateX) / scale + VIEWPORT_CULL_BUFFER;
      const worldMaxY = (height - translateY) / scale + VIEWPORT_CULL_BUFFER;
      return { minX: worldMinX, minY: worldMinY, maxX: worldMaxX, maxY: worldMaxY };
    }, [shouldCull, containerSize.width, containerSize.height, viewport.scale, viewport.translateX, viewport.translateY]);

    // Filter nodes to only those visible in the viewport (+ buffer) or on the active path.
    // Active path nodes are always rendered regardless of position to keep the visual continuity.
    const visibleNodeIds = useMemo(() => {
      if (!shouldCull || !visibleWorldBounds) return null; // null = render all
      const bounds = visibleWorldBounds;
      const ids = new Set<string>();
      for (const node of layout.nodes) {
        // Always render selected node, active path, and nearby nodes
        if (node.id === selectedId || activePath.has(node.id) || nearbyIds.has(node.id)) {
          ids.add(node.id);
          continue;
        }
        // Check if node is within visible bounds
        // Account for card dimensions when selected
        const halfW = NODE_CARD_WIDTH / 2 + DOT_RADIUS_ACTIVE;
        const halfH = NODE_CARD_HEIGHT / 2 + DOT_RADIUS_ACTIVE;
        if (
          node.x + halfW >= bounds.minX &&
          node.x - halfW <= bounds.maxX &&
          node.y + halfH >= bounds.minY &&
          node.y - halfH <= bounds.maxY
        ) {
          ids.add(node.id);
        }
      }
      return ids;
    }, [shouldCull, visibleWorldBounds, layout.nodes, selectedId, activePath, nearbyIds]);

    // Debounced viewport update during panning for viewport culling refresh.
    // During pan/pinch, viewport state changes are only committed at gesture end.
    // To update culling boundaries during long pans, periodically sync.
    const cullUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCullSyncRef = useRef<number>(0);

    // Cleanup cull timer on unmount
    useEffect(() => {
      return () => {
        if (cullUpdateTimerRef.current) clearTimeout(cullUpdateTimerRef.current);
      };
    }, []);

    // T93-1: Story Mode auto-fit removed
    
    // Identify root node (node with no parent)
    const rootNodeId = useMemo(() => {
      const rootNode = nodes.find(n => !n.parent_id);
      return rootNode?.id ?? null;
    }, [nodes]);

    const nodeById = useMemo(() => {
      const map = new Map<string, TreeNode>();
      layout.nodes.forEach((n) => map.set(n.id, n));
      return map;
    }, [layout.nodes]);

    // Keep the background glow position synced to the selected node without causing
    // rerenders during pan/zoom (we update CSS variables imperatively).
    syncGlowVarsRef.current = (next) => {
      const el = containerRef.current;
      if (!el) return;
      if (!selectedId) {
        el.style.removeProperty('--glow-x');
        el.style.removeProperty('--glow-y');
        return;
      }
      const node = nodeById.get(selectedId);
      if (!node) {
        el.style.removeProperty('--glow-x');
        el.style.removeProperty('--glow-y');
        return;
      }
      const screenX = node.x * next.scale + next.translateX;
      const screenY = node.y * next.scale + next.translateY;
      el.style.setProperty('--glow-x', `${screenX}px`);
      el.style.setProperty('--glow-y', `${screenY}px`);
    };

    const scrollToNode = useCallback(
      (nodeId: string) => {
        const node = nodeById.get(nodeId);
        if (!node) return;

        const { width, height } = containerSizeRef.current;
        if (width === 0 || height === 0) return;

        // Center the selected node in the viewport
        setViewport((prev) => {
          const targetX = width * 0.5 - node.x * prev.scale;
          const targetY = height * 0.5 - node.y * prev.scale;
          
          // Animate to target
          const startX = prev.translateX;
          const startY = prev.translateY;
          const startTime = performance.now();
          const duration = 300;

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            setViewport((p) => ({
              ...p,
              translateX: startX + (targetX - startX) * eased,
              translateY: startY + (targetY - startY) * eased,
            }));

            if (progress < 1) requestAnimationFrame(animate);
          };

          requestAnimationFrame(animate);
          return prev;  // Return unchanged for now, animation will update
        });
      },
      [nodeById]
    );

    // Track previous selectedId to only center when it changes
    const prevSelectedIdRef = useRef<string | null>(null);
    // Track if viewport has been initialized
    const viewportInitializedRef = useRef(false);
    
    useEffect(() => {
      // Only scroll to node when selectedId changes (not on initial mount)
      if (selectedId && selectedId !== prevSelectedIdRef.current && viewportInitializedRef.current) {
        prevSelectedIdRef.current = selectedId;
        const timer = setTimeout(() => scrollToNode(selectedId), 60);
        return () => clearTimeout(timer);
      }
      // Update ref even if we don't scroll
      prevSelectedIdRef.current = selectedId ?? null;
    }, [selectedId, scrollToNode]);

    // When selection changes (or layout remaps nodes), update glow vars immediately.
    useLayoutEffect(() => {
      syncGlowVarsRef.current(viewportRef.current);
    }, [selectedId, nodeById]);

    useLayoutEffect(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const element = containerRef.current;
      if (!element) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          containerSizeRef.current = { width, height };
          setContainerSize({ width, height });
        }
      });

      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    // Calculate initial viewport when container size or layout changes
    // Also recalculate when container width changes significantly (e.g., right panel opens/closes)
    useEffect(() => {
      const { width, height } = containerSizeRef.current;
      if (width === 0 || height === 0 || !layout.bounds) return;
      
      // Check if this is the first initialization or a significant width change
      const isFirstInit = !layoutInitializedRef.current;
      const widthChanged = Math.abs(width - prevContainerWidthRef.current) > 10; // 10px threshold
      prevContainerWidthRef.current = width;

      // Only recalculate if:
      // 1. First time initializing, OR
      // 2. Container width changed significantly (e.g., right panel opened/closed)
      if (!isFirstInit && !widthChanged) return;
      
      if (!layoutInitializedRef.current) {
        layoutInitializedRef.current = true;
      }

      const { minX, maxX, minY, maxY } = layout.bounds;
      
      // Use user's saved scale preference, or default if not set
      const scale = userScaleRef.current ?? DEFAULT_SCALE;

      let translateX: number;
      let translateY: number;

      // If we have a selected node, center on it
      const selectedNode = selectedId ? nodeById.get(selectedId) : null;
      if (selectedNode) {
        // Center the selected node in the viewport
        translateX = width / 2 - selectedNode.x * scale;
        translateY = height / 2 - selectedNode.y * scale;
      } else {
        // No selected node, center on tree
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        translateX = width / 2 - centerX * scale;
        translateY = height / 2 - centerY * scale;
      }

      const newViewport = { scale, translateX, translateY };
      initialViewportRef.current = newViewport;
      setViewport(newViewport);
      
      // Mark viewport as initialized
      viewportInitializedRef.current = true;
    }, [containerSize.width, containerSize.height, layout.bounds, selectedId, nodeById]);

    // T22-2-FIX: zoomBy removed - zoom disabled, only panning allowed

    const resetView = useCallback(() => {
      const initial = initialViewportRef.current;
      if (initial) setViewport({ ...initial });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        // T22-2-FIX: Zoom methods now no-op (zoom disabled, only panning allowed)
        zoomIn: () => {},
        zoomOut: () => {},
        resetView,
        scrollToNode,
      }),
      [resetView, scrollToNode]
    );

    // T22-2-FIX: handleWheel removed - zoom disabled, only panning allowed via pointer events

    const getFirstTwoTouchPoints = useCallback(() => {
      const pts = Array.from(activePointersRef.current.values());
      if (pts.length < 2) return null;
      const p0 = pts[0];
      const p1 = pts[1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const distance = Math.hypot(dx, dy);
      const centerX = (p0.x + p1.x) / 2;
      const centerY = (p0.y + p1.y) / 2;
      return { distance, centerX, centerY };
    }, []);

    const startPinch = useCallback(() => {
      const two = getFirstTwoTouchPoints();
      if (!two) return;
      const { distance, centerX, centerY } = two;
      if (distance <= 0.0001) return;

      // Cancel panning if it was active
      isPanningRef.current = false;
      pendingPanDeltaRef.current = null;
      if (panRafRef.current !== null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }

      isPinchingRef.current = true;

      const v = viewportRef.current;
      const worldAtCenterX = (centerX - v.translateX) / v.scale;
      const worldAtCenterY = (centerY - v.translateY) / v.scale;

      pinchStartRef.current = {
        distance,
        startScale: v.scale,
        startTranslateX: v.translateX,
        startTranslateY: v.translateY,
        worldAtCenterX,
        worldAtCenterY,
      };
    }, [getFirstTwoTouchPoints]);

    const endGesture = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
      // Maintain pointer map for touch gestures
      if (event.pointerType === 'touch') {
        activePointersRef.current.delete(event.pointerId);
      }

      if (isPinchingRef.current) {
        if (activePointersRef.current.size >= 2) return;
        isPinchingRef.current = false;
        pinchStartRef.current = null;
        pendingPinchViewportRef.current = null;
        if (pinchRafRef.current !== null) {
          cancelAnimationFrame(pinchRafRef.current);
          pinchRafRef.current = null;
        }

        // Persist scale preference
        userScaleRef.current = viewportRef.current.scale;
        try {
          localStorage.setItem(ZOOM_STORAGE_KEY, String(viewportRef.current.scale));
        } catch {}

        // Commit the final DOM-updated viewport back into React state once.
        setViewport(viewportRef.current);
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        pendingPanDeltaRef.current = null;
        if (panRafRef.current !== null) {
          cancelAnimationFrame(panRafRef.current);
          panRafRef.current = null;
        }

        // Persist scale preference (scale may have been changed before)
        userScaleRef.current = viewportRef.current.scale;
        try {
          localStorage.setItem(ZOOM_STORAGE_KEY, String(viewportRef.current.scale));
        } catch {}

        // Commit the final DOM-updated viewport back into React state once.
        setViewport(viewportRef.current);
      }

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    }, []);

    // T22-9: Zoom control via slider with persistence
    const handleZoomChange = useCallback((newScale: number) => {
      const { width, height } = containerSizeRef.current;
      const centerX = width / 2;
      const centerY = height / 2;
      
      const clampedScale = clamp(newScale, MIN_SCALE, MAX_SCALE);
      
      // Update user preference ref
      userScaleRef.current = clampedScale;
      
      // Persist to localStorage
      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, clampedScale.toString());
      } catch {}
      
      setViewport((prev) => {
        // Zoom centered on viewport center
        const scaleRatio = clampedScale / prev.scale;
        const newTranslateX = centerX - (centerX - prev.translateX) * scaleRatio;
        const newTranslateY = centerY - (centerY - prev.translateY) * scaleRatio;
        
        return {
          scale: clampedScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        };
      });
    }, []);

    // T22-9: Reset zoom to default
    const handleZoomReset = useCallback(() => {
      // Reset user preference to default
      userScaleRef.current = DEFAULT_SCALE;
      try {
        localStorage.setItem(ZOOM_STORAGE_KEY, DEFAULT_SCALE.toString());
      } catch {}
      handleZoomChange(DEFAULT_SCALE);
    }, [handleZoomChange]);

    const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
      // Track touch pointers for pinch zoom
      if (event.pointerType === 'touch') {
        activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}

        // If two fingers are down, start pinch regardless of target
        if (activePointersRef.current.size === 2) {
          startPinch();
          event.preventDefault();
          return;
        }
      }

      // Only start panning if clicking on background, not on a node
      const target = event.target as Element;
      if (target.closest('.tree-node-morph')) return;
      if (isPinchingRef.current) return;

      isPanningRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      event.preventDefault();
    }, []);

    const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
      if (event.pointerType === 'touch') {
        if (activePointersRef.current.has(event.pointerId)) {
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }

        // Pinch-to-zoom on mobile
        if (isPinchingRef.current && activePointersRef.current.size >= 2) {
          const start = pinchStartRef.current;
          const two = getFirstTwoTouchPoints();
          if (!start || !two) return;

          const ratio = two.distance / start.distance;
          const rawScale = start.startScale * ratio;
          const clampedScale = clamp(rawScale, MIN_SCALE, MAX_SCALE);

          // Keep the world point under the initial pinch center anchored under the current pinch center
          const translateX = two.centerX - start.worldAtCenterX * clampedScale;
          const translateY = two.centerY - start.worldAtCenterY * clampedScale;

          pendingPinchViewportRef.current = { scale: clampedScale, translateX, translateY };
          if (pinchRafRef.current === null) {
            pinchRafRef.current = requestAnimationFrame(() => {
              pinchRafRef.current = null;
              const next = pendingPinchViewportRef.current;
              pendingPinchViewportRef.current = null;
              if (!next) return;
              viewportRef.current = next;
              applyViewportTransform(next);
            });
          }

          event.preventDefault();
          return;
        }

        // If a second finger joins later, start pinch
        if (!isPinchingRef.current && activePointersRef.current.size === 2) {
          startPinch();
          event.preventDefault();
          return;
        }
      }

      if (!isPanningRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const prev = pendingPanDeltaRef.current;
      pendingPanDeltaRef.current = prev
        ? { dx: prev.dx + dx, dy: prev.dy + dy }
        : { dx, dy };

      if (panRafRef.current !== null) return;
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null;
        const delta = pendingPanDeltaRef.current;
        pendingPanDeltaRef.current = null;
        if (!delta) return;
        const prevViewport = viewportRef.current;
        const nextViewport = {
          ...prevViewport,
          translateX: prevViewport.translateX + delta.dx,
          translateY: prevViewport.translateY + delta.dy,
        };
        viewportRef.current = nextViewport;
        applyViewportTransform(nextViewport);
      });
    }, []);

    useEffect(() => {
      return () => {
        if (panRafRef.current !== null) {
          cancelAnimationFrame(panRafRef.current);
          panRafRef.current = null;
        }
      };
    }, []);

    const handleNodeClick = useCallback(
      (nodeId: string, event?: React.MouseEvent) => {
        // Stop propagation to prevent panning
        event?.stopPropagation();
        event?.preventDefault();
        // Reset panning state
        isPanningRef.current = false;
        onSelect?.(nodeId);
      },
      [onSelect]
    );

    // ============================================================
    // Three-tier track rendering
    // ============================================================
    
    // Get tier for a track based on nodes on it
    const getTrackTier = (track: { nodeIds: string[] }): EdgeTier => {
      const hasPathNode = track.nodeIds.some(id => activePath.has(id));
      if (hasPathNode) return 'trunk';
      const hasNearNode = track.nodeIds.some(id => nearbyIds.has(id));
      if (hasNearNode) return 'nearby';
      return 'distant';
    };

    // T-VIEWPORT-CULL: Tracks and active segments are culled by Y range overlap
    const renderTracks = () => {
      return layout.tracks.map((track) => {
        const extend = 12;
        const startY = track.startY - extend;
        const endY = track.endY + extend;

        // Cull tracks outside viewport
        if (visibleWorldBounds) {
          if (track.x < visibleWorldBounds.minX || track.x > visibleWorldBounds.maxX) return null;
          if (endY < visibleWorldBounds.minY || startY > visibleWorldBounds.maxY) return null;
        }
        
        // Determine tier for base track style
        const tier = getTrackTier(track);
        const { color, width } = tier === 'trunk' 
          ? { color: COLOR_LINE_FAR, width: LINE_WIDTH_FAR }  // Will be covered by active
          : tier === 'nearby'
            ? { color: COLOR_LINE_NEAR, width: LINE_WIDTH_NEAR }
            : { color: COLOR_LINE_FAR, width: LINE_WIDTH_FAR };
        
        return (
          <line
            key={`track-${track.index}`}
            x1={track.x}
            y1={startY}
            x2={track.x}
            y2={endY}
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
          />
        );
      });
    };

    const renderActiveTracks = () => {
      return activeSegments.map((segment, idx) => {
        // Cull active segments outside viewport
        if (visibleWorldBounds) {
          if (segment.x < visibleWorldBounds.minX || segment.x > visibleWorldBounds.maxX) return null;
          if (segment.toY < visibleWorldBounds.minY || segment.fromY > visibleWorldBounds.maxY) return null;
        }
        return (
        <line
          key={`active-track-${idx}`}
          x1={segment.x}
          y1={segment.fromY}
          x2={segment.x}
          y2={segment.toY}
          stroke={COLOR_LINE_TRUNK}
          strokeWidth={LINE_WIDTH_TRUNK}
          strokeLinecap="round"
        />
        );
      });
    };

    // T93-12: Outcome mode detection
    const isOutcomeMode = activeOutcomePathIds && activeOutcomePathIds.size > 0;

    // Render branch edges with tier-based styling
    // T-VIEWPORT-CULL: Filter edges where both endpoints are outside viewport
    const renderTieredBranchEdges = (edges: TreeEdge[]) => {
      // Pre-filter edges by culling (only if culling is active)
      const culledEdges = visibleNodeIds
        ? edges.filter((e) => visibleNodeIds.has(e.from.id) || visibleNodeIds.has(e.to.id))
        : edges;
      // Sort edges: distant first, then nearby, then trunk (so trunk renders on top)
      const sortedEdges = [...culledEdges].sort((a, b) => {
        // T93-12: Outcome path takes priority in rendering order
        const isOutcomeA = isOutcomeMode && activeOutcomePathIds.has(a.from.id) && activeOutcomePathIds.has(a.to.id);
        const isOutcomeB = isOutcomeMode && activeOutcomePathIds.has(b.from.id) && activeOutcomePathIds.has(b.to.id);
        if (isOutcomeA !== isOutcomeB) return isOutcomeA ? 1 : -1;

        const tierA = getEdgeTier(a, activePath, nearbyIds);
        const tierB = getEdgeTier(b, activePath, nearbyIds);
        const order = { distant: 0, nearby: 1, trunk: 2 };
        return order[tierA] - order[tierB];
      });

      return sortedEdges.map((edge, index) => {
        const tier = getEdgeTier(edge, activePath, nearbyIds);
        const inOutcomePath = isOutcomeMode && activeOutcomePathIds.has(edge.from.id) && activeOutcomePathIds.has(edge.to.id);
        
        let color: string;
        let width: number;
        let opacity = 1.0;

        // T93-12: Base tier styling
        switch (tier) {
          case 'trunk':
            color = COLOR_LINE_TRUNK;
            width = LINE_WIDTH_TRUNK;
            break;
          case 'nearby':
            color = COLOR_LINE_NEAR;
            width = LINE_WIDTH_NEAR;
            break;
          default:
            color = COLOR_LINE_FAR;
            width = LINE_WIDTH_FAR;
        }

        // T93-12: Apply Outcome Highlighting overrides
        if (isOutcomeMode) {
          if (inOutcomePath) {
            color = 'var(--primary)'; // Or a specific outcome color
            width = 4.0; // Thick path for outcome
            opacity = 1.0;
          } else {
            opacity = 0.08; // Dim everything else
          }
        }

        return (
          <path
            key={`edge-${tier}-${index}`}
            d={buildBranchPath(edge, 12)}
            stroke={color}
            strokeWidth={width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ 
              opacity, 
              transition: 'opacity 0.4s ease, stroke 0.4s ease, stroke-width 0.4s ease' 
            }}
          />
        );
      });
    };

    // Render nodes - each node morphs from dot to card when selected
    // Three-tier hierarchy: selected > trunk > nearby > distant
    // Root node gets special emphasis styling
    // T-VIEWPORT-CULL: Only render nodes visible in the viewport (or on active path)
    const renderNodes = () => {
      const nodesToRender = visibleNodeIds
        ? layout.nodes.filter((n) => visibleNodeIds.has(n.id))
        : layout.nodes;

      return nodesToRender.map((node) => {
        const tier = getNodeTier(node.id, selectedId, activePath, nearbyIds);
        const isSelected = tier === 'selected';
        const isHovered = hoveredId === node.id && !isSelected;
        const isRoot = node.id === rootNodeId;
        const inOutcomePath = isOutcomeMode && activeOutcomePathIds.has(node.id);
        const isOutcomeKeyframe = isOutcomeMode && activeOutcomeKeyframeIds?.has(node.id);

        // Three-tier node styling
        let fillColor: string;
        let strokeColor: string;
        let strokeWidth: number;
        let dotRadius: number;
        let opacity = 1.0;

        switch (tier) {
          case 'selected':
            fillColor = COLOR_NODE_ACTIVE;
            strokeColor = 'hsl(var(--tree-node-active-glow) / 0.5)';
            strokeWidth = 2;
            dotRadius = DOT_RADIUS_ACTIVE;
            break;
          case 'trunk':
            fillColor = COLOR_NODE_TRUNK;
            strokeColor = 'hsl(var(--tree-node-trunk-stroke, var(--background)) / 0.7)';
            strokeWidth = 2;
            dotRadius = DOT_RADIUS_TRUNK;
            break;
          case 'nearby':
            fillColor = COLOR_NODE_NEAR;
            strokeColor = 'hsl(var(--background) / 0.35)';
            strokeWidth = 1.5;
            dotRadius = DOT_RADIUS_NEAR;
            break;
          default: // distant
            fillColor = COLOR_NODE_DEFAULT;
            strokeColor = 'hsl(var(--tree-node-default-stroke, var(--background)) / 0.2)';
            strokeWidth = 1;
            dotRadius = DOT_RADIUS_DEFAULT;
        }

        // T93-12: Apply Outcome Highlighting overrides
        if (isOutcomeMode) {
          if (inOutcomePath) {
            opacity = 1.0;
            if (isOutcomeKeyframe) {
              dotRadius = dotRadius + 1.5;
              strokeColor = 'var(--primary)';
              strokeWidth = 2.5;
            }
          } else {
            opacity = 0.08;
          }
        }
        
        // Morphing dimensions: dot (circle) → card (rounded rect)
        // All centered on (node.x, node.y)
        const dotSize = dotRadius * 2;
        const cardWidth = isSelected ? NODE_CARD_WIDTH : dotSize;
        const cardHeight = isSelected ? NODE_CARD_HEIGHT : dotSize;
        const cardRadius = isSelected ? NODE_CARD_RADIUS : dotRadius;  // Stays circular when dot
        
        // Center the rect on (node.x, node.y)
        const rectX = node.x - cardWidth / 2;
        const rectY = node.y - cardHeight / 2;

        // Text content for selected card - truncate with ellipsis
        // Uses pixel-based width estimation to handle CJK and Latin characters fairly
        const title = formatCardTitle(node.qaNode.user_text);
        const preview = formatAnswerPreview(node.qaNode);

        return (
          <g
            key={node.id}
            className="tree-node-morph"
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId((prev) => (prev === node.id ? null : prev))}
            onClick={(e) => handleNodeClick(node.id, e)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ 
              cursor: 'pointer', 
              outline: 'none',
              opacity,
              transition: 'opacity 0.4s ease'
            }}
          >
            {/* Invisible hit area for easier clicking (larger than visible dot) */}
            <rect
              x={node.x - (isSelected ? NODE_CARD_WIDTH / 2 : dotRadius + 4)}
              y={node.y - (isSelected ? NODE_CARD_HEIGHT / 2 : dotRadius + 4)}
              width={isSelected ? NODE_CARD_WIDTH : (dotRadius + 4) * 2}
              height={isSelected ? NODE_CARD_HEIGHT : (dotRadius + 4) * 2}
              fill="transparent"
              className="node-hit-area"
            />
            
            {/* T93-12: Outcome keyframe glow */}
            {isOutcomeKeyframe && !isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={dotRadius + 6}
                fill="hsl(var(--primary) / 0.15)"
                className="animate-pulse"
              />
            )}

            {/* T22-9: Root node emphasis - double ring + inner glow */}
            {isRoot && !isSelected && (
              <>
                {/* Outer ring - always visible for root */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={ROOT_OUTER_RING_RADIUS}
                  fill="none"
                  stroke="hsl(var(--tree-node-active) / 0.25)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  className="root-outer-ring"
                />
                {/* Inner glow ring */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={ROOT_INNER_GLOW_RADIUS}
                  fill="hsl(var(--tree-node-active-glow) / 0.18)"
                  stroke="none"
                  className="root-inner-glow"
                />
              </>
            )}
            
            {/* Halo effect for hover (only when not selected) */}
            {isHovered && !isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={dotRadius + 6}
                fill={COLOR_NODE_ACTIVE_GLOW}
                opacity={0.5}
                className="node-halo"
              />
            )}
            
            {/* T29-QA-2: Active node glow effect removed - cleaner visual */}
            
            {/* The morphing shape: circle ↔ rounded rect (always SVG rect for smooth animation) */}
            <rect
              x={rectX}
              y={rectY}
              width={cardWidth}
              height={cardHeight}
              rx={cardRadius}
              ry={cardRadius}
              fill={isSelected ? 'transparent' : fillColor}
              stroke={isSelected ? 'transparent' : strokeColor}
              strokeWidth={strokeWidth}
              className="node-shape"
            />
            
            {/* Root icon label - small badge (only when root is not selected) */}
            {isRoot && !isSelected && (
              <g className="root-label">
                <circle
                  cx={node.x + dotRadius + 2}
                  cy={node.y - dotRadius - 2}
                  r={8}
                  fill="hsl(var(--tree-node-active))"
                />
                <text
                  x={node.x + dotRadius + 2}
                  y={node.y - dotRadius - 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={700}
                  fill="hsl(var(--primary-foreground))"
                  style={{ pointerEvents: 'none' }}
                >
                  {t(lang, 'tree_root_badge')}
                </text>
              </g>
            )}
            
            {/* Selected node card (SVG-only for iOS Safari stability) */}
            {isSelected && (
              <g className="node-card" style={{ pointerEvents: 'none' }}>
                <rect
                  x={rectX}
                  y={rectY}
                  width={cardWidth}
                  height={cardHeight}
                  rx={NODE_CARD_RADIUS}
                  ry={NODE_CARD_RADIUS}
                  fill={'hsl(var(--popover) / 0.75)'}
                  stroke={'hsl(var(--border) / 0.70)'}
                  strokeWidth={1}
                  style={{ filter: TOOLTIP_SHADOW }}
                />
                <text
                  x={rectX + NODE_CARD_PADDING_X}
                  y={rectY + NODE_CARD_PADDING_Y + 10}
                  fontSize={13}
                  fontWeight={600}
                  fill={'hsl(var(--foreground))'}
                  dominantBaseline="alphabetic"
                >
                  {`Q: ${title}`}
                </text>
                <text
                  x={rectX + NODE_CARD_PADDING_X}
                  y={rectY + NODE_CARD_PADDING_Y + 10 + 18}
                  fontSize={12}
                  fontWeight={500}
                  fill={'hsl(var(--muted-foreground) / 0.85)'}
                  dominantBaseline="alphabetic"
                >
                  {`A: ${preview}`}
                </text>
              </g>
            )}
            
            {/* Keyframes: Annotation badge */}
            {keyframeNodeIds?.has(node.id) && !isRoot && (
              <g className="node-keyframe-badge">
                <circle
                  cx={node.x + (isSelected ? NODE_CARD_WIDTH / 2 - 30 : dotRadius - 16)}
                  cy={node.y + (isSelected ? -NODE_CARD_HEIGHT / 2 + 12 : -dotRadius - 2)}
                  r={8}
                  fill={'hsl(var(--primary) / 0.16)'}
                  stroke="hsl(var(--background) / 0.8)"
                  strokeWidth={1}
                />
                {/* Minimal annotation glyph */}
                <rect
                  x={node.x + (isSelected ? NODE_CARD_WIDTH / 2 - 30 : dotRadius - 16) - 3}
                  y={node.y + (isSelected ? -NODE_CARD_HEIGHT / 2 + 9 : -dotRadius - 5) - 2.5}
                  width={6}
                  height={5}
                  rx={1.5}
                  fill={'hsl(var(--primary) / 0.85)'}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )}
            
            {/* T29-QA-2: Hover menu removed - click node directly to navigate */}
          </g>
        );
      });
    };

    // Render hover tooltip as SVG element (rendered on top of everything)
    // Render hover tooltip as SVG element (rendered on top of everything)
    // T54-1: Disabled on mobile since there's no hover event on touch devices
    const renderHoverTooltip = () => {
      if (isMobile) return null; // No hover tooltip on mobile
      if (!hoveredId || hoveredId === selectedId) return null;
      const node = nodeById.get(hoveredId);
      if (!node) return null;

      const tooltipText = formatTooltip(node.qaNode.user_text);
      // Limit to 20 characters max, add ellipsis if longer
      const maxChars = 20;
      const shortTooltip =
        tooltipText.length > maxChars ? `${tooltipText.slice(0, maxChars)}…` : tooltipText;
      
      // Dynamic width based on text length (approx 12px per char for Chinese, 7px for English)
      // Use a rough estimate: average 10px per character
      const textWidth = shortTooltip.length * 10;
      const tooltipPadding = 24; // 12px padding on each side
      const tooltipWidth = textWidth + tooltipPadding;
      const tooltipHeight = 32;

      const tooltipX = node.x - tooltipWidth / 2;
      const tooltipY = node.y - DOT_RADIUS_DEFAULT - 12 - tooltipHeight; // Position above the dot

      return (
        <g className="tree-hover-tooltip" style={{ pointerEvents: 'none' }}>
          <rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipWidth}
            height={tooltipHeight}
            rx={6}
            fill={COLOR_TOOLTIP_BG}
            stroke={COLOR_TOOLTIP_BORDER}
            strokeWidth={1}
            style={{ filter: TOOLTIP_SHADOW }}
          />
          <text
            x={node.x}
            y={tooltipY + tooltipHeight / 2 + 4}
            fontSize={12}
            fontWeight={500}
            fill={COLOR_TOOLTIP_TEXT}
            textAnchor="middle"
            style={{ pointerEvents: 'none' }}
          >
            {shortTooltip}
          </text>
        </g>
      );
    };

    // T55-3: Render snapshot flags (small triangular flags on nodes)
    // T-VIEWPORT-CULL: Skip flags on non-visible nodes
    const renderSnapshotFlags = () => {
      if (!snapshotAnchors || snapshotAnchors.length === 0) return null;
      
      return snapshotAnchors.map((anchor) => {
        // Cull flags on non-visible nodes
        if (visibleNodeIds && !visibleNodeIds.has(anchor.anchor_node_id)) return null;
        const node = nodeById.get(anchor.anchor_node_id);
        if (!node) return null;
        
        const isHovered = hoveredSnapshotId === anchor.snapshot_id;
        const isSelected = selectedId === anchor.anchor_node_id;
        
        // Position flag to the right of the node
        const flagX = node.x + (isSelected ? NODE_CARD_WIDTH / 2 + 8 : DOT_RADIUS_DEFAULT + 8);
        const flagY = node.y - (isSelected ? NODE_CARD_HEIGHT / 4 : 0);
        
        // Flag pole and triangle
        const poleHeight = 16;
        const flagWidth = 10;
        const flagHeight = 8;
        
        // Color based on pinned status
        const flagColor = anchor.pinned 
          ? 'hsl(35 60% 50%)' // Orange for pinned
          : 'hsl(var(--primary))'; // Primary color for regular
        
        return (
          <g
            key={anchor.snapshot_id}
            className="snapshot-flag"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onSnapshotClick?.(anchor.snapshot_id);
            }}
            onMouseEnter={() => setHoveredSnapshotId(anchor.snapshot_id)}
            onMouseLeave={() => setHoveredSnapshotId((prev) => prev === anchor.snapshot_id ? null : prev)}
          >
            {/* Flag pole */}
            <line
              x1={flagX}
              y1={flagY}
              x2={flagX}
              y2={flagY - poleHeight}
              stroke={flagColor}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            
            {/* Flag triangle */}
            <path
              d={`M ${flagX} ${flagY - poleHeight} L ${flagX + flagWidth} ${flagY - poleHeight + flagHeight / 2} L ${flagX} ${flagY - poleHeight + flagHeight} Z`}
              fill={flagColor}
              opacity={isHovered ? 1 : 0.75}
            />
            
            {/* Hover tooltip for flag */}
            {isHovered && (
              <g className="flag-tooltip">
                <rect
                  x={flagX + flagWidth + 4}
                  y={flagY - poleHeight - 16}
                  width={Math.max(180, anchor.label.length * 6)}
                  height={28}
                  rx={4}
                  fill={COLOR_TOOLTIP_BG}
                  stroke={COLOR_TOOLTIP_BORDER}
                  strokeWidth={1}
                  style={{ filter: TOOLTIP_SHADOW }}
                />
                <text
                  x={flagX + flagWidth + 10}
                  y={flagY - poleHeight - 4}
                  fontSize={11}
                  fontWeight={500}
                  fill={COLOR_TOOLTIP_TEXT}
                  dominantBaseline="middle"
                >
                  {anchor.label.length > 30 ? `${anchor.label.substring(0, 30)}...` : anchor.label}
                </text>
              </g>
            )}
          </g>
        );
      });
    };

    // T29-2: Removed renderIndexLabels function - no more # badges on nodes

    const branchEdges = useMemo(
      () => layout.edges.filter((edge) => edge.isBranch),
      [layout.edges]
    );

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden select-none tree-canvas-container"
      >
        {/* Background layers: base color + grid pattern + glow */}
        <div 
          className="absolute inset-0 pointer-events-none tree-canvas-bg"
          aria-hidden="true"
        />
        <svg
          ref={svgRef}
          className="h-full w-full relative"
          tabIndex={-1}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerLeave={endGesture}
          onPointerCancel={endGesture}
          style={{ touchAction: 'none' }}
        >
          <defs>
            <style>{`
              /* Disable text selection in tree */
              svg {
                user-select: none;
                -webkit-user-select: none;
              }
              /* Remove focus outline */
              .tree-node-morph:focus,
              .tree-node-morph:focus-visible {
                outline: none !important;
              }
              svg:focus {
                outline: none;
              }
              /* Node morphing animation: dot ↔ card */
              .tree-node-morph .node-shape {
                transition: 
                  x ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  y ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  width ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  height ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  rx ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  ry ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  fill ${MORPH_DURATION_MS}ms ease-out,
                  stroke ${MORPH_DURATION_MS}ms ease-out,
                  filter ${MORPH_DURATION_MS}ms ease-out;
              }
              /* Glass card foreignObject animation */
              .tree-node-morph .node-glass-card {
                transition: 
                  x ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  y ${MORPH_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  width ${MORPH_DURATION_MS}ms cubic-bezier(0.22, 1.0, 0.36, 1),
                  height ${MORPH_DURATION_MS}ms cubic-bezier(0.22, 1.0, 0.36, 1);
              }
              /* Glass card content fade-in animation */
              .tree-node-morph .node-glass-content {
                animation: glassCardFadeIn ${MORPH_DURATION_MS * 0.9}ms cubic-bezier(0.4, 0, 0.2, 1) ${MORPH_DURATION_MS * 0.15}ms forwards;
              }
              @keyframes glassCardFadeIn {
                from {
                  opacity: 0;
                  transform: scale(0.85);
                }
                to {
                  opacity: 1;
                  transform: scale(1);
                }
              }
              /* Text fade-in with slight delay */
              .tree-node-morph .node-card-text {
                animation: textFadeIn ${MORPH_DURATION_MS * 0.6}ms ease-out ${MORPH_DURATION_MS * 0.4}ms backwards;
              }
              @keyframes textFadeIn {
                from {
                  opacity: 0;
                  transform: translateY(4px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              .tree-node-morph .node-halo {
                transition: opacity ${MORPH_DURATION_MS}ms ease-out;
              }
              /* T29-2: Removed .node-index animation - labels no longer shown */
              /* Ensure nodes are clickable */
              .tree-node-morph {
                cursor: pointer;
              }
            `}</style>
          </defs>

          {/* Background is now handled by CSS layers in .tree-canvas-bg */}

          <g
            ref={transformGroupRef}
            transform={`matrix(${viewport.scale},0,0,${viewport.scale},${viewport.translateX},${viewport.translateY})`}
          >
            {/* Render lines with three-tier hierarchy */}
            <g className="tree-lines">
              {renderTracks()}
              {renderTieredBranchEdges(branchEdges)}
            </g>

            {/* Active trunk line overlay for emphasis */}
            <g className="tree-lines-active">
              {renderActiveTracks()}
            </g>

            <g className="tree-nodes">{renderNodes()}</g>

            {/* T29-2: Removed index labels (#{node.index}) for cleaner UI */}

            {/* T55-3: Snapshot flags rendered on top of nodes */}
            {renderSnapshotFlags()}

            {/* Hover tooltip rendered on top */}
            {renderHoverTooltip()}
          </g>
        </svg>

        {layout.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No nodes available
          </div>
        )}

        {/* T22-9: Zoom slider bar at bottom with glass effect */}
        {!isMobile && layout.nodes.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 z-20 zoom-bar flex justify-center" style={{ bottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}>
            <div className="flex items-center gap-1.5 apple-glass-capsule !rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] !py-2.5 !px-3 h-[50px]">
              {/* Zoom out button */}
              <button
                onClick={() => handleZoomChange(viewport.scale - ZOOM_STEP)}
                disabled={viewport.scale <= MIN_SCALE}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 
                  disabled:opacity-30 disabled:cursor-not-allowed
                  transition-colors"
                title="缩小"
              >
                <Minus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              
              {/* Zoom slider */}
              <input
                type="range"
                id="tree-zoom-slider"
                name="treeZoom"
                min={MIN_SCALE * 100}
                max={MAX_SCALE * 100}
                step={ZOOM_STEP * 100}
                value={viewport.scale * 100}
                onChange={(e) => handleZoomChange(Number(e.target.value) / 100)}
                className="w-20 h-1 appearance-none bg-foreground/15 rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:hover:bg-primary/80
                  [&::-webkit-slider-thumb]:transition-colors
                  [&::-webkit-slider-thumb]:shadow-sm
                  [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:h-3
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-primary
                  [&::-moz-range-thumb]:border-0"
              />
              
              {/* Zoom in button */}
              <button
                onClick={() => handleZoomChange(viewport.scale + ZOOM_STEP)}
                disabled={viewport.scale >= MAX_SCALE}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 
                  disabled:opacity-30 disabled:cursor-not-allowed
                  transition-colors"
                title="放大"
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              
              {/* Divider */}
              <div className="w-px h-5 bg-border/50" />
              
              {/* Reset button */}
              <button
                onClick={handleZoomReset}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 
                  transition-colors"
                title="重置缩放 (85%)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              
              {/* Current scale display */}
              <span className="text-[10px] text-muted-foreground w-8 text-center tabular-nums font-medium leading-7">
                {Math.round(viewport.scale * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

TreeCanvas.displayName = 'TreeCanvas';
