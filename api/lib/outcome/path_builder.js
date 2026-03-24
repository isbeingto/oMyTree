/**
 * T93-3: Main Path Builder for Layer2 Outcomes
 *
 * Computes the unique path from root to a given anchor node.
 * Replaces the "golden-path" (union of all keyframes) approach with
 * a deterministic single-branch path.
 *
 * SQL behavior:
 * - Recursive CTE from anchor → root via parent_id
 * - Filters out soft_deleted_at nodes
 * - Max depth protection (default 2000)
 * - Output order: root → anchor (ascending level)
 */

import { pool } from '../../db/pool.js';

/**
 * Maximum recursion depth to prevent infinite loops on corrupted data
 */
const MAX_PATH_DEPTH = 2000;

/**
 * Compute the main path from root to anchor node.
 *
 * @param {string} treeId - The tree UUID
 * @param {string} anchorNodeId - The anchor node UUID (path endpoint)
 * @param {object} [options] - Optional configuration
 * @param {import('pg').PoolClient} [options.client] - Existing DB client (for transactions)
 * @param {number} [options.maxDepth=2000] - Maximum recursion depth
 * @returns {Promise<{ nodeIds: string[], nodeMap: Map<string, object> }>}
 *   - nodeIds: Array of node IDs ordered root → anchor
 *   - nodeMap: Map<nodeId, { id, parent_id, level, role, text, created_at }>
 * @throws {Error} If anchor node not found or not in specified tree
 */
export async function computeMainPath(treeId, anchorNodeId, options = {}) {
  const { client, maxDepth = MAX_PATH_DEPTH } = options;
  const db = client || pool;

  const sql = `
    WITH RECURSIVE path AS (
      -- Base case: start from anchor node
      SELECT
        id,
        parent_id,
        tree_id,
        level,
        role,
        text,
        created_at,
        1 AS depth
      FROM nodes
      WHERE id = $2
        AND tree_id = $1
        AND soft_deleted_at IS NULL

      UNION ALL

      -- Recursive case: traverse to parent
      SELECT
        n.id,
        n.parent_id,
        n.tree_id,
        n.level,
        n.role,
        n.text,
        n.created_at,
        p.depth + 1
      FROM nodes n
      JOIN path p ON n.id = p.parent_id
      WHERE n.soft_deleted_at IS NULL
        AND p.depth < $3
    )
    SELECT
      id,
      parent_id,
      level,
      role,
      text,
      created_at,
      depth
    FROM path
    ORDER BY depth DESC;  -- root first (highest depth = furthest from anchor)
  `;

  const { rows } = await db.query(sql, [treeId, anchorNodeId, maxDepth]);

  if (rows.length === 0) {
    throw new Error(`Anchor node ${anchorNodeId} not found in tree ${treeId} or is soft-deleted`);
  }

  // Build ordered node ID array (root → anchor)
  const nodeIds = rows.map((row) => row.id);

  // Build node map for quick lookup
  const nodeMap = new Map();
  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      parent_id: row.parent_id,
      level: row.level,
      role: row.role,
      text: row.text,
      created_at: row.created_at,
    });
  }

  return { nodeIds, nodeMap };
}

/**
 * Identify fork points on the main path.
 *
 * A fork point is a node on the path that has multiple children.
 * This is used for Iteration 3 fork_summary generation.
 *
 * @param {string} treeId - The tree UUID
 * @param {string[]} pathNodeIds - Array of node IDs on the main path
 * @param {object} [options] - Optional configuration
 * @param {import('pg').PoolClient} [options.client] - Existing DB client
 * @returns {Promise<Array<{ nodeId: string, childCount: number, level: number }>>}
 */
export async function getForkPointsOnPath(treeId, pathNodeIds, options = {}) {
  if (!pathNodeIds || pathNodeIds.length === 0) {
    return [];
  }

  const { client } = options;
  const db = client || pool;

  const sql = `
    SELECT
      n.parent_id AS node_id,
      COUNT(*) AS child_count,
      p.level
    FROM nodes n
    JOIN nodes p ON p.id = n.parent_id
    WHERE n.tree_id = $1
      AND n.parent_id = ANY($2::uuid[])
      AND n.soft_deleted_at IS NULL
    GROUP BY n.parent_id, p.level
    HAVING COUNT(*) > 1
    ORDER BY p.level ASC;
  `;

  const { rows } = await db.query(sql, [treeId, pathNodeIds]);

  return rows.map((row) => ({
    nodeId: row.node_id,
    childCount: parseInt(row.child_count, 10),
    level: row.level,
  }));
}

export default {
  computeMainPath,
  getForkPointsOnPath,
  MAX_PATH_DEPTH,
};
