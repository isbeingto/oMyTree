import { recomputeTreeCounters } from '../tree/counters.js';
import { pool } from '../../db/pool.js';

async function getNodeById(id, { includeDeleted = false, userId = null } = {}) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
  const sql = `
    SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.soft_deleted_at, n.created_at
    FROM nodes n
    JOIN trees t ON t.id = n.tree_id
    WHERE n.id = $1
      AND t.user_id = $2
      ${includeDeleted ? '' : 'AND n.soft_deleted_at IS NULL'}
    LIMIT 1`;
  const { rows } = await pool.query(sql, [id, userId]);
  return rows[0] || null;
}

async function updateNodeText(id, newText, { who, why, trace_id, userId = null }) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE nodes AS n
          SET text=$2
       FROM trees t
       WHERE n.id=$1
         AND n.soft_deleted_at IS NULL
         AND t.id = n.tree_id
         AND t.user_id = $3
       RETURNING n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.soft_deleted_at, n.created_at`,
      [id, newText, userId]
    );
    const node = rows[0] || null;
    if (!node) { 
      await client.query('ROLLBACK'); 
      return null; 
    }
    await client.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
       VALUES ('node.updated', $1, $2, $3, COALESCE($4, uuid_generate_v4()))`,
      [node.tree_id, node.id, JSON.stringify({ who, why }), trace_id || null]
    );
    await client.query('COMMIT');
    return node;
  } catch (e) { 
    try {
      await client.query('ROLLBACK'); 
    } catch (rollbackErr) {
      console.warn('[node/repo.updateNodeText] ROLLBACK failed:', rollbackErr?.message);
    }
    throw e; 
  } finally { 
    client.release(); 
  }
}

async function softDeleteNode(id, { who, why, trace_id, userId = null }) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE nodes AS n
          SET soft_deleted_at = now()
       FROM trees t
       WHERE n.id=$1
         AND n.soft_deleted_at IS NULL
         AND t.id = n.tree_id
         AND t.user_id = $2
       RETURNING n.id, n.tree_id`, 
      [id, userId]
    );
    const row = rows[0] || null;
    if (!row) { 
      await client.query('ROLLBACK'); 
      return false; 
    }
    const payload = {
      who: who ?? null,
      why: why ?? null,
      deleted_by: who ?? null,
      reason: why ?? null,
    };
    await client.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
       VALUES ('node.soft_deleted', $1, $2, $3, COALESCE($4, uuid_generate_v4()))`,
      [row.tree_id, row.id, JSON.stringify(payload), trace_id || null]
    );
    await recomputeTreeCounters(client, row.tree_id);
    await client.query('COMMIT');
    return true;
  } catch (e) { 
    try {
      await client.query('ROLLBACK'); 
    } catch (rollbackErr) {
      console.warn('[node/repo.softDeleteNode] ROLLBACK failed:', rollbackErr?.message);
    }
    throw e; 
  } finally { 
    client.release(); 
  }
}

export { getNodeById, updateNodeText, softDeleteNode };
