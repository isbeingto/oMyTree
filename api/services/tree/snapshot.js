import { pool } from '../../db/pool.js';

async function getTreeSnapshot(treeId, maxDepth = 6, maxNodes = 512) {
  // 参数限额校验
  if (maxDepth > 6 || maxNodes > 512) {
    const err = new Error('LIMIT_EXCEEDED');
    err.status = 422;
    throw err;
  }

  // 先检查节点数量
  const countResult = await pool.query(
    'SELECT COUNT(*) as count FROM nodes WHERE tree_id = $1',
    [treeId]
  );
  const nodeCount = parseInt(countResult.rows[0].count, 10);
  
  if (nodeCount > maxNodes) {
    const err = new Error('LIMIT_EXCEEDED');
    err.status = 422;
    throw err;
  }

  // 递归查询所有节点
  const sql = `
    WITH RECURSIVE node_cte AS (
      SELECT id, tree_id, parent_id, level, role, text, created_at
      FROM nodes WHERE tree_id=$1 AND parent_id IS NULL AND soft_deleted_at IS NULL
      UNION ALL
      SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.created_at
      FROM nodes n 
      JOIN node_cte c ON n.parent_id = c.id
      WHERE n.level <= $2 AND n.soft_deleted_at IS NULL
    )
    SELECT id, parent_id, level, role, text
    FROM node_cte
    ORDER BY level, created_at;
  `;
  
  const { rows } = await pool.query(sql, [treeId, maxDepth]);
  
  if (rows.length === 0) {
    return null;
  }

  // 构建层级结构
  const map = new Map(rows.map(n => [n.id, { ...n, children: [] }]));
  let root = null;
  
  for (const node of map.values()) {
    if (!node.parent_id) {
      root = node;
    } else {
      const parent = map.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
      }
    }
  }
  
  return root;
}

async function getTreeInfo(treeId) {
  const { rows } = await pool.query(
    'SELECT id, topic, created_by, status, context_profile, memory_scope FROM trees WHERE id = $1',
    [treeId]
  );
  return rows[0] || null;
}

export { getTreeSnapshot, getTreeInfo };
