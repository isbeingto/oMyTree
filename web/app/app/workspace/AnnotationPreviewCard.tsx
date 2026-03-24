'use client';

import { motion } from 'framer-motion';
import { Quote, Clock, Pencil, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type InlineAnnotation } from '@/lib/annotations';

interface AnnotationPreviewCardProps {
  /** The annotation to display */
  annotation: InlineAnnotation;
  /** Rect to anchor to (can be relative or absolute) */
  anchorRect: { top: number; left: number; width: number };
  /** Use absolute positioning relative to parent instead of fixed viewport */
  isAbsolute?: boolean;
  /** Language for UI text */
  lang?: 'zh' | 'en';
  /** Current index (0-based) inside a list of annotations */
  index?: number;
  /** Total annotations in the list */
  total?: number;
  /** Navigate to previous annotation */
  onPrev?: () => void;
  /** Navigate to next annotation */
  onNext?: () => void;
  /** Callback to edit the annotation */
  onEdit?: (anno: InlineAnnotation) => void;
  /** Callback to delete the annotation */
  onDelete?: (anno: InlineAnnotation) => void;
  /** Callback to close the preview */
  onClose?: () => void;
  /** Pointer enter/leave hooks to keep the card open while interacting */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/**
 * P1-3: Annotation Preview Card
 * 
 * A compact glassmorphism card that shows annotation details on hover.
 * Appears near the highlighted text or gutter bookmark.
 */
export function AnnotationPreviewCard({
  annotation,
  lang = 'zh',
  index,
  total,
  onPrev,
  onNext,
  onEdit,
  onDelete,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Omit<AnnotationPreviewCardProps, 'anchorRect' | 'isAbsolute'>) {
  const timeLabel = formatRelativeTime(annotation.created_at, lang);
  const hasNav = typeof index === 'number' && typeof total === 'number' && total > 1;
  const positionLabel = hasNav
    ? (lang === 'zh' ? `${index + 1}/${total}` : `${index + 1}/${total}`)
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ 
        type: 'spring', 
        damping: 25, 
        stiffness: 300,
        mass: 0.8
      }}
      className={cn(
        "w-[300px] apple-glass glass-crisp border border-amber-500/10 dark:border-amber-400/10 rounded-2xl shadow-2xl overflow-hidden",
        "pointer-events-auto flex flex-col perspective-1000"
      )}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      {/* Header with Quote */}
      <div className="px-4 py-3 bg-amber-500/10 dark:bg-amber-400/5 border-b border-amber-500/5 flex items-start gap-2.5">
        <Quote className="w-3.5 h-3.5 text-amber-500/50 mt-1 shrink-0" />
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 italic line-clamp-2 font-medium">
          {annotation.quote}
        </p>
        <button 
          onClick={onClose}
          className="ml-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body: Note Content */}
      <div className="p-4 pt-3.5">
        <p className="text-[13px] text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
          {annotation.note || (lang === 'zh' ? '（无批注内容）' : '(No comments)')}
        </p>
        
        {/* Footer: Meta & Actions */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-500/10">
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400/80">
            <Clock className="w-3 h-3" />
            <span>{timeLabel}</span>
            {positionLabel && (
              <span className="ml-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md font-bold">
                {positionLabel}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            {hasNav && (
              <div className="flex items-center gap-0.5 mr-1 pr-1.5 border-r border-slate-500/10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrev}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
                  title={lang === 'zh' ? '上一条' : 'Previous'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNext}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
                  title={lang === 'zh' ? '下一条' : 'Next'}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit?.(annotation)}
              className="h-7 px-2 text-slate-400 hover:text-amber-600 hover:bg-amber-500/10 rounded-full transition-all"
            >
              <Pencil className="w-3.5 h-3.5 mr-1" />
              <span className="text-[11px] font-medium">{lang === 'zh' ? '编辑' : 'Edit'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete?.(annotation)}
              className="h-7 px-2 text-slate-400 hover:text-red-600 hover:bg-red-500/10 rounded-full transition-all"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              <span className="text-[11px] font-medium">{lang === 'zh' ? '删除' : 'Delete'}</span>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatRelativeTime(iso?: string, lang: 'zh' | 'en' = 'zh') {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return lang === 'zh' ? '刚刚' : 'just now';
  if (diffSec < 60) return lang === 'zh' ? `${diffSec} 秒前` : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return lang === 'zh' ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return lang === 'zh' ? `${diffHour} 小时前` : `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return lang === 'zh' ? `${diffDay} 天前` : `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US');
}
