import { pool } from '../../db/pool.js';

function ensureNodeId(nodeId) {
  if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
    throw Object.assign(new Error('node_id is required'), { code: 'INVALID_NODE_ID' });
  }
  return nodeId.trim();
}

/**
 * Load rolling_summary JSONB for a node.
 * @param {string} nodeId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export async function getRollingSummary(nodeId, client = pool) {
  const id = ensureNodeId(nodeId);
  const { rows } = await client.query(
    `SELECT rolling_summary
       FROM node_summaries
      WHERE node_id = $1
      LIMIT 1`,
    [id]
  );
  return rows[0]?.rolling_summary ?? null;
}

/**
 * Upsert rolling_summary JSONB for a node.
 * - Does not touch path_summary/parent_summary/updated_by/lens_text.
 * - Touches updated_at to reflect that node_summaries row has changed.
 * @param {string} nodeId
 * @param {object|null} rollingSummary
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export async function saveRollingSummary(nodeId, rollingSummary, client = pool) {
  const id = ensureNodeId(nodeId);
  const { rows } = await client.query(
    `INSERT INTO node_summaries (node_id, rolling_summary, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (node_id)
     DO UPDATE SET
       rolling_summary = EXCLUDED.rolling_summary,
       updated_at = NOW()
     RETURNING rolling_summary`,
    [id, rollingSummary]
  );
  return rows[0]?.rolling_summary ?? null;
}

export default {
  getRollingSummary,
  saveRollingSummary,
};

