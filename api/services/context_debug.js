/**
 * T53-3: Context Debug Logger
 * Records LLM request context (messages) for debugging purposes
 */

import { pool } from '../db/pool.js';

// Global debug switch - can be toggled via environment variable
const GLOBAL_DEBUG_ENABLED = process.env.LLM_CONTEXT_DEBUG === '1';

// Maximum messages to log (prevent database bloat)
const MAX_MESSAGES_TO_LOG = 50;

// Maximum content length per message (chars)
const MAX_MESSAGE_CONTENT_LENGTH = 10000;

/**
 * Check if context debug is enabled for a specific tree
 * @param {string} treeId - Tree UUID
 * @returns {Promise<{enabled: boolean, source: 'global'|'tree'|'disabled'}>}
 */
export async function isContextDebugEnabled(treeId) {
  // Global switch takes priority
  if (GLOBAL_DEBUG_ENABLED) {
    return { enabled: true, source: 'global' };
  }

  // Check per-tree flag
  if (!treeId) {
    return { enabled: false, source: 'disabled' };
  }

  try {
    const result = await pool.query(
      'SELECT context_debug_enabled FROM trees WHERE id = $1',
      [treeId]
    );

    if (result.rows.length > 0 && result.rows[0].context_debug_enabled) {
      return { enabled: true, source: 'tree' };
    }
  } catch (error) {
    console.warn('[context-debug] Failed to check tree debug flag:', error.message);
  }

  return { enabled: false, source: 'disabled' };
}

/**
 * Truncate message content to prevent excessive storage
 * @param {Array} messages - Array of {role, content} objects
 * @returns {Array} Truncated messages
 */
function truncateMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  // Limit total number of messages
  const limited = messages.slice(0, MAX_MESSAGES_TO_LOG);

  // Truncate content in each message
  return limited.map((msg) => {
    if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      return {
        ...msg,
        content: msg.content.substring(0, MAX_MESSAGE_CONTENT_LENGTH) + '\n\n[... truncated ...]',
        _truncated: true,
      };
    }
    return msg;
  });
}

/**
 * Estimate token count (rough approximation)
 * @param {Array} messages
 * @returns {number}
 */
function estimateTokenCount(messages) {
  if (!Array.isArray(messages)) return 0;
  
  const totalChars = messages.reduce((sum, msg) => {
    return sum + (typeof msg.content === 'string' ? msg.content.length : 0);
  }, 0);

  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(totalChars / 4);
}

/**
 * Log context debug snapshot
 * @param {Object} params
 * @param {string} params.treeId - Tree UUID
 * @param {string} params.nodeId - Node UUID (optional)
 * @param {string} params.turnId - Turn UUID (optional)
 * @param {string} params.userId - User UUID
 * @param {string} params.provider - LLM provider name
 * @param {string} params.model - Model identifier
 * @param {string} params.contextProfile - Context profile (lite/standard/max)
 * @param {string} params.memoryScope - Memory scope (branch/tree)
 * @param {Array} params.messages - Messages array to log
 * @param {string} params.debugSource - Source of debug flag ('global' or 'tree')
 * @param {number} params.contextBuildMs - Time to build context (ms)
 * @param {string} params.notes - Optional notes
 * @returns {Promise<string>} Log ID
 */
export async function logContextDebug({
  treeId,
  nodeId = null,
  turnId = null,
  userId,
  provider,
  model,
  contextProfile,
  memoryScope,
  messages,
  debugSource,
  contextBuildMs = null,
  notes = null,
}) {
  try {
    const truncated = truncateMessages(messages);
    const tokenCount = estimateTokenCount(truncated);

    const result = await pool.query(
      `INSERT INTO context_debug_logs (
        tree_id, node_id, turn_id, user_id,
        provider, model, context_profile, memory_scope,
        messages, message_count, total_tokens,
        debug_enabled_by, context_build_ms, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id`,
      [
        treeId,
        nodeId,
        turnId,
        userId,
        provider,
        model,
        contextProfile,
        memoryScope,
        JSON.stringify(truncated),
        truncated.length,
        tokenCount,
        debugSource,
        contextBuildMs,
        notes,
      ]
    );

    const logId = result.rows[0].id;
    console.log(`[context-debug] Logged snapshot: log_id=${logId}, tree=${treeId}, messages=${truncated.length}, tokens≈${tokenCount}`);
    return logId;
  } catch (error) {
    console.error('[context-debug] Failed to log snapshot:', error.message);
    // Don't throw - debug logging should never break main flow
    return null;
  }
}

/**
 * Query debug logs
 * @param {Object} filters
 * @param {string} filters.treeId - Filter by tree
 * @param {string} filters.turnId - Filter by turn
 * @param {string} filters.userId - Filter by user
 * @param {number} filters.limit - Max results (default 50)
 * @returns {Promise<Array>}
 */
export async function queryContextDebugLogs({
  treeId = null,
  turnId = null,
  userId = null,
  limit = 50,
}) {
  try {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (treeId) {
      conditions.push(`tree_id = $${paramIndex++}`);
      params.push(treeId);
    }

    if (turnId) {
      conditions.push(`turn_id = $${paramIndex++}`);
      params.push(turnId);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        id, created_at, tree_id, node_id, turn_id,
        provider, model, context_profile, memory_scope,
        messages, message_count, total_tokens,
        debug_enabled_by, context_build_ms, notes
      FROM context_debug_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;

    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('[context-debug] Failed to query logs:', error.message);
    throw error;
  }
}

/**
 * Delete old debug logs (cleanup utility)
 * @param {number} daysOld - Delete logs older than N days
 * @returns {Promise<number>} Number of deleted rows
 */
export async function cleanupOldDebugLogs(daysOld = 7) {
  try {
    const result = await pool.query(
      `DELETE FROM context_debug_logs 
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING id`,
    );

    const deleted = result.rowCount;
    console.log(`[context-debug] Cleaned up ${deleted} logs older than ${daysOld} days`);
    return deleted;
  } catch (error) {
    console.error('[context-debug] Cleanup failed:', error.message);
    throw error;
  }
}

export default {
  isContextDebugEnabled,
  logContextDebug,
  queryContextDebugLogs,
  cleanupOldDebugLogs,
  GLOBAL_DEBUG_ENABLED,
};
