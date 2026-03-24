import { pool } from '../../db/pool.js';

function ensureId(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw Object.assign(new Error(`${name} is required`), { code: `INVALID_${name.toUpperCase()}` });
  }
  return value.trim();
}

/**
 * Load latest branch summary row for (tree_id, branch_id).
 * @param {string} treeId
 * @param {string} branchId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<{
 *  summary: any,
 *  summary_text: string,
 *  node_count: number,
 *  total_tokens: number,
 *  updated_at: string,
 *  summarized_at: string,
 * } | null>}
 */
export async function getBranchSummary(treeId, branchId, client = pool) {
  const tree_id = ensureId('tree_id', treeId);
  const branch_id = ensureId('branch_id', branchId);
  const { rows } = await client.query(
    `
      SELECT summary, summary_text, node_count, total_tokens, updated_at, summarized_at
      FROM branch_summaries
      WHERE tree_id = $1 AND branch_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [tree_id, branch_id]
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0] || {};
  return {
    summary: row.summary ?? null,
    summary_text: typeof row.summary_text === 'string' ? row.summary_text : '',
    node_count: Number(row.node_count || 0) || 0,
    total_tokens: Number(row.total_tokens || 0) || 0,
    updated_at: row.updated_at ? String(row.updated_at) : '',
    summarized_at: row.summarized_at ? String(row.summarized_at) : '',
  };
}

/**
 * Upsert branch summary row (tree_id, branch_id).
 * @param {object} params
 * @param {string} params.treeId
 * @param {string} params.branchId
 * @param {string} params.branchRootNodeId
 * @param {string} params.branchTipNodeId
 * @param {any} params.summary
 * @param {string} params.summaryText
 * @param {number} params.nodeCount
 * @param {number} params.totalTokens
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<void>}
 */
export async function upsertBranchSummary(
  {
    treeId,
    branchId,
    branchRootNodeId,
    branchTipNodeId,
    summary,
    summaryText,
    nodeCount,
    totalTokens,
  },
  client = pool
) {
  const tree_id = ensureId('tree_id', treeId);
  const branch_id = ensureId('branch_id', branchId);
  const branch_root_node_id = ensureId('branch_root_node_id', branchRootNodeId);
  const branch_tip_node_id = ensureId('branch_tip_node_id', branchTipNodeId);
  const node_count = Math.max(0, Number(nodeCount || 0) || 0);
  const total_tokens = Math.max(0, Number(totalTokens || 0) || 0);
  const summary_text = typeof summaryText === 'string' ? summaryText : '';

  await client.query(
    `
      INSERT INTO branch_summaries (
        tree_id, branch_id, branch_root_node_id, branch_tip_node_id,
        summary, summary_text, node_count, total_tokens,
        created_at, updated_at, summarized_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        NOW(), NOW(), NOW()
      )
      ON CONFLICT (tree_id, branch_id)
      DO UPDATE SET
        branch_root_node_id = EXCLUDED.branch_root_node_id,
        branch_tip_node_id = EXCLUDED.branch_tip_node_id,
        summary = EXCLUDED.summary,
        summary_text = EXCLUDED.summary_text,
        node_count = EXCLUDED.node_count,
        total_tokens = EXCLUDED.total_tokens,
        updated_at = NOW(),
        summarized_at = NOW()
    `,
    [
      tree_id,
      branch_id,
      branch_root_node_id,
      branch_tip_node_id,
      summary,
      summary_text,
      node_count,
      total_tokens,
    ]
  );
}

export default {
  getBranchSummary,
  upsertBranchSummary,
};

