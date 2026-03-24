'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

export type ReasoningBlockProps = {
  reasoning?: string | null;
  isStreaming?: boolean;
  /** Whether the reasoning content is visible (controlled by parent). */
  visible?: boolean;
  /** Shown when reasoning text is empty. */
  emptyBodyHint?: string;
  lang?: Lang;
  className?: string;
};

export function ReasoningBlock({
  reasoning,
  isStreaming = false,
  visible = false,
  emptyBodyHint,
  lang = 'en',
  className,
}: ReasoningBlockProps) {
  const trimmed = useMemo(() => (typeof reasoning === 'string' ? reasoning : ''), [reasoning]);

  // When hidden and not streaming, keep DOM clean.
  if (!visible && !isStreaming && trimmed.trim().length === 0) return null;

  const bodyHint = emptyBodyHint || (isStreaming ? t(lang, 'ai_thinking') : t(lang, 'chat_reasoning_empty'));

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="my-2 first:mt-0 last:mb-0">{children}</p>
      ),
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          className="text-emerald-600 dark:text-emerald-400 hover:underline"
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      ),
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-2 pl-5 list-disc space-y-1">{children}</ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-2 pl-5 list-decimal space-y-1">{children}</ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="my-3 pl-3.5 border-l-3 border-emerald-500 italic text-slate-600 dark:text-slate-400 first:mt-0 last:mb-0">
          {children}
        </blockquote>
      ),
      code: ({ children }: { children?: React.ReactNode }) => (
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {children}
        </code>
      ),
      pre: ({ children }: { children?: React.ReactNode }) => (
        <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900/90 p-3 text-[11px] leading-relaxed text-slate-100 dark:bg-black/40 first:mt-0 last:mb-0">
          {children}
        </pre>
      ),
      hr: () => <hr className="my-4 border-slate-200 dark:border-slate-700" />,
    }),
    []
  );

  return (
    <div
      className={cn(
        // Transparent, no extra chrome; header/toggle is handled outside.
        // Add a subtle left vertical guide to separate from the main answer.
        'pl-4 border-l-2 border-slate-200/70 dark:border-slate-700/70',
        // Smooth expand/collapse animation.
        // T-REASONING-FIX: Removed max-height and overflow-y-auto to let reasoning content
        // flow naturally like regular chat messages (since it's collapsible anyway).
        'transition-[opacity,transform,margin] duration-300 ease-out will-change-[opacity,transform]',
        visible
          ? 'mt-2 mb-3 opacity-100 translate-y-0'
          : 'mt-0 mb-0 max-h-0 opacity-0 -translate-y-1 overflow-hidden',
        className
      )}
      data-testid="reasoning-block"
    >
      <div className="text-xs text-muted-foreground/90 leading-relaxed">
        {trimmed.trim().length > 0 ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {trimmed}
          </ReactMarkdown>
        ) : (
          <span className="text-muted-foreground/70">{bodyHint}</span>
        )}
      </div>
    </div>
  );
}
