/**
 * T93-3: Keyframes on Path Collector for Layer2 Outcomes
 *
 * Fetches keyframes that exist on a given main path (set of node IDs).
 * Used as "skeleton" input for outcome report generation.
 *
 * Reuses the keyframes table structure but filters to path nodes only.
 */

import { pool } from '../../db/pool.js';

/**
 * Fetch keyframes that are on the specified path nodes.
 *
 * Returns keyframes with full turn context (user_text, ai_text, annotation)
 * similar to trail's getKeyframesQuery but filtered to path nodes.
 *
 * @param {string} userId - The user UUID (keyframes are per-user)
 * @param {string} treeId - The tree UUID
 * @param {string[]} pathNodeIds - Array of node IDs on the main path
 * @param {object} [options] - Optional configuration
 * @param {import('pg').PoolClient} [options.client] - Existing DB client
 * @returns {Promise<Array<object>>} Array of keyframe objects with turn context
 */
export async function getKeyframesOnPath(userId, treeId, pathNodeIds, options = {}) {
  if (!pathNodeIds || pathNodeIds.length === 0) {
    return [];
  }

  const { client } = options;
  const db = client || pool;

  // Query similar to trail's getKeyframesQuery but filtered to path nodes
  const sql = `
    SELECT
      k.id AS keyframe_id,
      k.tree_id,
      k.node_id,
      k.annotation,
      k.created_at AS keyframe_created_at,
      k.is_pinned,
      n.role AS node_role,
      n.text AS node_text,
      n.level AS node_level,
      n.reasoning_content,
      n.thought_signature,
      n.created_at AS node_created_at,
      t.id AS turn_id,
      t.user_text,
      t.ai_text,
      t.intent
    FROM keyframes k
    JOIN nodes n ON n.id = k.node_id
    LEFT JOIN turns t ON t.node_id = (
      CASE WHEN n.role = 'user' THEN n.id ELSE n.parent_id END
    )
    WHERE k.user_id = $1
      AND k.tree_id = $2
      AND k.node_id = ANY($3::uuid[])
      AND n.soft_deleted_at IS NULL
    ORDER BY n.level ASC, n.created_at ASC, k.id ASC;
  `;

  const { rows } = await db.query(sql, [userId, treeId, pathNodeIds]);

  return rows.map((row) => ({
    keyframeId: row.keyframe_id,
    treeId: row.tree_id,
    nodeId: row.node_id,
    annotation: row.annotation,
    keyframeCreatedAt: row.keyframe_created_at,
    isPinned: row.is_pinned,
    nodeRole: row.node_role,
    nodeText: row.node_text,
    nodeLevel: row.node_level,
    hasReasoning: Boolean(row.reasoning_content || row.thought_signature),
    nodeCreatedAt: row.node_created_at,
    turnId: row.turn_id,
    userText: row.user_text,
    aiText: row.ai_text,
    intent: row.intent,
  }));
}

/**
 * Get keyframe node IDs only (for highlight purposes).
 *
 * @param {string} userId - The user UUID
 * @param {string} treeId - The tree UUID
 * @param {string[]} pathNodeIds - Array of node IDs on the main path
 * @param {object} [options] - Optional configuration
 * @param {import('pg').PoolClient} [options.client] - Existing DB client
 * @returns {Promise<string[]>} Array of node IDs that have keyframes
 */
export async function getKeyframeNodeIdsOnPath(userId, treeId, pathNodeIds, options = {}) {
  if (!pathNodeIds || pathNodeIds.length === 0) {
    return [];
  }

  const { client } = options;
  const db = client || pool;

  const sql = `
    SELECT DISTINCT k.node_id
    FROM keyframes k
    JOIN nodes n ON n.id = k.node_id
    WHERE k.user_id = $1
      AND k.tree_id = $2
      AND k.node_id = ANY($3::uuid[])
      AND n.soft_deleted_at IS NULL
    ORDER BY k.node_id;
  `;

  const { rows } = await db.query(sql, [userId, treeId, pathNodeIds]);

  return rows.map((row) => row.node_id);
}

/**
 * Check if there are any keyframes on the given path.
 *
 * @param {string} userId - The user UUID
 * @param {string} treeId - The tree UUID
 * @param {string[]} pathNodeIds - Array of node IDs on the main path
 * @param {object} [options] - Optional configuration
 * @param {import('pg').PoolClient} [options.client] - Existing DB client
 * @returns {Promise<boolean>} True if at least one keyframe exists on path
 */
export async function hasKeyframesOnPath(userId, treeId, pathNodeIds, options = {}) {
  if (!pathNodeIds || pathNodeIds.length === 0) {
    return false;
  }

  const { client } = options;
  const db = client || pool;

  const sql = `
    SELECT EXISTS (
      SELECT 1
      FROM keyframes k
      JOIN nodes n ON n.id = k.node_id
      WHERE k.user_id = $1
        AND k.tree_id = $2
        AND k.node_id = ANY($3::uuid[])
        AND n.soft_deleted_at IS NULL
      LIMIT 1
    ) AS has_keyframes;
  `;

  const { rows } = await db.query(sql, [userId, treeId, pathNodeIds]);

  return rows[0]?.has_keyframes === true;
}

export default {
  getKeyframesOnPath,
  getKeyframeNodeIdsOnPath,
  hasKeyframesOnPath,
};
