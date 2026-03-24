import { pool } from '../../db/pool.js';

async function getRootNodeByTreeId(treeId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.created_at
     FROM nodes n WHERE n.tree_id=$1 AND n.parent_id IS NULL AND n.level=0
     LIMIT 1`, [treeId]
  );
  return rows[0] || null;
}

export { getRootNodeByTreeId };
