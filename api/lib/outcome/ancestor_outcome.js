/**
 * T93-15: Nearest ancestor outcome lookup.
 *
 * Given the main path (root -> anchor), find the closest ancestor node (before anchor)
 * that already has an outcome anchored on it, and return that outcome id.
 */

import { pool } from '../../db/pool.js';

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.treeId
 * @param {string} params.anchorNodeId
 * @param {string[]} params.mainPathNodeIds - Ordered path from root to anchor (inclusive)
 * @param {object} [params.options]
 * @param {import('pg').PoolClient} [params.options.client]
 * @returns {Promise<string|null>} derived_from_outcome_id
 */
export async function findNearestAncestorOutcomeIdForPath({
  userId,
  treeId,
  anchorNodeId,
  mainPathNodeIds,
  options = {},
}) {
  const { client } = options;
  const db = client || pool;

  const safePath = Array.isArray(mainPathNodeIds)
    ? mainPathNodeIds.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
    : [];

  if (!userId || !treeId || !anchorNodeId) return null;
  if (safePath.length === 0) return null;

  const anchorIndex = safePath.lastIndexOf(anchorNodeId);
  if (anchorIndex <= 0) return null;

  // Candidate ancestor nodes are strictly before anchor.
  const candidateNodeIds = safePath.slice(0, anchorIndex);
  if (candidateNodeIds.length === 0) return null;

  const { rows } = await db.query(
    `SELECT id, anchor_node_id
     FROM outcomes
     WHERE user_id = $1
       AND tree_id = $2
       AND anchor_node_id = ANY($3::uuid[])
       AND id IS NOT NULL`,
    [userId, treeId, candidateNodeIds]
  );

  if (!rows || rows.length === 0) return null;

  const indexMap = new Map();
  candidateNodeIds.forEach((id, idx) => indexMap.set(id, idx));

  let bestOutcomeId = null;
  let bestIndex = -1;

  for (const row of rows) {
    const nodeId = row.anchor_node_id;
    const idx = indexMap.get(nodeId);
    if (!Number.isFinite(idx)) continue;
    if (idx > bestIndex) {
      bestIndex = idx;
      bestOutcomeId = row.id;
    }
  }

  return bestOutcomeId;
}

/**
 * Fetch a minimal ancestor outcome payload for report generation.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.treeId
 * @param {string} params.ancestorOutcomeId
 * @param {object} [params.options]
 * @param {import('pg').PoolClient} [params.options.client]
 * @returns {Promise<null|{id:string,title:string|null,conclusion:string|null,anchor_node_id:string,created_at:string}>}
 */
export async function fetchAncestorOutcomeSummary({
  userId,
  treeId,
  ancestorOutcomeId,
  options = {},
}) {
  const { client } = options;
  const db = client || pool;

  if (!userId || !treeId || !ancestorOutcomeId) return null;

  const { rows } = await db.query(
    `SELECT id, title, conclusion, anchor_node_id, created_at
     FROM outcomes
     WHERE id = $1
       AND user_id = $2
       AND tree_id = $3
     LIMIT 1`,
    [ancestorOutcomeId, userId, treeId]
  );

  return rows?.[0] || null;
}
