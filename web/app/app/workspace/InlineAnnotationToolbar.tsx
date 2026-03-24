'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnnotationNotePopover } from './AnnotationNotePopover';
import { InlineAnnotationSelection, InlineAnnotationAnchor } from '@/lib/annotations';

export interface InlineAnnotationToolbarProps {
  /** The message ID this toolbar belongs to */
  messageId: string;
  /** Ref to the content container to monitor selections within */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Callback when "Add Annotation" is clicked */
  onAnnotate: (payload: InlineAnnotationSelection) => void;
  /** Language preference */
  lang?: 'zh' | 'en';
  /** Whether the message is streaming (disable during streaming) */
  isStreaming?: boolean;
}

interface SelectionPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * P2-2: Floating toolbar that appears when user selects text in AI message.
 * 
 * Features:
 * - Monitors text selection within AI message content
 * - Positions itself above the selection using Range.getBoundingClientRect()
 * - Shows "做批注" button only when valid selection exists
 * - Desktop-first (mobile selection UX is poor, may skip or handle separately)
 * - Cleans up when selection is cleared or user clicks elsewhere
 */
export function InlineAnnotationToolbar({
  messageId,
  contentRef,
  onAnnotate,
  lang = 'zh',
  isStreaming = false,
}: InlineAnnotationToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [currentRange, setCurrentRange] = useState<Range | null>(null);
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null);

  const buttonText = lang === 'zh' ? '做批注' : 'Annotate';

  // Check if the selection is within our content container
  const isSelectionInContainer = useCallback(
    (selection: Selection): boolean => {
      if (!contentRef.current || !selection.rangeCount) return false;

      const range = selection.getRangeAt(0);
      const container = contentRef.current;

      // Check if both start and end of selection are within our container
      return container.contains(range.startContainer) && container.contains(range.endContainer);
    },
    [contentRef]
  );

  // Calculate toolbar position based on selection range
  const calculatePosition = useCallback((range: Range): SelectionPosition | null => {
    try {
      const rects = range.getBoundingClientRect();
      if (!rects || rects.width === 0 || rects.height === 0) return null;

      if (!contentRef.current) return null;
      const containerRect = contentRef.current.getBoundingClientRect();

      // Position toolbar above the selection, centered horizontally.
      // We anchor the toolbar to the selection's top edge and translate it upward,
      // so it never covers the selected text.
      const gap = isNoteEditing ? 8 : 12;
      const top = rects.top - containerRect.top - gap;
      const left = rects.left - containerRect.left + rects.width / 2;
      const width = rects.width;

      return { top, left, width };
    } catch (err) {
      console.error('[InlineAnnotationToolbar] Failed to calculate position:', err);
      return null;
    }
  }, [isNoteEditing, contentRef]);

  const buildAnchorForRange = useCallback((range: Range, container: HTMLDivElement): InlineAnnotationAnchor | null => {
    const fullText = container.innerText || '';
    if (!fullText) return null;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);

    const start = preRange.toString().length;
    const length = range.toString().length;
    const end = start + length;

    const safeStart = Math.max(0, Math.min(start, fullText.length));
    const safeEnd = Math.max(safeStart, Math.min(end, fullText.length));
    const prefix = fullText.slice(Math.max(0, safeStart - 20), safeStart);
    const suffix = fullText.slice(safeEnd, Math.min(fullText.length, safeEnd + 20));

    return {
      type: 'text-offset',
      start: safeStart,
      end: safeEnd,
      prefix,
      suffix,
    };
  }, []);

  // Handle selection change
  const handleSelectionChange = useCallback((isMouseUp = false) => {
    // Skip if streaming
    if (isStreaming) {
      setVisible(false);
      setIsNoteEditing(false);
      return;
    }

    // If we are editing a note, don't clear visibility due to selection changes
    if (isNoteEditing) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      // If we were visible but selection is gone, hide
      if (visible) {
        setVisible(false);
        setSelectedText('');
        setCurrentRange(null);
      }
      return;
    }

    // Check if selection is within our content container
    if (!isSelectionInContainer(selection)) {
      if (visible) {
        setVisible(false);
        setSelectedText('');
        setCurrentRange(null);
      }
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (!text || text.length < 1) {
      if (visible) {
        setVisible(false);
        setSelectedText('');
        setCurrentRange(null);
      }
      return;
    }

    // Optimization: Only show/update position on mouseup or if already visible
    if (!isMouseUp && !visible) return;

    const pos = calculatePosition(range);
    if (!pos) {
      setVisible(false);
      return;
    }

    // Show toolbar
    setSelectedText(text);
    setCurrentRange(range);
    setPosition(pos);
    setVisible(true);
  }, [isStreaming, isSelectionInContainer, calculatePosition, isNoteEditing, visible]);

  // Debounced selection monitoring
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) return;

    const handleSelectionUpdate = () => {
      handleSelectionChange(false);
    };

    const handleMouseUp = () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      checkTimerRef.current = setTimeout(() => {
        handleSelectionChange(true);
      }, 50); // Slightly longer delay for stability
    };

    document.addEventListener('selectionchange', handleSelectionUpdate);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('scroll', handleSelectionUpdate, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionUpdate);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('scroll', handleSelectionUpdate, true);
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, [handleSelectionChange]);

  // Hide toolbar when clicking outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      
      // If editing note, the popover handles its own click-outside logic
      if (isNoteEditing) return;

      const sel = window.getSelection();
      const isStillInContainer = contentRef.current?.contains(e.target as Node);
      
      // If click is outside or inside with NO selection, hide
      if (!isStillInContainer || !sel || sel.isCollapsed) {
        setVisible(false);
        setSelectedText('');
        setCurrentRange(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, isNoteEditing, contentRef]);

  // Handle annotation button click
  const handleAnnotateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!currentRange || !selectedText) return;
    setIsNoteEditing(true);
  };

  if (!visible || !position) return null;

  // Rects for the current selection (to show fake highlight during editing)
  const selectionRects = isNoteEditing && currentRange ? Array.from(currentRange.getClientRects()) : [];
  const containerRect = contentRef.current?.getBoundingClientRect();

  return (
    <>
      {/* P2-2: Active Selection Fake Highlight (to keep blue look when focused on input) */}
      {/* We render this independent of the toolbar's transform div */}
      {isNoteEditing && containerRect && (
        <div 
          className="absolute inset-0 pointer-events-none z-0 overflow-visible select-none"
          style={{ transform: 'none' }}
        >
          {selectionRects.map((rect, i) => (
            <div
              key={`active-sel-${i}`}
              className="absolute bg-amber-400/30 dark:bg-amber-400/20"
              style={{
                top: rect.top - containerRect.top + 1,
                left: rect.left - containerRect.left - 1,
                width: rect.width + 2,
                height: rect.height - 1,
                borderRadius: '2px',
                mixBlendMode: 'multiply'
              }}
            />
          ))}
        </div>
      )}

      <div
        ref={toolbarRef}
        className={cn(
          'absolute z-50 animate-in fade-in zoom-in-95 duration-200 select-none transition-all',
          !isNoteEditing && 'apple-glass px-2 py-1.5 flex items-center gap-1 border border-amber-500/10 shadow-xl rounded-full',
          isNoteEditing && 'p-0 bg-transparent border-none shadow-none origin-bottom'
        )}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {isNoteEditing ? (
          <AnnotationNotePopover
            quote={selectedText}
            lang={lang}
            onSave={(note) => {
              const quote = currentRange?.toString().trim() || selectedText;
              const anchor = currentRange ? buildAnchorForRange(currentRange, contentRef.current!) : null;
              
              if (anchor) {
                onAnnotate({
                  messageId,
                  quote,
                  anchor,
                  note,
                });
              }

              // Use a small timeout to let the state update before clearing
              setTimeout(() => {
                window.getSelection()?.removeAllRanges();
              }, 10);

              setIsNoteEditing(false);
              setVisible(false);
              setSelectedText('');
              setCurrentRange(null);
            }}
            onClose={() => {
              setIsNoteEditing(false);
              setVisible(false);
              setSelectedText('');
              setCurrentRange(null);
            }}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-8 px-3.5 gap-2 text-[13px] font-semibold',
              'text-slate-700 dark:text-slate-200',
              // No hover styles (override Button variant hover, keep consistent appearance)
              'hover:bg-transparent hover:text-slate-700 dark:hover:text-slate-200',
              'active:bg-transparent',
              'transition-none rounded-full'
            )}
            onClick={handleAnnotateClick}
            onMouseDown={(e) => e.preventDefault()}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {buttonText}
          </Button>
        )}
      </div>
    </>
  );
}
