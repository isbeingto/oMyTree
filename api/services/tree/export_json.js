import { pool } from '../../db/pool.js';
import { HttpError } from '../../lib/errors.js';
import { assertTreeOwnership } from '../../lib/tree_access.js';
import { computeTreeMetricsFromNodes } from './metrics.js';

export async function exportTreeJson({ treeId, userId }) {
  if (!treeId || !userId) {
    throw new HttpError({ status: 422, code: 'INVALID_EXPORT_INPUT', message: 'treeId and userId are required' });
  }

  const client = await pool.connect();
  try {
    const treeRow = await assertTreeOwnership(client, treeId, userId, {
      selectColumns: ['id', 'topic', 'display_title', 'created_at', 'user_id'],
    });

    const { rows: nodes } = await client.query(
      `SELECT id, parent_id, tree_id, role, text, level, created_at, soft_deleted_at
         FROM nodes
        WHERE tree_id = $1
          AND soft_deleted_at IS NULL
        ORDER BY created_at ASC`,
      [treeId]
    );

    // Soft correction: Remove system root if present and reparent children
    const systemRoot = nodes.find(n => !n.parent_id && (n.role === 'system' || n.role === 'topic'));
    let finalNodes = nodes;
    if (systemRoot) {
      finalNodes = nodes.filter(n => n.id !== systemRoot.id);
      finalNodes.forEach(n => {
        if (n.parent_id === systemRoot.id) {
          n.parent_id = null;
        }
      });
    }

    const nodeIds = finalNodes.map((n) => n.id);
    let lensMap = {};
    if (nodeIds.length > 0) {
      const { rows: summaries } = await client.query(
        `SELECT node_id, path_summary, parent_summary
           FROM node_summaries
          WHERE node_id = ANY($1)`,
        [nodeIds]
      );
      lensMap = summaries.reduce((acc, row) => {
        acc[row.node_id] = {
          path_summary: row.path_summary || null,
          parent_summary: row.parent_summary || null,
        };
        return acc;
      }, {});
    }

    const treePayload = {
      version: '1',
      tree: {
        id: treeRow.id,
        name: treeRow.display_title || null,
        topic: treeRow.topic || null,
        created_at: treeRow.created_at ? treeRow.created_at.toISOString() : null,
        updated_at: treeRow.created_at ? treeRow.created_at.toISOString() : null,
        user_id: treeRow.user_id,
      },
      nodes: finalNodes.map((n) => ({
        id: n.id,
        parent_id: n.parent_id,
        role: n.role,
        text: n.text,
        level: n.level,
        created_at: n.created_at ? n.created_at.toISOString() : null,
        updated_at: n.created_at ? n.created_at.toISOString() : null,
        metadata: {},
      })),
      lens: lensMap,
      timeline: {},
      metrics: computeTreeMetricsFromNodes(treeRow, finalNodes),
    };

    return treePayload;
  } finally {
    client.release();
  }
}
