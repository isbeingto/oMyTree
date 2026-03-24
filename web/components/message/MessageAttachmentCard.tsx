/**
 * T88: MessageAttachmentCard
 * 
 * Displays attachment cards within chat message bubbles.
 * Shows file icon, name, size, and optional preview action.
 */

'use client';

import React, { useState } from 'react';
import { FileText, File, FileCode, FileSpreadsheet, FileIcon, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

export interface MessageAttachment {
  /** Upload ID */
  id: string;
  /** Original file name */
  fileName: string;
  /** File extension (with dot) */
  ext: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Mime type (optional) */
  mimeType?: string;
}

export interface MessageAttachmentCardProps {
  /** Attachment data */
  attachment: MessageAttachment;
  /** Language for i18n */
  lang?: Lang;
  /** Click handler for preview */
  onPreview?: (attachment: MessageAttachment) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Check if file is an image
 */
export function isImageFile(attachment: MessageAttachment) {
  if (attachment.mimeType?.startsWith('image/')) return true;
  const normalizedExt = attachment.ext.toLowerCase().replace(/^\./, '');
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(normalizedExt);
}

/**
 * Get appropriate icon for file type
 */
function getFileIcon(ext: string) {
  const normalizedExt = ext.toLowerCase().replace(/^\./, '');
  
  switch (normalizedExt) {
    case 'md':
    case 'txt':
      return FileText;
    case 'json':
    case 'yaml':
    case 'yml':
      return FileCode;
    case 'csv':
    case 'tsv':
      return FileSpreadsheet;
    default:
      return File;
  }
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Truncate filename if too long
 */
function truncateFileName(name: string, maxLength = 20): string {
  if (name.length <= maxLength) return name;
  
  const ext = name.match(/\.[^.]+$/)?.[0] || '';
  const baseName = name.slice(0, name.length - ext.length);
  const truncatedBase = baseName.slice(0, Math.max(0, maxLength - ext.length - 3));
  
  return `${truncatedBase}...${ext}`;
}

export function MessageAttachmentCard({
  attachment,
  lang = 'en',
  onPreview,
  className,
}: MessageAttachmentCardProps) {
  const [imgError, setImgError] = useState(false);
  const isImg = isImageFile(attachment) && !imgError;
  const Icon = getFileIcon(attachment.ext);
  const displayName = truncateFileName(attachment.fileName);
  const fileSize = formatFileSize(attachment.sizeBytes);
  const isClickable = !!onPreview;

  // Image Thumbnail View
  if (isImg) {
    return (
      <div 
        onClick={() => onPreview?.(attachment)}
        className={cn(
          'relative group overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/50',
          'bg-white dark:bg-slate-900/60 transition-all duration-300 shadow-sm',
          isClickable && 'cursor-pointer hover:shadow-lg hover:border-primary/30 hover:ring-2 hover:ring-primary/10',
          className
        )}
      >
        <div className="w-32 h-32 md:w-36 md:h-36 flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800">
          <img
            src={`/api/upload/${attachment.id}/download`}
            alt={attachment.fileName}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
        
        {/* Overlay with file info on hover */}
        <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <p className="text-[10px] text-white truncate font-semibold text-center px-1">
            {attachment.fileName}
          </p>
          <p className="text-[9px] text-white/80 text-center font-medium">
            {fileSize}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onPreview?.(attachment)}
      className={cn(
        'inline-flex items-center gap-3 px-3.5 py-2.5 rounded-2xl',
        'bg-white dark:bg-slate-900/60',
        'border border-slate-200/80 dark:border-slate-700/50',
        'transition-all duration-200 shadow-sm',
        isClickable && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md',
        className
      )}
      title={attachment.fileName}
      data-testid="message-attachment-card"
      data-attachment-id={attachment.id}
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <Icon className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
      </div>
      
      <div className="flex flex-col min-w-0 pr-1 gap-0.5">
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[180px]">
          {displayName}
        </span>
        <span className="text-[10px] text-muted-foreground/80 font-medium">
          {fileSize}
        </span>
      </div>
    </div>
  );
}

export interface MessageAttachmentListProps {
  /** List of attachments */
  attachments: MessageAttachment[];
  /** Language for i18n */
  lang?: Lang;
  /** Click handler for preview */
  onPreview?: (attachment: MessageAttachment) => void;
  /** Additional class names */
  className?: string;
}

export function MessageAttachmentList({
  attachments,
  lang = 'en',
  onPreview,
  className,
}: MessageAttachmentListProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const images = attachments.filter(att => isImageFile(att));
  const files = attachments.filter(att => !isImageFile(att));

  return (
    <div 
      className={cn('flex flex-col gap-2.5 w-full', className)}
      data-testid="message-attachment-list"
    >
      {/* Images Grid */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          {images.map((img) => (
            <MessageAttachmentCard
              key={img.id}
              attachment={img}
              lang={lang}
              onPreview={onPreview}
              className="shadow-sm"
            />
          ))}
        </div>
      )}

      {/* Files List */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2 items-end">
          {files.map((file) => (
            <MessageAttachmentCard
              key={file.id}
              attachment={file}
              lang={lang}
              onPreview={onPreview}
              className="w-fit min-w-[200px] max-w-full shadow-sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}
