'use client';

import { useEffect, useState, useRef, useMemo, useId } from 'react';
import { cn } from '@/lib/utils';
import { type InlineAnnotation } from '@/lib/annotations';

interface AnnotationHighlightProps {
  /** The annotations to display */
  annotations: InlineAnnotation[];
  /** Reference to the container element holding the text */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Callback when an annotation squiggle is hovered */
  onHoverAnnotation?: (annotation: InlineAnnotation | null, rect?: DOMRect) => void;
  /** Callback when an annotation or bookmark is clicked */
  onClickAnnotation?: (annotation: InlineAnnotation, rect: DOMRect) => void;
  /** Callback with a stable rect (first client rect) per annotation id */
  onRectsUpdate?: (rectsById: Record<string, DOMRect>) => void;
  /** Whether the message is still streaming (hide highlights during stream) */
  isStreaming?: boolean;
  /** Whether to show gutter bookmarks on the right edge */
  showGutter?: boolean;
}

interface AnnotationRects {
  id: string;
  rects: DOMRect[];
  annotation: InlineAnnotation;
}

/**
 * P1-1: Annotation Highlight (Marker Style)
 * 
 * Renders high-precision marker-style highlights over annotated text.
 * Uses an SVG overlay to avoid splitting DOM nodes and breaking Markdown layout.
 * 
 * Features:
 * - Automatically finds DOM ranges based on text-offset anchors
 * - Responsive to layout changes (ResizeObserver)
 * - Marker-style highlight (Amazon Kindle/Highlighter style)
 * - High-precision positioning with scroll compensation
 * - Zero Layout Reflow
 */
export function AnnotationHighlight({
  annotations,
  containerRef,
  onHoverAnnotation,
  onClickAnnotation,
  onRectsUpdate,
  isStreaming = false,
  showGutter = true,
}: AnnotationHighlightProps) {
  const [highlights, setHighlights] = useState<AnnotationRects[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastRectsRef = useRef<string>('');
  const gradientId = useId();

  // Calculate coordinates for all annotations
  const updateRects = useMemo(() => {
    return () => {
      if (!containerRef.current || isStreaming || annotations.length === 0) {
        setHighlights([]);
        if (lastRectsRef.current !== '') {
          onRectsUpdate?.({});
          lastRectsRef.current = '';
        }
        return;
      }

      const container = containerRef.current;
      const newHighlights: AnnotationRects[] = [];
      const rectsById: Record<string, DOMRect> = {};

      annotations.forEach((anno) => {
        const { start, end } = anno.anchor;
        if (typeof start !== 'number' || typeof end !== 'number') return;

        try {
          const range = document.createRange();
          let currentPos = 0;
          let startNode: Node | null = null;
          let startOffset = 0;
          let endNode: Node | null = null;
          let endOffset = 0;

          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent?.length || 0;
            if (!startNode && currentPos + nodeLength >= start) {
              startNode = node;
              startOffset = start - currentPos;
            }
            if (!endNode && currentPos + nodeLength >= end) {
              endNode = node;
              endOffset = end - currentPos;
              break;
            }
            currentPos += nodeLength;
          }

          if (startNode && endNode) {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            
            // Collect rects only from non-whitespace text nodes
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            walker.currentNode = startNode;
            
            const rects: DOMRect[] = [];
            let currentNode: Node | null = startNode;
            
            while (currentNode) {
              const r = document.createRange();
              const s = currentNode === startNode ? startOffset : 0;
              const e = currentNode === endNode ? endOffset : (currentNode.textContent?.length || 0);
              
              const text = currentNode.textContent?.substring(s, e) || '';
              // Only highlight if there's actual text content
              if (text.trim().length > 0) {
                try {
                  r.setStart(currentNode, s);
                  r.setEnd(currentNode, e);
                  rects.push(...Array.from(r.getClientRects()));
                } catch (e) { /* ignore */ }
              }
              
              if (currentNode === endNode) break;
              currentNode = walker.nextNode();
            }
            
            if (rects.length > 0) {
              // Group rects by y-coordinate to merge horizontal overlaps on the same line
              // This prevents darkening where rectangles for <span>s or words slightly overlap
              const mergedRects = mergeRectsByLine(rects);
              
              rectsById[anno.id] = rects[0];
              newHighlights.push({
                id: anno.id,
                rects: mergedRects,
                annotation: anno,
              });
            }
          }
        } catch (err) {
          // ignore
        }
      });

      // Break recursive resize loops by checking if data actually changed
      const currentRectsHash = JSON.stringify(newHighlights.map(h => ({
        id: h.id,
        rects: h.rects.map(r => ({
          t: Math.round(r.top),
          l: Math.round(r.left),
          w: Math.round(r.width),
          h: Math.round(r.height)
        }))
      })));

      if (currentRectsHash !== lastRectsRef.current) {
        setHighlights(newHighlights);
        onRectsUpdate?.(rectsById);
        lastRectsRef.current = currentRectsHash;
      }
    };
  }, [annotations, containerRef, isStreaming, onRectsUpdate]);

  // Helper to merge rectangles on the same line
  function mergeRectsByLine(rects: DOMRect[]): DOMRect[] {
    if (rects.length === 0) return [];

    // Sort by top coordinate first
    const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
    const merged: DOMRect[] = [];
    
    if (sorted.length === 0) return [];
    
    let currentLine = {
      top: sorted[0].top,
      bottom: sorted[0].bottom,
      left: sorted[0].left,
      right: sorted[0].right,
      height: sorted[0].height
    };

    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i];
      // If same line (overlap vertically by at least 50%)
      const verticalOverlap = Math.min(currentLine.bottom, r.bottom) - Math.max(currentLine.top, r.top);
      const isSameLine = verticalOverlap > Math.min(currentLine.height, r.height) * 0.5;

      if (isSameLine) {
        // Merge horizontally
        currentLine.left = Math.min(currentLine.left, r.left);
        currentLine.right = Math.max(currentLine.right, r.right);
        // Average the vertical bounds slightly or take the union
        currentLine.top = Math.min(currentLine.top, r.top);
        currentLine.bottom = Math.max(currentLine.bottom, r.bottom);
        currentLine.height = currentLine.bottom - currentLine.top;
      } else {
        // New line/block
        merged.push(new DOMRect(currentLine.left, currentLine.top, currentLine.right - currentLine.left, currentLine.height));
        currentLine = {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          height: r.height
        };
      }
    }
    merged.push(new DOMRect(currentLine.left, currentLine.top, currentLine.right - currentLine.left, currentLine.height));
    
    return merged;
  }

  // Handle Resize and Initial Render
  useEffect(() => {
    updateRects();

    if (!containerRef.current) return;

    // Monitor container size
    const observer = new ResizeObserver(() => {
      updateRects();
    });
    observer.observe(containerRef.current);
    
    // CRITICAL: Monitor window scroll and resize to catch viewport-relative drift
    // Use capture phase (true) to ensure we catch scroll events from parent containers
    window.addEventListener('scroll', updateRects, true);
    window.addEventListener('resize', updateRects);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateRects, true);
      window.removeEventListener('resize', updateRects);
    };
  }, [updateRects, containerRef]);

  if (isStreaming || highlights.length === 0 || !containerRef.current) return null;

  // Get container rect for relative positioning
  const containerRect = containerRef.current.getBoundingClientRect();

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full z-10 overflow-visible pointer-events-none select-none"
      style={{ 
        transform: 'none',
        pointerEvents: 'none'
      }}
    >
      <defs>
        <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {highlights.map((h, hIdx) => (
        <g key={h.id} className="annotation-group pointer-events-auto">
          {/* Marker Highlighting (Modern Kindle/Highlighter style) */}
          {h.rects.map((rect, idx) => {
            const x = rect.left - containerRect.left;
            const y = rect.top - containerRect.top;
            const w = rect.width;
            const h_rect = rect.height;

            return (
              <g 
                key={`${h.id}-marker-${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickAnnotation?.(h.annotation, rect);
                }}
                className="cursor-pointer group/marker"
              >
                {/* Marker Overlay: Physical marker feel with rounded ends */}
                <rect
                  x={x - 2}
                  y={y - 0.5}
                  width={w + 4}
                  height={h_rect + 1}
                  // Fully rounded ends like a real highlighter tip
                  rx={4}
                  // Marker aesthetic: multiply blend mode looks more like ink on paper
                  style={{ 
                    mixBlendMode: 'multiply',
                    filter: idx % 2 === 0 ? 'none' : 'blur(0.2px)' // Subtle organic variation
                  }}
                  className={cn(
                    "fill-amber-400/25 dark:fill-amber-400/20",
                    "group-hover/marker:fill-amber-400/40 dark:group-hover/marker:fill-amber-400/35 transition-all duration-200"
                  )}
                />
              </g>
            );
          })}

          {/* Gutter Bookmark: Minimalist Accent Tab (Visual Only) */}
          {showGutter && h.rects.length > 0 && (
            <g className="select-none pointer-events-none">
              {(() => {
                // Find top-most and bottom-most rect for this annotation
                const top = Math.min(...h.rects.map(r => r.top)) - containerRect.top;
                const bottom = Math.max(...h.rects.map(r => r.bottom)) - containerRect.top;
                const height = Math.max(bottom - top, 14);
                
                return (
                  <rect
                    x={containerRect.width - 3}
                    y={top}
                    width={3}
                    height={height}
                    rx={1.5}
                    className="fill-amber-400/40 dark:fill-amber-500/30"
                  />
                );
              })()}
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}
