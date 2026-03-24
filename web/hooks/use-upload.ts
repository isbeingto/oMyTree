/**
 * T85: useUpload hook
 * 
 * Hook for managing text file uploads with ChatGPT-style UX.
 * Handles upload, list, and delete operations.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { UploadStatus } from '@/components/composer/UploadChip';

export type UploadProcessingMode = 'local' | 'native';

export interface UploadConstraints {
  mode: UploadProcessingMode;
  /** Used only for display / tailoring in UI; server does not enforce per-provider. */
  provider?: string | null;
  allowedExtensions: string[];
  /** Preformatted accept string for <input type="file" accept="..."> */
  accept: string;
  maxFileSize: number;
}

// T85: Allowed extensions for v0
// T88: Added PDF support
export const ALLOWED_EXTENSIONS_LOCAL = ['.txt', '.md', '.json', '.csv', '.tsv', '.yaml', '.yml', '.pdf'];

// T95: Native-mode extends supported media types (image/audio/video)
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.3gp'];

/**
 * File type support matrix per provider (based on official API docs as of Feb 2026):
 *
 * | Type    | OpenAI          | Anthropic (Claude)  | Gemini (Google)              |
 * |---------|-----------------|---------------------|------------------------------|
 * | Images  | PNG/JPG/WEBP/GIF| JPG/PNG/GIF/WEBP    | PNG/JPG/WEBP/GIF             |
 * | PDF     | Yes             | Yes (3.5+)          | Yes                          |
 * | Audio   | No              | No                  | MP3/WAV/AAC/OGG/FLAC         |
 * | Video   | No              | No                  | MP4/WEBM/MOV/AVI/MKV/3GP     |
 *
 * OpenAI: Vision-capable models (gpt-4o, gpt-4.1, gpt-5.x) accept images + PDFs via Chat Completions.
 *         Responses API also accepts these via file upload. No audio/video in Chat Completions input.
 * Claude: Images supported in all Claude 3+ models, PDFs in 3.5+. Files API (beta) for upload-once.
 *         No audio or video input support.
 * Gemini: Full multimodal — images, audio, video, PDFs all supported via File API.
 */
export function getUploadConstraints({
  mode,
  provider,
}: {
  mode: UploadProcessingMode;
  provider?: string | null;
}): UploadConstraints {
  const normalizedProvider = typeof provider === 'string' ? provider.toLowerCase() : null;

  if (mode === 'native') {
    const isGemini = normalizedProvider === 'google' || normalizedProvider === 'gemini';
    // Only Gemini supports audio & video input
    const allowAudio = isGemini;
    const allowVideo = isGemini;

    let allowedExtensions = [...ALLOWED_EXTENSIONS_LOCAL, ...IMAGE_EXTENSIONS];
    if (allowAudio) {
      allowedExtensions = [...allowedExtensions, ...AUDIO_EXTENSIONS];
    }
    if (allowVideo) {
      allowedExtensions = [...allowedExtensions, ...VIDEO_EXTENSIONS];
    }

    // Gemini supports larger files (up to 2GB via File API), but we cap at our quota limit
    const maxSize = isGemini ? GEMINI_MAX_FILE_SIZE : MAX_FILE_SIZE;

    return {
      mode,
      provider: normalizedProvider,
      allowedExtensions,
      accept: allowedExtensions.join(','),
      maxFileSize: maxSize,
    };
  }

  return {
    mode,
    provider: normalizedProvider,
    allowedExtensions: [...ALLOWED_EXTENSIONS_LOCAL],
    accept: ALLOWED_EXTENSIONS_LOCAL.join(','),
    maxFileSize: MAX_FILE_SIZE,
  };
}

// T85: Max file size (5MB) for general uploads
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Gemini supports larger files via File API; cap at 20MB for inline/practical use
export const GEMINI_MAX_FILE_SIZE = 20 * 1024 * 1024;

// T88: Upload error codes for i18n
export type UploadErrorCode = 
  | 'upload_error_unsupported_type'
  | 'upload_error_file_too_large'
  | 'upload_error_quota_tree_exceeded'
  | 'upload_error_quota_user_exceeded'
  | 'upload_error_quota_file_limit'
  | 'upload_error_weekly_quota_exceeded'
  | 'upload_error_parse_failed'
  | 'upload_error_generic';

export interface UploadItem {
  /** Unique ID from backend */
  id: string;
  /** Original file name */
  fileName: string;
  /** File extension */
  ext: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  sizeBytes: number;
  /** SHA256 hash */
  sha256?: string;
  /** Upload status */
  status: UploadStatus;
  /** Error message if failed */
  errorMessage?: string;
  /** Temporary ID for pending uploads */
  tempId?: string;
  /** Original file for retry */
  file?: File;
}

export interface UseUploadOptions {
  /** Tree ID for uploads */
  treeId: string | null;
  /** User ID for authentication header */
  userId?: string | null;
  /** Callback when upload is queued (tempId available) */
  onUploadQueued?: (upload: UploadItem) => void;
  /** Callback when upload succeeds */
  onUploadSuccess?: (upload: UploadItem) => void;
  /** Optional: file validation constraints (provider/mode-aware). */
  constraints?: UploadConstraints;
  /** Callback when upload fails */
  onUploadError?: (
    fileName: string,
    error: string,
    details?: {
      ext?: string;
      mimeType?: string;
      allowedExtensions?: string[];
      maxFileSize?: number;
      mode?: UploadProcessingMode;
      provider?: string | null;
    }
  ) => void;
}

export interface UseUploadReturn {
  /** List of current uploads */
  uploads: UploadItem[];
  /** Whether any upload is in progress */
  isUploading: boolean;
  /** Upload a file */
  uploadFile: (file: File) => Promise<void>;
  /** Remove an upload (calls DELETE API if already uploaded) */
  removeUpload: (uploadId: string) => Promise<void>;
  /** Retry a failed upload */
  retryUpload: (uploadId: string) => Promise<void>;
  /** Clear all uploads */
  clearUploads: () => void;
  /** Get upload IDs for sending with turn */
  getUploadIds: () => string[];
  /** Load uploads for tree */
  loadUploads: () => Promise<void>;
}

/**
 * T88: Validate file before upload
 * Returns error code for i18n translation, or null if valid
 */
export function validateFile(file: File, constraints?: UploadConstraints): UploadErrorCode | null {
  const activeConstraints = constraints || getUploadConstraints({ mode: 'local', provider: null });
  // Check extension
  const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  if (!activeConstraints.allowedExtensions.includes(ext)) {
    return 'upload_error_unsupported_type';
  }

  // Check size
  if (file.size > activeConstraints.maxFileSize) {
    return 'upload_error_file_too_large';
  }

  return null;
}

/**
 * T88: Map API error codes to upload error codes
 */
export function mapApiErrorToUploadError(apiError: string): UploadErrorCode {
  if (apiError.includes('WEEKLY_QUOTA_EXCEEDED') || apiError.includes('upload') || apiError.includes('本周上传')) {
    return 'upload_error_weekly_quota_exceeded';
  }
  // Match common API error codes from upload_quotas.js
  if (apiError.includes('quota_file_too_large') || apiError.includes('too large')) {
    return 'upload_error_file_too_large';
  }
  if (apiError.includes('quota_tree_exceeded') || apiError.includes('Tree storage')) {
    return 'upload_error_quota_tree_exceeded';
  }
  if (apiError.includes('quota_user_storage_exceeded') || apiError.includes('User storage')) {
    return 'upload_error_quota_user_exceeded';
  }
  if (apiError.includes('quota_user_file_limit') || apiError.includes('file limit')) {
    return 'upload_error_quota_file_limit';
  }
  if (apiError.includes('parse') || apiError.includes('Parse')) {
    return 'upload_error_parse_failed';
  }
  if (apiError.includes('not allowed') || apiError.includes('unsupported')) {
    return 'upload_error_unsupported_type';
  }
  return 'upload_error_generic';
}

/**
 * Generate temporary ID for pending uploads
 */
function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useUpload({ treeId, userId, onUploadQueued, onUploadSuccess, onUploadError, constraints }: UseUploadOptions): UseUploadReturn {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Reset upload state when switching trees to avoid leaking attachments across sessions
  useEffect(() => {
    setUploads([]);
    setIsUploading(false);
  }, [treeId]);

  /**
   * Upload a file
   */
  const uploadFile = useCallback(async (file: File) => {
    // Validate file - returns error code for i18n
    const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
    const validationError = validateFile(file, constraints);
    if (validationError) {
      onUploadError?.(file.name, validationError, {
        ext,
        mimeType: file.type || 'application/octet-stream',
        allowedExtensions: constraints?.allowedExtensions,
        maxFileSize: constraints?.maxFileSize,
        mode: constraints?.mode,
        provider: constraints?.provider || null,
      });
      return;
    }

    const tempId = generateTempId();
    // ext already computed above

    const pendingItem: UploadItem = {
      id: tempId,
      tempId,
      fileName: file.name,
      ext,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      status: 'uploading',
      file,
    };

    // Add pending upload to state
    setUploads(prev => [...prev, pendingItem]);
    // Notify caller immediately so UI can reflect uploading/error states
    // (e.g., edit-mode attachment chips).
    // This is safe because tempId is stable for this upload attempt.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    (onUploadQueued)?.(pendingItem);

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      // Allow draft uploads before a tree exists (tree_id omitted).
      if (treeId) {
        formData.append('tree_id', treeId);
      }

      const headers: HeadersInit = {};
      if (userId) {
        headers['x-omytree-user-id'] = userId;
      }

      const providerHint = constraints?.provider ? String(constraints.provider).trim() : '';
      const uploadUrl = providerHint
        ? `/api/upload?provider=${encodeURIComponent(providerHint)}`
        : '/api/upload';

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const errorCode =
          (typeof data?.error === 'string' ? data.error : data?.error?.code) ||
          (typeof data?.code === 'string' ? data.code : null) ||
          'UPLOAD_FAILED';
        const errorMessage =
          (typeof data?.error?.message === 'string' ? data.error.message : null) ||
          (typeof data?.message === 'string' ? data.message : null) ||
          'Upload failed';
        throw new Error(`${errorCode}: ${errorMessage}`);
      }

      // Update upload with real ID and success status
      const uploadRecord = data.upload;
      const successItem: UploadItem = {
        id: uploadRecord.id,
        // T90: Remove tempId on success so getUploadIds() includes this upload
        // tempId is only needed for pending/error state identification
        tempId: undefined,
        fileName: uploadRecord.file_name,
        ext: uploadRecord.ext,
        mimeType: uploadRecord.mime_type,
        sizeBytes: uploadRecord.size_bytes,
        sha256: uploadRecord.sha256,
        status: 'success',
      };

      setUploads(prev => prev.map(u => 
        u.tempId === tempId ? successItem : u
      ));

      onUploadSuccess?.(successItem);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      // T88: Map API error to error code for i18n
      const errorCode = mapApiErrorToUploadError(errorMsg);
      
      // Update upload with error status
      setUploads(prev => prev.map(u => 
        u.tempId === tempId 
          ? { ...u, status: 'error' as const, errorMessage: errorCode }
          : u
      ));

      onUploadError?.(file.name, errorCode);
    } finally {
      setIsUploading(false);
    }
  }, [treeId, userId, onUploadQueued, onUploadSuccess, onUploadError, constraints]);

  /**
   * Remove an upload
   */
  const removeUpload = useCallback(async (uploadId: string) => {
    const upload = uploads.find(u => u.id === uploadId);
    if (!upload) return;

    // If it's a temp ID (pending/failed), just remove from state
    if (upload.tempId) {
      setUploads(prev => prev.filter(u => u.id !== uploadId));
      return;
    }

    // Otherwise, call DELETE API
    try {
      const headers: HeadersInit = {};
      if (userId) {
        headers['x-omytree-user-id'] = userId;
      }

      const response = await fetch(`/api/upload/${uploadId}`, {
        method: 'DELETE',
        headers,
      });

      const data = await response.json();
      if (response.ok && data.ok) {
        setUploads(prev => prev.filter(u => u.id !== uploadId));
      } else {
        console.error('[useUpload] Delete failed:', data);
      }
    } catch (error) {
      console.error('[useUpload] Delete error:', error);
    }
  }, [uploads, userId]);

  /**
   * Retry a failed upload
   */
  const retryUpload = useCallback(async (uploadId: string) => {
    const upload = uploads.find(u => u.id === uploadId);
    if (!upload || !upload.file) return;

    // Remove failed upload
    setUploads(prev => prev.filter(u => u.id !== uploadId));

    // Re-upload
    await uploadFile(upload.file);
  }, [uploads, uploadFile]);

  /**
   * Clear all uploads
   */
  const clearUploads = useCallback(() => {
    setUploads([]);
  }, []);

  /**
   * Get upload IDs for sending with turn
   */
  const getUploadIds = useCallback(() => {
    return uploads
      .filter(u => u.status === 'success' && !u.tempId)
      .map(u => u.id);
  }, [uploads]);

  /**
   * Load uploads for tree
   */
  const loadUploads = useCallback(async () => {
    if (!treeId) return;

    try {
      const headers: HeadersInit = {};
      if (userId) {
        headers['x-omytree-user-id'] = userId;
      }

      const response = await fetch(`/api/trees/${treeId}/uploads`, { headers });
      const data = await response.json();

      if (response.ok && data.ok && Array.isArray(data.uploads)) {
        setUploads(data.uploads.map((u: any) => ({
          id: u.id,
          fileName: u.file_name,
          ext: u.ext,
          mimeType: u.mime_type,
          sizeBytes: u.size_bytes,
          sha256: u.sha256,
          status: 'success' as const,
        })));
      }
    } catch (error) {
      console.error('[useUpload] Load uploads error:', error);
    }
  }, [treeId, userId]);

  return {
    uploads,
    isUploading,
    uploadFile,
    removeUpload,
    retryUpload,
    clearUploads,
    getUploadIds,
    loadUploads,
  };
}
