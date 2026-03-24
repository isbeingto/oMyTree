/**
 * T85: Upload Service
 * T87: Added text parsing functionality
 * 
 * Handles CRUD operations for uploads stored in PostgreSQL bytea.
 * Text/PDF uploads support parsing; image/audio uploads are stored as bytes for native-provider attachments.
 */

import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';
import { UPLOAD_QUOTAS, QUOTA_ERROR_CODES, formatBytes } from '../../config/upload_quotas.js';
import { parseContent, parseContentAsync, getSnippet } from './text_parser.js';

// T85: Allowed file extensions for v0
// T88: Added .pdf support
// T95: Expanded to allow common image/audio formats for native-provider attachments
// T-FILE: Added video support (Gemini only) and per-provider validation
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.tsv', '.yaml', '.yml', '.xml', '.log', '.cfg', '.ini', '.conf', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac',
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.3gp',
];

// T85: Allowed MIME types for v0
// T88: Added PDF MIME type
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/csv',
  'text/tab-separated-values',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/yaml',
  'text/xml',
  'application/xml',
  'application/pdf',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  // Video (Gemini-only, but stored generically)
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/3gpp',
];

// T86: Use quota config for max file size
const MAX_FILE_SIZE = UPLOAD_QUOTAS.maxFileBytes;

/**
 * T86: Check all quotas before upload
 * Throws HttpError with specific code if any quota is exceeded
 */
export async function checkUploadQuotas(userId, treeId, fileSizeBytes) {
  // 1. Check single file size
  if (fileSizeBytes > UPLOAD_QUOTAS.maxFileBytes) {
    throw new HttpError({
      status: 413,
      code: QUOTA_ERROR_CODES.FILE_TOO_LARGE,
      message: `File size ${formatBytes(fileSizeBytes)} exceeds maximum ${formatBytes(UPLOAD_QUOTAS.maxFileBytes)}`,
      detail: {
        fileSize: fileSizeBytes,
        maxSize: UPLOAD_QUOTAS.maxFileBytes,
        maxSizeFormatted: formatBytes(UPLOAD_QUOTAS.maxFileBytes),
      },
    });
  }

  // Note: tree/user aggregate quotas have been removed.
  return { ok: true };
}

/**
 * Validate file extension
 */
export function validateExtension(fileName) {
  const ext = getExtension(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new HttpError({
      status: 400,
      code: 'invalid_extension',
      message: `File extension "${ext}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    });
  }
  return ext;
}

/**
 * Get normalized extension from filename
 */
export function getExtension(fileName) {
  const match = fileName.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType) {
  // Be lenient with MIME types - some systems report different types
  // for the same file format
  const normalized = mimeType.toLowerCase();
  
  // Check if it's a text type or one of our allowed types
  if (normalized.startsWith('text/') || ALLOWED_MIME_TYPES.includes(normalized)) {
    return normalized;
  }
  
  // Also accept application/octet-stream for text files (some browsers do this)
  if (normalized === 'application/octet-stream') {
    return normalized;
  }
  
  throw new HttpError({
    status: 400,
    code: 'invalid_mime_type',
    message: `MIME type "${mimeType}" not allowed for text uploads`,
  });
}

/**
 * Validate file size
 */
export function validateFileSize(sizeBytes) {
  if (sizeBytes > MAX_FILE_SIZE) {
    throw new HttpError({
      status: 400,
      code: 'file_too_large',
      message: `File size ${formatBytes(sizeBytes)} exceeds maximum ${formatBytes(MAX_FILE_SIZE)}`,
    });
  }
  return sizeBytes;
}

/**
 * Compute SHA256 hash of buffer
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Create a new upload
 */
export async function createUpload({
  userId,
  treeId,
  turnId = null,
  nodeId = null,
  fileName,
  mimeType,
  contentBuffer,
  client = null,
}) {
  // Validate inputs
  const ext = validateExtension(fileName);
  validateMimeType(mimeType);
  const sizeBytes = validateFileSize(contentBuffer.length);
  const sha256 = computeSha256(contentBuffer);

  const executor = client || pool;
  const { rows } = await executor.query(
    `INSERT INTO uploads (
      user_id, tree_id, turn_id, node_id,
      file_name, ext, mime_type, size_bytes, sha256,
      content_bytes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, user_id, tree_id, turn_id, node_id,
              file_name, ext, mime_type, size_bytes, sha256, created_at`,
    [
      userId, treeId, turnId, nodeId,
      fileName, ext, mimeType, sizeBytes, sha256,
      contentBuffer
    ]
  );

  return rows[0];
}

/**
 * T90: Assign draft uploads (tree_id IS NULL) to a newly created tree.
 * Only allows uploads owned by the same user.
 */
export async function assignDraftUploadsToTree({ userId, treeId, uploadIds, client }) {
  if (!treeId) return { ok: true, assigned: 0 };
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
    return { ok: true, assigned: 0 };
  }

  const executor = client || pool;
  const { rowCount } = await executor.query(
    `UPDATE uploads
     SET tree_id = $1
     WHERE id = ANY($2)
       AND user_id = $3
       AND tree_id IS NULL`,
    [treeId, uploadIds, userId]
  );

  return { ok: true, assigned: rowCount ?? 0 };
}

/**
 * Get upload by ID
 */
export async function getUploadById(uploadId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, tree_id, turn_id, node_id,
            file_name, ext, mime_type, size_bytes, sha256, created_at
     FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  return rows[0];
}

/**
 * Get upload content (bytea)
 */
export async function getUploadContent(uploadId) {
  const { rows } = await pool.query(
    `SELECT content_bytes, file_name, mime_type FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  return rows[0];
}

/**
 * Batch get upload content (bytea)
 *
 * This avoids N+1 queries when hydrating many historical attachments.
 * Returns only rows that exist; callers should handle missing IDs.
 */
export async function getUploadsContent(uploadIds) {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id, content_bytes, file_name, mime_type
     FROM uploads
     WHERE id = ANY($1::uuid[])`,
    [uploadIds]
  );
  return rows;
}

/**
 * List uploads for a tree
 */
export async function listUploadsForTree(treeId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, user_id, tree_id, turn_id, node_id,
            file_name, ext, mime_type, size_bytes, sha256, created_at
     FROM uploads 
     WHERE tree_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [treeId, limit, offset]
  );

  return rows;
}

/**
 * Delete upload by ID
 */
export async function deleteUpload(uploadId) {
  const { rows } = await pool.query(
    `DELETE FROM uploads WHERE id = $1 RETURNING id`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  return { deleted: true, id: uploadId };
}

/**
 * Attach upload to turn
 */
export async function attachUploadToTurn(turnId, uploadId) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO turn_uploads (turn_id, upload_id)
       VALUES ($1, $2)
       ON CONFLICT (turn_id, upload_id) DO NOTHING
       RETURNING *`,
      [turnId, uploadId]
    );

    return {
      created: rows.length > 0,
      link: rows[0] || { turn_id: turnId, upload_id: uploadId },
    };
  } catch (err) {
    // Handle foreign key violations
    if (err.code === '23503') {
      throw new HttpError({
        status: 400,
        code: 'invalid_reference',
        message: 'Turn or upload does not exist',
      });
    }
    throw err;
  }
}

/**
 * List uploads for a turn
 */
export async function listUploadsForTurn(turnId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.user_id, u.tree_id, u.turn_id, u.node_id,
            u.file_name, u.ext, u.mime_type, u.size_bytes, u.sha256, u.created_at
     FROM uploads u
     JOIN turn_uploads tu ON u.id = tu.upload_id
     WHERE tu.turn_id = $1
     ORDER BY u.created_at DESC`,
    [turnId]
  );

  return rows;
}

/**
 * Get allowed extensions (for frontend validation)
 */
export function getAllowedExtensions() {
  return ALLOWED_EXTENSIONS;
}

/**
 * Get max file size (for frontend validation)
 */
export function getMaxFileSize() {
  return MAX_FILE_SIZE;
}

/**
 * T-FILE: Per-provider file type support matrix.
 * Returns true if the given MIME type is supported by the specified provider.
 *
 * Official API docs (as of Feb 2026):
 * - OpenAI:    images (PNG/JPG/WEBP/GIF) + PDF. No audio, no video.
 * - Anthropic: images (JPG/PNG/GIF/WEBP) + PDF. No audio, no video.
 * - Gemini:    images + PDF + audio (MP3/WAV/AAC/OGG/FLAC) + video (MP4/WEBM/MOV/AVI/MKV/3GP).
 * - DeepSeek:  text files only (parsed locally, not sent as attachments).
 */
export function isFileTypeSupported(provider, mimeType) {
  const p = typeof provider === 'string' ? provider.toLowerCase() : '';
  const m = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';

  // Text/document types — universally supported
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml' ||
      m === 'application/pdf' || m.includes('yaml')) {
    return true;
  }

  // Images — supported by OpenAI, Anthropic, Gemini
  if (m.startsWith('image/')) {
    return p === 'openai' || p === 'anthropic' || p === 'claude' ||
           p === 'google' || p === 'gemini';
  }

  // Audio — only Gemini
  if (m.startsWith('audio/')) {
    return p === 'google' || p === 'gemini';
  }

  // Video — only Gemini
  if (m.startsWith('video/')) {
    return p === 'google' || p === 'gemini';
  }

  return false;
}

/**
 * T86: Delete all uploads for a tree
 * Called when tree is soft-deleted to clean up storage
 * Returns count of deleted uploads
 */
export async function deleteUploadsForTree(treeId) {
  // First delete from turn_uploads junction (CASCADE should handle this, but be explicit)
  await pool.query(
    `DELETE FROM turn_uploads 
     WHERE upload_id IN (SELECT id FROM uploads WHERE tree_id = $1)`,
    [treeId]
  );

  // Then delete the uploads themselves
  const { rowCount } = await pool.query(
    `DELETE FROM uploads WHERE tree_id = $1`,
    [treeId]
  );

  return { deleted: rowCount };
}

/**
 * T86: Get total upload size for a tree
 */
export async function getTreeUploadStats(treeId) {
  const { rows } = await pool.query(
    `SELECT 
      COUNT(*) as file_count,
      COALESCE(SUM(size_bytes), 0) as total_bytes
     FROM uploads WHERE tree_id = $1`,
    [treeId]
  );
  return {
    fileCount: parseInt(rows[0].file_count, 10),
    totalBytes: parseInt(rows[0].total_bytes, 10),
  };
}

/**
 * T86: Get total upload size for a user
 */
export async function getUserUploadStats(userId) {
  const { rows } = await pool.query(
    `SELECT 
      COUNT(*) as file_count,
      COALESCE(SUM(size_bytes), 0) as total_bytes
     FROM uploads WHERE user_id = $1`,
    [userId]
  );
  return {
    fileCount: parseInt(rows[0].file_count, 10),
    totalBytes: parseInt(rows[0].total_bytes, 10),
  };
}

// =========================================================================
// T87: Text Parsing Functions
// =========================================================================

/**
 * T87: Parse upload content and store normalized text
 * T88: Updated to use async parsing for PDF support
 * Called automatically after upload or on-demand for existing uploads
 * @param {string} uploadId - Upload ID
 * @returns {Promise<{ok: boolean, normalized_text?: string, normalized_meta?: object, parse_error?: string}>}
 */
export async function parseUpload(uploadId) {
  // Get upload content
  const { rows } = await pool.query(
    `SELECT id, content_bytes, ext, file_name FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  const { content_bytes, ext, file_name } = rows[0];
  
  // T88: Use async parser to support PDF and other async formats
  const result = await parseContentAsync(content_bytes, ext, file_name);
  
  // Update database
  await pool.query(
    `UPDATE uploads 
     SET normalized_text = $1,
         normalized_meta = $2,
         parsed_at = NOW(),
         parse_error = $3
     WHERE id = $4`,
    [
      result.text,
      result.meta ? JSON.stringify(result.meta) : null,
      result.error,
      uploadId,
    ]
  );

  return {
    ok: !result.error,
    normalized_text: result.text,
    normalized_meta: result.meta,
    parse_error: result.error,
  };
}

/**
 * T87: Get normalized text for an upload
 * If not yet parsed, parse on-demand
 * @param {string} uploadId
 * @param {Object} options
 * @param {number} options.maxLength - Maximum text length to return (0 = full)
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Object>}
 */
export async function getUploadText(uploadId, { maxLength = 0, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, file_name, ext, size_bytes, mime_type,
            normalized_text, normalized_meta, parsed_at, parse_error
     FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  let upload = rows[0];

  // Parse on-demand if not yet parsed
  if (!upload.parsed_at) {
    const parseResult = await parseUpload(uploadId);
    upload = {
      ...upload,
      normalized_text: parseResult.normalized_text,
      normalized_meta: parseResult.normalized_meta,
      parse_error: parseResult.parse_error,
      parsed_at: new Date(),
    };
  }

  // Handle parse error
  if (upload.parse_error) {
    return {
      ok: false,
      file_name: upload.file_name,
      ext: upload.ext,
      size_bytes: upload.size_bytes,
      mime_type: upload.mime_type,
      text: null,
      meta: null,
      error: upload.parse_error,
      parsed_at: upload.parsed_at,
    };
  }

  // Apply pagination/truncation
  let text = upload.normalized_text || '';
  const totalLength = text.length;
  
  if (offset > 0) {
    text = text.slice(offset);
  }
  
  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return {
    ok: true,
    file_name: upload.file_name,
    ext: upload.ext,
    size_bytes: upload.size_bytes,
    mime_type: upload.mime_type,
    text,
    total_length: totalLength,
    offset,
    meta: upload.normalized_meta,
    parsed_at: upload.parsed_at,
  };
}

/**
 * T87: Get snippet preview for an upload
 * @param {string} uploadId
 * @param {number} snippetLength - Maximum snippet length
 * @returns {Promise<Object>}
 */
export async function getUploadSnippet(uploadId, snippetLength = 500) {
  const { rows } = await pool.query(
    `SELECT id, file_name, ext, size_bytes, mime_type,
            normalized_text, normalized_meta, parsed_at, parse_error
     FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'upload_not_found',
      message: 'Upload not found',
    });
  }

  let upload = rows[0];

  // Parse on-demand if not yet parsed
  if (!upload.parsed_at) {
    const parseResult = await parseUpload(uploadId);
    upload = {
      ...upload,
      normalized_text: parseResult.normalized_text,
      normalized_meta: parseResult.normalized_meta,
      parse_error: parseResult.parse_error,
      parsed_at: new Date(),
    };
  }

  return {
    ok: !upload.parse_error,
    file_name: upload.file_name,
    ext: upload.ext,
    size_bytes: upload.size_bytes,
    mime_type: upload.mime_type,
    snippet: upload.normalized_text ? getSnippet(upload.normalized_text, snippetLength) : null,
    full_length: upload.normalized_text ? upload.normalized_text.length : 0,
    meta: upload.normalized_meta,
    error: upload.parse_error,
    parsed_at: upload.parsed_at,
  };
}

/**
 * T87: Re-export getSnippet for external use
 */
export { getSnippet };

/**
 * T85-fix: Get text content for multiple uploads
 * Used to build LLM context with uploaded file contents
 * @param {string[]} uploadIds - Array of upload IDs
 * @param {Object} options
 * @param {number} options.maxLengthPerFile - Max chars per file (default 32000)
 * @returns {Promise<Array<{id: string, fileName: string, text: string, error?: string}>>}
 */
export async function getUploadsTextForContext(uploadIds, { maxLengthPerFile = 32000 } = {}) {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
    return [];
  }

  const results = [];

  for (const uploadId of uploadIds) {
    try {
      const { rows } = await pool.query(
        `SELECT id, file_name, ext, normalized_text, parsed_at, parse_error
         FROM uploads WHERE id = $1`,
        [uploadId]
      );

      if (rows.length === 0) {
        results.push({
          id: uploadId,
          fileName: 'unknown',
          text: '',
          error: 'Upload not found',
        });
        continue;
      }

      let upload = rows[0];

      // Parse on-demand if not yet parsed
      if (!upload.parsed_at) {
        try {
          const parseResult = await parseUpload(uploadId);
          upload = {
            ...upload,
            normalized_text: parseResult.normalized_text,
            parse_error: parseResult.parse_error,
          };
        } catch (parseErr) {
          results.push({
            id: uploadId,
            fileName: upload.file_name,
            text: '',
            error: `Parse failed: ${parseErr.message}`,
          });
          continue;
        }
      }

      if (upload.parse_error) {
        results.push({
          id: uploadId,
          fileName: upload.file_name,
          text: '',
          error: upload.parse_error,
        });
        continue;
      }

      // Truncate if too long
      let text = upload.normalized_text || '';
      if (text.length > maxLengthPerFile) {
        text = text.slice(0, maxLengthPerFile) + '\n... (truncated)';
      }

      results.push({
        id: uploadId,
        fileName: upload.file_name,
        text,
      });
    } catch (err) {
      results.push({
        id: uploadId,
        fileName: 'unknown',
        text: '',
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * T85-fix: Format uploaded files content for LLM prompt
 * T88: Enhanced with better formatting and LLM instructions
 * @param {Array<{id: string, fileName: string, text: string}>} uploadsWithText
 * @returns {string} Formatted string to append to user message
 */
export function formatUploadsForPrompt(uploadsWithText) {
  if (!Array.isArray(uploadsWithText) || uploadsWithText.length === 0) {
    return '';
  }

  const validUploads = uploadsWithText.filter(u => u.text && !u.error);
  if (validUploads.length === 0) {
    return '';
  }

  // T88: Build formatted content with clear instructions for LLM
  const fileCount = validUploads.length;
  const fileWord = fileCount === 1 ? 'file' : 'files';
  
  let result = `\n\n<attached_files count="${fileCount}">`;
  result += `\n<!-- The user has attached ${fileCount} ${fileWord}. Please read and understand the content below. -->`;
  result += `\n<!-- When answering, reference specific parts of the files if relevant. -->`;
  
  for (const upload of validUploads) {
    const ext = upload.fileName.split('.').pop()?.toLowerCase() || 'txt';
    result += `\n\n<file name="${upload.fileName}" type="${ext}">`;
    result += `\n${upload.text}`;
    result += `\n</file>`;
  }
  
  result += `\n</attached_files>`;
  
  return result;
}
