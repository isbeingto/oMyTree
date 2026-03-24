/**
 * T85-Optimization: Provider File Cache Service
 * 
 * Caches file IDs uploaded to external LLM providers (Gemini, Anthropic, OpenAI)
 * to avoid redundant uploads within the TTL period.
 * 
 * TTL Strategy (conservative):
 * - Gemini: 24h (actual ~48h)
 * - Anthropic: 12h (actual ~24h)
 * - OpenAI: 1h (responses API files are session-scoped)
 */

import { pool } from '../../db/pool.js';

// Conservative TTL values (in hours) - actual TTL is typically 2x
const PROVIDER_TTL_HOURS = {
  gemini: 24,
  anthropic: 12,
  openai: 1,
};

/**
 * Get cached provider file ID if still valid
 * @param {string} uploadId - Internal upload UUID
 * @param {string} provider - 'gemini', 'anthropic', 'openai'
 * @returns {Promise<{provider_file_id: string, mime_type: string} | null>}
 */
export async function getCachedProviderFile(uploadId, provider) {
  try {
    const { rows } = await pool.query(
      `SELECT provider_file_id, mime_type 
       FROM provider_file_cache 
       WHERE upload_id = $1 
         AND provider = $2 
         AND expires_at > NOW()
       LIMIT 1`,
      [uploadId, provider.toLowerCase()]
    );
    return rows[0] || null;
  } catch (err) {
    console.warn('[provider_file_cache] getCached failed:', err.message);
    return null;
  }
}

/**
 * Cache a provider file ID after successful upload
 * @param {Object} params
 * @param {string} params.uploadId - Internal upload UUID
 * @param {string} params.provider - 'gemini', 'anthropic', 'openai'
 * @param {string} params.providerFileId - External file ID/URI
 * @param {string} [params.mimeType] - File MIME type
 * @returns {Promise<void>}
 */
export async function cacheProviderFile({ uploadId, provider, providerFileId, mimeType }) {
  const normalizedProvider = provider.toLowerCase();
  const ttlHours = PROVIDER_TTL_HOURS[normalizedProvider] || 1;
  
  try {
    await pool.query(
      `INSERT INTO provider_file_cache (upload_id, provider, provider_file_id, mime_type, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${ttlHours} hours')
       ON CONFLICT (upload_id, provider) 
       DO UPDATE SET 
         provider_file_id = EXCLUDED.provider_file_id,
         mime_type = EXCLUDED.mime_type,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
      [uploadId, normalizedProvider, providerFileId, mimeType || null]
    );
  } catch (err) {
    // Non-critical: log but don't fail the request
    console.warn('[provider_file_cache] cache failed:', err.message);
  }
}

/**
 * Batch lookup for multiple uploads
 * @param {string[]} uploadIds - Array of upload UUIDs
 * @param {string} provider - Provider name
 * @returns {Promise<Map<string, {provider_file_id: string, mime_type: string}>>}
 */
export async function getCachedProviderFiles(uploadIds, provider) {
  if (!uploadIds || uploadIds.length === 0) {
    return new Map();
  }
  
  try {
    const { rows } = await pool.query(
      `SELECT upload_id, provider_file_id, mime_type 
       FROM provider_file_cache 
       WHERE upload_id = ANY($1::uuid[])
         AND provider = $2 
         AND expires_at > NOW()`,
      [uploadIds, provider.toLowerCase()]
    );
    
    const cacheMap = new Map();
    for (const row of rows) {
      cacheMap.set(row.upload_id, {
        provider_file_id: row.provider_file_id,
        mime_type: row.mime_type,
      });
    }
    return cacheMap;
  } catch (err) {
    console.warn('[provider_file_cache] batch getCached failed:', err.message);
    return new Map();
  }
}

/**
 * Cleanup expired cache entries (called by background job)
 * @returns {Promise<number>} Number of deleted rows
 */
export async function cleanupExpiredCache() {
  try {
    const result = await pool.query(
      `DELETE FROM provider_file_cache WHERE expires_at < NOW()`
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      console.log(`[provider_file_cache] Cleaned up ${count} expired entries`);
    }
    return count;
  } catch (err) {
    console.warn('[provider_file_cache] cleanup failed:', err.message);
    return 0;
  }
}
