import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';
import { assertTreeOwnership } from '../../lib/tree_access.js';

function computeMetrics(treeRow, nodes) {
  const metrics = {
    version: 'v1',
    tree_id: treeRow.id,
    node_count: 0,
    depth_max: 0,
    branch_node_count: 0,
    user_question_count: 0,
    ai_answer_count: 0,
    created_at: treeRow.created_at ? treeRow.created_at.toISOString() : null,
    updated_at: treeRow.created_at ? treeRow.created_at.toISOString() : null,
  };

  if (!nodes || nodes.length === 0) {
    return metrics;
  }

  // Soft correction: Remove system root if present
  const systemRoot = nodes.find(n => !n.parent_id && (n.role === 'system' || n.role === 'topic'));
  let effectiveNodes = nodes;
  let levelOffset = 0;

  if (systemRoot) {
    effectiveNodes = nodes.filter(n => n.id !== systemRoot.id);
    // If system root existed, we assume it was level 0 and children were level 1.
    // We want children to be treated as level 0 (root).
    levelOffset = 1;
  }

  metrics.node_count = effectiveNodes.length;
  const childrenCounts = new Map();
  let maxDepth = 0;
  let maxTimestamp = 0;
  
  effectiveNodes.forEach((n) => {
    let level = typeof n.level === 'number' ? n.level : 0;
    if (levelOffset > 0) {
      level = Math.max(0, level - levelOffset);
    }
    
    if (level > maxDepth) maxDepth = level;
    
    // For branching, we need to check parent_id.
    // If parent was system root, it's now null (conceptually).
    // But here we just count children per parent.
    // If n.parent_id was systemRoot.id, we ignore it for branching count of system root (which is removed).
    // But we need to count children of THIS node.
    // n.parent_id refers to its parent.
    
    if (n.parent_id && (!systemRoot || n.parent_id !== systemRoot.id)) {
      childrenCounts.set(n.parent_id, (childrenCounts.get(n.parent_id) || 0) + 1);
    }
    
    const created = n.created_at instanceof Date ? n.created_at.getTime() : new Date(n.created_at || 0).getTime();
    if (Number.isFinite(created) && created > maxTimestamp) {
      maxTimestamp = created;
    }
    if (n.role === 'user') metrics.user_question_count += 1;
    if (n.role === 'ai' || n.role === 'assistant') metrics.ai_answer_count += 1;
  });

  metrics.depth_max = maxDepth;
  metrics.branch_node_count = Array.from(childrenCounts.values()).filter((count) => count >= 2).length;
  if (maxTimestamp > 0) {
    metrics.updated_at = new Date(maxTimestamp).toISOString();
  }

  return metrics;
}

export async function getTreeMetrics({ treeId, userId }) {
  if (!treeId || !userId) {
    throw new HttpError({ status: 422, code: 'INVALID_METRICS_INPUT', message: 'treeId and userId are required' });
  }

  const client = await pool.connect();
  try {
    const treeRow = await assertTreeOwnership(client, treeId, userId, {
      selectColumns: ['id', 'topic', 'display_title', 'created_at'],
    });

    const { rows: nodes } = await client.query(
      `SELECT id, parent_id, role, level, created_at
         FROM nodes
        WHERE tree_id = $1
          AND soft_deleted_at IS NULL`,
      [treeId]
    );

    return computeMetrics(treeRow, nodes);
  } finally {
    client.release();
  }
}

export { computeMetrics as computeTreeMetricsFromNodes };
