'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type GroundingSource = {
  uri: string;
  title?: string | null;
};

export type GroundingBlockProps = {
  groundingMetadata?: any;
  visible?: boolean;
  className?: string;
};

function normalizeString(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractUriAndTitle(chunk: any): GroundingSource | null {
  if (!chunk || typeof chunk !== 'object') return null;

  const web = chunk.web && typeof chunk.web === 'object' ? chunk.web : null;
  const retrievedContext = chunk.retrievedContext && typeof chunk.retrievedContext === 'object' ? chunk.retrievedContext : null;

  const uri =
    normalizeString(web?.uri) ||
    normalizeString(chunk?.uri) ||
    normalizeString(retrievedContext?.uri) ||
    normalizeString(chunk?.sourceUri);

  if (!uri) return null;

  const title =
    normalizeString(web?.title) ||
    normalizeString(chunk?.title) ||
    normalizeString(retrievedContext?.title) ||
    null;

  return { uri, title };
}

function extractSources(groundingMetadata: any): GroundingSource[] {
  if (!groundingMetadata || typeof groundingMetadata !== 'object') return [];
  const chunks = Array.isArray(groundingMetadata.groundingChunks)
    ? groundingMetadata.groundingChunks
    : [];

  const out: GroundingSource[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const s = extractUriAndTitle(chunk);
    if (!s) continue;
    if (seen.has(s.uri)) continue;
    seen.add(s.uri);
    out.push(s);
  }

  return out;
}

export function GroundingBlock({ groundingMetadata, visible = false, className }: GroundingBlockProps) {
  if (!visible) return null;

  const sources = useMemo(() => extractSources(groundingMetadata), [groundingMetadata]);

  return (
    <div className={cn('mt-2 mb-3 pl-6', className)} data-testid="grounding-block">
      {sources.length > 0 ? (
        <div className="space-y-2 text-xs text-muted-foreground/90 leading-relaxed">
          {sources.map((s) => {
            let host = '';
            try {
              host = new URL(s.uri).host;
            } catch {
              host = '';
            }
            return (
              <div key={s.uri} className="flex flex-col gap-0.5">
                <a
                  href={s.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline break-all"
                >
                  {s.title || s.uri}
                </a>
                {host ? <div className="text-[11px] text-muted-foreground/70">{host}</div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/70 leading-relaxed">暂无来源</div>
      )}
    </div>
  );
}
