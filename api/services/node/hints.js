import { pool } from '../../db/pool.js';

const HINT_TITLE_LIMIT = 80;

function normalizeTitle(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= HINT_TITLE_LIMIT) {
    return trimmed;
  }
  return trimmed.slice(0, HINT_TITLE_LIMIT);
}

export async function getNodeHint(nodeId, userId) {
  if (!userId) {
    const error = { code: 'INVALID_USER_ID', status: 422, message: 'user_id is required' };
    throw error;
  }
  const client = await pool.connect();
  try {
    const parentRes = await client.query(
      `SELECT n.id FROM nodes n
       JOIN trees t ON t.id = n.tree_id
       WHERE n.id = $1 AND n.soft_deleted_at IS NULL AND t.user_id = $2
       LIMIT 1`,
      [nodeId, userId]
    );

    if (parentRes.rows.length === 0) {
      const deletedCheck = await client.query(
        `SELECT n.id
         FROM nodes n
         JOIN trees t ON t.id = n.tree_id
         WHERE n.id = $1 AND t.user_id = $2
         LIMIT 1`,
        [nodeId, userId]
      );
      const error = deletedCheck.rows.length === 0
        ? { code: 'NODE_NOT_FOUND', status: 404, message: 'Node not found' }
        : { code: 'NODE_NOT_FOUND', status: 404, message: 'Node has been deleted' };
      throw error;
    }

    const { rows } = await client.query(
      `
      SELECT child.id, child.parent_id, child.text, child.created_at
      FROM nodes child
      JOIN trees t ON t.id = child.tree_id
      WHERE child.parent_id = $1
        AND child.role = 'user'
        AND child.soft_deleted_at IS NULL
        AND t.user_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM nodes grandchild
          WHERE grandchild.parent_id = child.id
            AND grandchild.soft_deleted_at IS NULL
        )
      ORDER BY child.created_at DESC
      LIMIT 1
      `,
      [nodeId, userId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const title = normalizeTitle(row.text);
    if (!title) {
      return null;
    }

    return {
      node_id: row.id,
      parent_id: row.parent_id,
      title,
      created_at: row.created_at
    };
  } finally {
    client.release();
  }
}
