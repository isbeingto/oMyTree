/**
 * T87: Upload Preview Panel
 * 
 * A panel (dialog/sheet) to preview normalized text content of uploads.
 * ChatGPT-style: clean, white/dark adaptive, with copy button.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, FileText, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { appApiGet, AppApiError } from '@/lib/app-api-client';

export interface UploadPreviewData {
  ok: boolean;
  file_name: string;
  ext: string;
  size_bytes: number;
  mime_type: string;
  text: string | null;
  total_length?: number;
  meta?: {
    type?: string;
    rows?: number;
    cols?: number;
    hasHeader?: boolean;
    lines?: number;
    chars?: number;
    keysCount?: number;
    length?: number;
    isArray?: boolean;
    isObject?: boolean;
    truncated?: boolean;
    originalBytes?: number;
  };
  error?: string | null;
  parsed_at?: string;
}

export interface UploadPreviewPanelProps {
  /** Upload ID to preview */
  uploadId: string | null;
  /** Whether the panel is open */
  open: boolean;
  /** Called when panel should close */
  onClose: () => void;
  /** Optional user ID for auth header */
  userId?: string | null;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get a friendly type label
 */
function getTypeLabel(meta?: UploadPreviewData['meta']): string | null {
  if (!meta) return null;
  
  switch (meta.type) {
    case 'csv':
      return `CSV · ${meta.rows} rows × ${meta.cols} cols`;
    case 'tsv':
      return `TSV · ${meta.rows} rows × ${meta.cols} cols`;
    case 'json':
      if (meta.isArray) return `JSON Array · ${meta.length} items`;
      if (meta.isObject) return `JSON Object · ${meta.keysCount} keys`;
      return 'JSON';
    case 'yaml':
      if (meta.isArray) return `YAML Array · ${meta.length} items`;
      if (meta.isObject) return `YAML Object · ${meta.keysCount} keys`;
      return 'YAML';
    case 'text':
      return `Text · ${meta.lines} lines`;
    default:
      return meta.type || null;
  }
}

export function UploadPreviewPanel({
  uploadId,
  open,
  onClose,
  userId,
}: UploadPreviewPanelProps) {
  const [data, setData] = useState<UploadPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch preview data when uploadId changes
  useEffect(() => {
    if (!uploadId || !open) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000); // Guard against hanging previews

    async function fetchPreview() {
      setLoading(true);
      setError(null);
      
      try {
        const headers: HeadersInit = {};
        if (userId) {
          headers['x-omytree-user-id'] = userId;
        }

        const result = await appApiGet<UploadPreviewData>(`/upload/${uploadId}/text`, {
          headers,
          signal: controller.signal,
        });
        
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          if (controller.signal.aborted) {
            setError('Preview request timed out. Please retry.');
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load preview');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        window.clearTimeout(timeoutId);
      }
    }

    fetchPreview();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [uploadId, open, userId]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!data?.text) return;
    
    try {
      await navigator.clipboard.writeText(data.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [data?.text]);

  // Download link
  const downloadUrl = uploadId ? `/api/upload/${uploadId}/download` : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent 
        className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0"
        data-testid="upload-preview-panel"
      >
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <DialogTitle className="text-lg font-medium">
                  {data?.file_name || 'Loading...'}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Preview of uploaded file content
                </DialogDescription>
                {data && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                    <span>{formatFileSize(data.size_bytes)}</span>
                    {getTypeLabel(data.meta) && (
                      <>
                        <span>·</span>
                        <span>{getTypeLabel(data.meta)}</span>
                      </>
                    )}
                    {data.meta?.truncated && (
                      <>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400">Truncated</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data?.text && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              )}
              {downloadUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8"
                >
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Spinner size="lg" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
              <p className="text-red-600 dark:text-red-400 font-medium">Failed to load preview</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          )}

          {data && !loading && (
            <>
              {data.error ? (
                <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                  <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
                  <p className="text-amber-600 dark:text-amber-400 font-medium">Could not parse file</p>
                  <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-6">
                    <pre 
                      className={cn(
                        'text-sm font-mono whitespace-pre-wrap break-words',
                        'bg-muted/50 rounded-lg p-4',
                        'dark:bg-muted/30'
                      )}
                      data-testid="upload-preview-content"
                    >
                      {data.text || '(Empty file)'}
                    </pre>
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UploadPreviewPanel;
