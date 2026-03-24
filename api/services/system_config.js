/**
 * System Configuration Service
 * 
 * Provides cached access to system-wide configuration settings.
 * Uses in-memory cache with TTL to reduce database load.
 * 
 * @module services/system_config
 */

import { pool } from '../db/pool.js';

// Cache TTL in milliseconds (30 seconds)
const CACHE_TTL_MS = 30 * 1000;

// In-memory cache
const cache = new Map();

/**
 * Get a configuration value with caching
 * @param {string} key - Configuration key
 * @param {*} defaultValue - Default value if not found
 * @returns {Promise<*>} Configuration value
 */
export async function getConfig(key, defaultValue = null) {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  try {
    const result = await pool.query(
      'SELECT value FROM system_config WHERE key = $1',
      [key]
    );

    let value = defaultValue;
    if (result.rows.length > 0) {
      value = result.rows[0].value;
    }

    // Cache the result
    cache.set(key, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return value;
  } catch (error) {
    console.error(`[system_config] Error getting config ${key}:`, error.message);
    return defaultValue;
  }
}

/**
 * Set a configuration value
 * @param {string} key - Configuration key
 * @param {*} value - Value to set (will be stored as JSON)
 * @param {string|null} updatedBy - User ID (UUID) who made the change
 * @returns {Promise<boolean>} Success status
 */
export async function setConfig(key, value, updatedBy = null) {
  try {
    // Validate updatedBy is a valid UUID or null
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUpdatedBy = updatedBy && uuidRegex.test(updatedBy) ? updatedBy : null;
    
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET
         value = $2::jsonb,
         updated_at = NOW(),
         updated_by = $3`,
      [key, JSON.stringify(value), validUpdatedBy]
    );

    // Invalidate cache
    cache.delete(key);

    console.log(`[system_config] Set ${key} = ${JSON.stringify(value)} by ${updatedBy || 'system'}`);
    return true;
  } catch (error) {
    console.error(`[system_config] Error setting config ${key}:`, error.message);
    return false;
  }
}

/**
 * Invalidate cache for a specific key or all keys
 * @param {string|null} key - Key to invalidate, or null for all
 */
export function invalidateCache(key = null) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// ===== Specific Config Helpers =====

/**
 * Check if official LLM is enabled (Kill Switch)
 * @returns {Promise<boolean>} true if enabled, false if disabled
 */
export async function isOfficialLLMEnabled() {
  const value = await getConfig('official_llm_enabled', true);
  // Handle both boolean and JSON boolean
  return value === true || value === 'true';
}

/**
 * Set official LLM enabled status
 * @param {boolean} enabled - Enable or disable
 * @param {string|null} updatedBy - Admin user ID
 * @returns {Promise<boolean>} Success status
 */
export async function setOfficialLLMEnabled(enabled, updatedBy = null) {
  return setConfig('official_llm_enabled', enabled, updatedBy);
}

export default {
  getConfig,
  setConfig,
  invalidateCache,
  isOfficialLLMEnabled,
  setOfficialLLMEnabled,
};
