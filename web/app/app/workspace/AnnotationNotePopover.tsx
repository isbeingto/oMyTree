'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { StickyNote, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AnnotationNotePopoverProps {
  /** The text being annotated */
  quote: string;
  /** Optional initial note for edit mode */
  initialNote?: string;
  /** Callback when user saves the note */
  onSave: (note: string) => void;
  /** Callback when user cancels or clicks outside */
  onClose: () => void;
  /** Language for UI text */
  lang?: 'zh' | 'en';
}

/**
 * P0-1: Annotation Note Popover (Golden Gutter Notes Design)
 * 
 * A Kindle-like sticky note popover for entering annotation thoughts.
 * Features:
 * - Quote preview with truncation
 * - Borderless auto-focused textarea
 * - Glassmorphism (apple-glass) styling
 * - Character count (limit 400)
 * - Keyboard shortcuts (ESC to close, Ctrl+Enter to save)
 */
export function AnnotationNotePopover({
  quote,
  initialNote,
  onSave,
  onClose,
  lang = 'zh',
}: AnnotationNotePopoverProps) {
  const [note, setNote] = useState(initialNote || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const placeholder = lang === 'zh' ? '输入你的想法...' : 'Type your thoughts...';
  const saveLabel = lang === 'zh' ? '保存' : 'Save';

  // Truncate quote for preview
  const truncatedQuote = quote.length > 80 ? quote.substring(0, 80) + '...' : quote;

  useEffect(() => {
    if (typeof initialNote === 'string') {
      setNote(initialNote);
    }
  }, [initialNote]);

  useEffect(() => {
    // Auto focus on open
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (note.trim()) {
          onSave(note.trim());
        }
      }
    };

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Only close if it's not a click that might be handled by the parent (like clicking the "Annotate" button again)
        // But since this is a popover that covers the previous button's logic, we're safe.
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Delay adding click listener to avoid closing immediately from the click that opened it
    const clickTimer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      clearTimeout(clickTimer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [note, onSave, onClose]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9, y: 12, rotateX: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 12, rotateX: 10 }}
      transition={{ 
        type: 'spring', 
        damping: 20, 
        stiffness: 260,
        mass: 0.8
      }}
      className={cn(
        "w-80 apple-glass glass-crisp border border-amber-500/10 dark:border-amber-400/10 rounded-2xl shadow-2xl overflow-hidden",
        "flex flex-col perspective-1000"
      )}
      onClick={(e) => e.stopPropagation()} // Prevent click through to selection area
    >
      {/* Header: Quote View */}
      <div className="px-4 py-3.5 bg-amber-500/10 dark:bg-amber-400/5 border-b border-amber-500/5 flex items-start gap-2.5">
        <StickyNote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 font-medium line-clamp-2 italic">
          "{truncatedQuote}"
        </p>
      </div>

      {/* Body: Note Input */}
      <div className="p-4 flex flex-col gap-3">
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 400))}
          placeholder={placeholder}
          className={cn(
            "w-full bg-transparent border-none outline-none resize-none min-h-[110px] text-sm",
            "text-slate-800 dark:text-slate-100 placeholder:text-slate-400/80",
            "focus:ring-0 leading-relaxed font-sans"
          )}
        />
        
        {/* Footer: Stats & Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-500/10">
          <span className={cn(
            "text-[10px] font-mono tracking-tight",
            note.length >= 400 ? "text-red-500" : "text-slate-400/80"
          )}>
            {note.length}/400
          </span>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 px-3 text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/5 transition-all rounded-full"
            >
              <X className="w-4 h-4 mr-1" />
              <span className="text-xs">{lang === 'zh' ? '取消' : 'Cancel'}</span>
            </Button>
            
            <Button
              size="sm"
              disabled={!note.trim()}
              onClick={() => onSave(note.trim())}
              className={cn(
                "h-8 px-4 bg-amber-500 hover:bg-amber-600 text-white border-none shadow-lg shadow-amber-500/20 transition-all rounded-full",
                "disabled:opacity-40 disabled:bg-slate-300 disabled:shadow-none font-semibold"
              )}
            >
              <span className="text-xs mr-1.5">{saveLabel}</span>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
