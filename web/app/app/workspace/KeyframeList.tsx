'use client';

import { useMemo } from 'react';
import { ArrowRight, XCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatKeyframeAnnotation } from '@/lib/annotations';
import { t, type Lang } from '@/lib/i18n';
import type { Keyframe } from '@/lib/api';
import type { ChatMessage } from './ChatMessageBubble';

/**
 * KeyframeList - Timeline view of annotated keyframes
 * 
 * Displays a vertical timeline with:
 * - Left: Timeline dots connected by a line
 * - Right: Cards showing annotation, message preview, and action buttons
 */

export interface KeyframeListProps {
  keyframes: Keyframe[];
  messages: ChatMessage[];
  lang: Lang;
  onJump: (nodeId: string) => void;
  onUnpin: (nodeId: string) => void;
  className?: string;
}

export function KeyframeList({
  keyframes,
  messages,
  lang,
  onJump,
  onUnpin,
  className,
}: KeyframeListProps) {
  // Create a map for quick message lookup
  const messageMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const msg of messages) {
      if (msg.id) map.set(msg.id, msg);
    }
    return map;
  }, [messages]);

  // Sort keyframes by creation time (newest first)
  const sortedKeyframes = useMemo(() => {
    return [...keyframes].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeB - timeA; // Descending
    });
  }, [keyframes]);

  if (sortedKeyframes.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
        <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {lang === 'zh-CN' ? '暂无批注' : 'No annotations yet'}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {lang === 'zh-CN' 
            ? '选中 AI 回复文字后，点击"做批注"按钮' 
            : 'Select AI response text and click "Annotate"'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Timeline vertical line */}
      <div 
        className="absolute left-3 top-4 bottom-4 w-0.5 bg-border"
        aria-hidden="true"
      />

      {/* Keyframe items */}
      <div className="space-y-4">
        {sortedKeyframes.map((kf, index) => {
          const message = messageMap.get(kf.node_id);
          const preview = message?.text?.slice(0, 100) || (lang === 'zh-CN' ? '消息不可用' : 'Message unavailable');
          const timestamp = new Date(kf.created_at);
          const timeLabel = timestamp.toLocaleTimeString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const dateLabel = timestamp.toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
            month: 'short',
            day: 'numeric',
          });

          return (
            <div key={kf.id} className="relative pl-8">
              {/* Timeline dot */}
              <div 
                className={cn(
                  'absolute left-1.5 top-3 w-3 h-3 rounded-full border-2',
                  'bg-background border-primary',
                  index === 0 && 'ring-2 ring-primary/20'
                )}
                aria-hidden="true"
              />

              {/* Card */}
              <div className={cn(
                'rounded-lg border border-border/60 bg-card/50',
                'p-3 space-y-2'
              )}>
                {/* Header: Annotation + Time */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {formatKeyframeAnnotation(kf.annotation) || (lang === 'zh-CN' ? '未命名节点' : 'Unnamed node')}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {dateLabel} {timeLabel}
                  </span>
                </div>

                {/* Preview text */}
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {preview}{preview.length >= 100 && '...'}
                </p>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => onUnpin(kf.node_id)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    {lang === 'zh-CN' ? '删除批注' : 'Remove annotation'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onJump(kf.node_id)}
                  >
                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                    {lang === 'zh-CN' ? '跳转' : 'Jump'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default KeyframeList;
