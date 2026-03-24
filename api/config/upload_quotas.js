/**
 * T86: Upload Quota Configuration
 * 
 * Defines limits for file uploads. These can be overridden per-user
 * in a future membership system.
 */

// Default quotas for v0 (no membership system)
export const UPLOAD_QUOTAS = {
  // Maximum size of a single file (5MB)
  maxFileBytes: 5 * 1024 * 1024,

  // NOTE: The following v0 aggregate quotas are no longer enforced.
  // We keep the fields for backward compatibility with existing clients.
  // Unlimited is represented as null.
  maxTreeBytes: null,
  maxUserBytes: null,
  maxUserFiles: null,
};

// Error codes for quota violations
export const QUOTA_ERROR_CODES = {
  FILE_TOO_LARGE: 'quota_file_too_large',
  TREE_QUOTA_EXCEEDED: 'quota_tree_exceeded',
  USER_STORAGE_EXCEEDED: 'quota_user_storage_exceeded',
  USER_FILE_LIMIT_EXCEEDED: 'quota_user_file_limit_exceeded',
};

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
