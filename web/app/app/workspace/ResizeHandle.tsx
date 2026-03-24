'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ResizeHandleProps {
  /** Called when user drags to resize. Receives the new width in pixels. */
  onResize: (newWidth: number) => void;
  /** Called when user finishes dragging (mouseup). */
  onResizeEnd?: () => void;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Maximum width in pixels */
  maxWidth?: number;
  /** Direction: which side is being resized */
  direction?: 'left' | 'right';
  /** Additional class names */
  className?: string;
}

/**
 * A vertical resize handle that can be dragged to adjust the width of an adjacent panel.
 * Used between ChatPane and RightTreePanel for resizable tree drawer.
 */
export function ResizeHandle({
  onResize,
  onResizeEnd,
  minWidth = 280,
  maxWidth = 800,
  direction = 'right',
  className,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Store the current width for delta calculations
  const currentWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    startXRef.current = e.clientX;
    
    // Get the adjacent panel's current width
    const handle = handleRef.current;
    if (handle) {
      const sibling = direction === 'right' 
        ? handle.nextElementSibling as HTMLElement
        : handle.previousElementSibling as HTMLElement;
      if (sibling) {
        startWidthRef.current = sibling.getBoundingClientRect().width;
        currentWidthRef.current = startWidthRef.current;
      }
    }
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      
      // For right panel: dragging left increases width, dragging right decreases
      // For left panel: dragging right increases width, dragging left decreases
      const widthChange = direction === 'right' ? -deltaX : deltaX;
      let newWidth = startWidthRef.current + widthChange;
      
      // Clamp to min/max
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      if (newWidth !== currentWidthRef.current) {
        currentWidthRef.current = newWidth;
        onResize(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResizeEnd?.();
    };

    // Add listeners to window for better drag tracking
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, direction, minWidth, maxWidth, onResize, onResizeEnd]);

  return (
    <div
      ref={handleRef}
      className={cn(
        // Base styles
        'hidden lg:flex items-center justify-center',
        'w-3 cursor-col-resize',
        'flex-shrink-0 group',
        // Pure background without highlight effects
        'bg-white dark:bg-slate-900 border-x border-border/10',
        'transition-colors duration-150',
        className
      )}
      onMouseDown={handleMouseDown}
      title="拖动调整宽度"
    >
      {/* Visual indicator - only dots highlight on hover */}
      <div className="flex flex-col gap-1.5 opacity-20 group-hover:opacity-60 transition-opacity">
        <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
        <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
        <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
      </div>
    </div>
  );
}

export default ResizeHandle;
