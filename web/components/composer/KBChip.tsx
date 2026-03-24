/**
 * KB-2: Knowledge Base Selection Chip
 */

'use client';

import React from 'react';
import { X, Library, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KBChipProps {
  id: string;
  name: string;
  onRemove?: () => void;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function KBChip({
  id,
  name,
  onRemove,
  onClick,
  disabled = false,
  className,
}: KBChipProps) {
  // Truncate long names
  const displayName = name.length > 25 
    ? `${name.slice(0, 22)}...`
    : name;

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm',
        'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
        'border transition-all duration-200',
        onClick && !disabled && 'cursor-pointer hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 hover:border-emerald-500/30',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <div className="flex items-center justify-center h-5 w-5 rounded bg-emerald-500/20 shrink-0">
        <Library className="h-3 w-3" />
      </div>
      
      <span className="font-medium truncate max-w-[150px]">{displayName}</span>
      
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          className={cn(
            'p-0.5 rounded-full hover:bg-emerald-500/20 transition-colors',
            'text-emerald-500/60 hover:text-emerald-500'
          )}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Remove knowledge base</span>
        </button>
      )}
    </div>
  );
}

export function KBChipsContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {children}
    </div>
  );
}

export interface DocChipProps {
  id: string;
  name: string;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}

export function DocChip({ id, name, onRemove, disabled = false, className }: DocChipProps) {
  const displayName = name.length > 28 ? `${name.slice(0, 25)}...` : name;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm',
        'bg-slate-500/5 dark:bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300',
        'border transition-all duration-200',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <div className="flex items-center justify-center h-5 w-5 rounded bg-slate-500/15 shrink-0">
        <FileText className="h-3 w-3" />
      </div>
      <span className="font-medium truncate max-w-[180px]">{displayName}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          className={cn(
            'p-0.5 rounded-full hover:bg-slate-500/15 transition-colors',
            'text-slate-500/70 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Remove document</span>
        </button>
      )}
    </div>
  );
}

export function OverflowChip({
  hiddenCount,
  expanded,
  onToggle,
  disabled,
  className,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (!Number.isFinite(hiddenCount) || hiddenCount <= 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm',
        'bg-muted/40 text-muted-foreground border border-border/40',
        'hover:bg-muted/60 transition-colors',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <span className="font-semibold">+{hiddenCount}</span>
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      <span className="sr-only">Toggle hidden chips</span>
    </button>
  );
}
