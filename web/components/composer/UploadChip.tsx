/**
 * T85: Upload Attachment Chip Component
 * T87: Added click to preview functionality
 * T88: Added image thumbnails for a more premium UI/UX
 */

'use client';

import React, { useState } from 'react';
import { X, FileText, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UploadStatus = 'uploading' | 'success' | 'error';

export interface UploadChipProps {
  /** Upload ID (for preview) */
  uploadId?: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Upload status */
  status: UploadStatus;
  /** Error message (when status is 'error') */
  errorMessage?: string;
  /** Called when remove button is clicked */
  onRemove?: () => void;
  /** Called when retry button is clicked (for error state) */
  onRetry?: () => void;
  /** Called when chip is clicked for preview (T87) */
  onPreview?: (uploadId: string) => void;
  /** Whether remove is disabled */
  removeDisabled?: boolean;
  /** Additional class names */
  className?: string;
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
 * Get file icon based on extension
 */
function getFileExtension(fileName: string): string {
  const match = fileName.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Check if file name indicates an image
 */
function isImage(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
}

export function UploadChip({
  uploadId,
  fileName,
  sizeBytes,
  status,
  errorMessage,
  onRemove,
  onRetry,
  onPreview,
  removeDisabled = false,
  className,
}: UploadChipProps) {
  const [imgError, setImgError] = useState(false);
  const ext = getFileExtension(fileName);
  const isImg = isImage(fileName) && status === 'success' && uploadId && !imgError;
  
  // Truncate long file names
  const displayName = fileName.length > 25 
    ? `${fileName.slice(0, 16)}...${ext ? `.${ext}` : ''}`
    : fileName;

  // T87: Handle click for preview
  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger preview if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    if (status === 'success' && uploadId && onPreview) {
      onPreview(uploadId);
    }
  };

  const isClickable = status === 'success' && uploadId && onPreview;

  return (
    <div
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm',
        'border transition-all duration-200',
        status === 'uploading' && 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
        status === 'success' && 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
        status === 'error' && 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
        isClickable && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600',
        className
      )}
      title={errorMessage || fileName}
      data-testid="chat-attachment-chip"
      data-status={status}
    >
      {/* Status Icon or Image Thumbnail */}
      <div className="flex-shrink-0 w-6 h-6 rounded-md overflow-hidden bg-white dark:bg-slate-700 flex items-center justify-center border border-slate-100 dark:border-slate-600">
        {isImg ? (
          <img 
            src={`/api/upload/${uploadId}/download`} 
            alt="thumb" 
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <>
            {status === 'uploading' && (
              <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
            )}
            {status === 'success' && (
              <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            )}
            {status === 'error' && (
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            )}
          </>
        )}
      </div>

      {/* File Info */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span 
          className={cn(
            'truncate font-medium text-[13px]',
            status === 'uploading' && 'text-blue-700 dark:text-blue-300',
            status === 'success' && 'text-slate-700 dark:text-slate-200',
            status === 'error' && 'text-red-700 dark:text-red-300',
          )}
        >
          {displayName}
        </span>
        {sizeBytes !== undefined && status === 'success' && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatFileSize(sizeBytes)}
          </span>
        )}
        {status === 'uploading' && (
          <span className="text-[10px] text-blue-500 dark:text-blue-400">
            ...
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-800/50 text-red-500"
            title="Retry upload"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={removeDisabled || status === 'uploading'}
            className={cn(
              'p-1 rounded-md transition-colors',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
              (removeDisabled || status === 'uploading') && 'opacity-30 cursor-not-allowed'
            )}
            title="Remove attachment"
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Container for multiple upload chips
 */
export interface UploadChipsContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function UploadChipsContainer({ children, className }: UploadChipsContainerProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {children}
    </div>
  );
}
