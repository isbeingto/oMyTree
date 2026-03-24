import { pool } from '../../db/pool.js';

/**
 * 获取节点的局部片段视图（单次SQL）
 * 
 * @param {string} nodeId - 节点ID
 * @param {Object} options
 * @param {boolean} options.includeDeleted - 是否包含软删除的节点（默认false）
 * @returns {Promise<Object>} 局部视图数据
 */
async function getNodeLocal(nodeId, { includeDeleted = false, userId = null } = {}) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
  const traceId = `local-${Date.now()}`;
  
  const sql = `
    WITH RECURSIVE authorized_tree AS (
      SELECT tree_id
      FROM nodes n
      JOIN trees t ON t.id = n.tree_id
      WHERE n.id = $1
        AND t.user_id = $2
      LIMIT 1
    ),
    path_cte AS (
      -- 获取当前节点
      SELECT id, tree_id, parent_id, level, role, text, soft_deleted_at, created_at, 
             ARRAY[id] as path
      FROM nodes
      WHERE id = $1 ${includeDeleted ? '' : 'AND soft_deleted_at IS NULL'}
        AND tree_id = (SELECT tree_id FROM authorized_tree)
      
      UNION ALL
      
      -- 递归向上找父节点（路径）
      SELECT n.id, n.tree_id, n.parent_id, n.level, n.role, n.text, n.soft_deleted_at, n.created_at,
             p.path || n.id
      FROM nodes n
      INNER JOIN path_cte p ON n.id = p.parent_id
      WHERE ${includeDeleted ? 'true' : 'n.soft_deleted_at IS NULL'}
        AND array_length(p.path, 1) < 64  -- 安全限制
    ),
    current_node AS (
      -- 获取当前节点信息
      SELECT id, tree_id, parent_id, level, role, text, soft_deleted_at, created_at
      FROM nodes
      WHERE id = $1 ${includeDeleted ? '' : 'AND soft_deleted_at IS NULL'}
        AND tree_id = (SELECT tree_id FROM authorized_tree)
      LIMIT 1
    ),
    parent_node AS (
      -- 获取父节点信息
      SELECT id, role, text
      FROM nodes n
      WHERE n.id = (SELECT parent_id FROM current_node WHERE parent_id IS NOT NULL LIMIT 1)
        ${includeDeleted ? '' : 'AND n.soft_deleted_at IS NULL'}
      LIMIT 1
    ),
    turn_info AS (
      -- 获取与该node相关的turn（当role为'user'时）
      SELECT t.id, t.status, t.usage_json
      FROM turns t
      WHERE t.node_id = $1
        ${includeDeleted ? '' : 'AND t.soft_deleted_at IS NULL'}
      LIMIT 1
    ),
    ai_node AS (
      -- 获取该user节点的AI回复节点（同一turn中）
      SELECT n.id, n.role, n.text, n.created_at
      FROM nodes n
      WHERE n.parent_id = $1 
        AND n.role = 'ai'
        ${includeDeleted ? '' : 'AND n.soft_deleted_at IS NULL'}
      ORDER BY n.created_at ASC
      LIMIT 1
    ),
    children AS (
      -- 获取当前节点的所有子节点（不通过turns，直接从nodes枚举）
      SELECT id, role, level, text, created_at
      FROM nodes
      WHERE parent_id = $1
        ${includeDeleted ? '' : 'AND soft_deleted_at IS NULL'}
      ORDER BY created_at ASC
      LIMIT 64
    ),
    path_ids_cte AS (
      -- 获取从root到当前节点的path
      SELECT ARRAY_AGG(id ORDER BY path_length DESC) as path_array
      FROM (
        SELECT id, array_length(path, 1) as path_length
        FROM path_cte 
        WHERE ${includeDeleted ? 'true' : 'soft_deleted_at IS NULL'}
      ) sub
    ),
    path_titles_cte AS (
      -- 获取路径上各节点的标题（取text的前24字符）
      SELECT ARRAY_AGG(
        COALESCE(SUBSTRING(text, 1, 24), 'untitled')
        ORDER BY path_length DESC
      ) as titles_array
      FROM (
        SELECT text, array_length(path, 1) as path_length
        FROM path_cte 
        WHERE ${includeDeleted ? 'true' : 'soft_deleted_at IS NULL'}
      ) sub
    ),
    siblings AS (
      -- 获取所有同级节点（兄弟节点，含当前节点）
      SELECT 
  n.id,
  n.role,
  SUBSTRING(n.text, 1, 280) AS title,
  n.created_at,
  COALESCE(ns.updated_at, n.created_at) AS updated_at,
  COALESCE(ai_data.has_ai, false) AS has_ai,
  COALESCE(ai_data.ai_preview, '') AS ai_preview,
  ns.path_summary,
  ns.parent_summary
      FROM nodes n
      LEFT JOIN node_summaries ns ON ns.node_id = n.id
      LEFT JOIN LATERAL (
        SELECT 
          true AS has_ai,
          LEFT(REGEXP_REPLACE(child.text, E'[\\r\\n]+', ' ', 'g'), 280) AS ai_preview
        FROM nodes child
        WHERE child.parent_id = n.id
          AND child.role = 'ai'
          ${includeDeleted ? '' : 'AND child.soft_deleted_at IS NULL'}
        ORDER BY child.created_at ASC
        LIMIT 1
      ) AS ai_data ON true
      WHERE n.parent_id IS NOT DISTINCT FROM (SELECT parent_id FROM current_node LIMIT 1)
        AND n.tree_id = (SELECT tree_id FROM current_node LIMIT 1)
        AND n.id != $1
        ${includeDeleted ? '' : 'AND n.soft_deleted_at IS NULL'}
      ORDER BY n.created_at DESC
      LIMIT 20
    )
    SELECT 
      (SELECT ROW_TO_JSON(current_node) FROM current_node) as node_data,
      (SELECT ROW_TO_JSON(parent_node) FROM parent_node) as parent_data,
      (SELECT ROW_TO_JSON(turn_info) FROM turn_info) as turn_data,
      (SELECT ROW_TO_JSON(ai_node) FROM ai_node) as ai_reply_data,
      (SELECT path_array FROM path_ids_cte) as path_ids,
      (SELECT titles_array FROM path_titles_cte) as path_titles,
      (SELECT COALESCE(JSON_AGG(ROW_TO_JSON(siblings)), '[]'::json) FROM siblings) as siblings_json,
      (SELECT COALESCE(JSON_AGG(ROW_TO_JSON(children)), '[]'::json) FROM children) as children_json
  `;

  try {
    const { rows } = await pool.query(sql, [nodeId, userId]);
    
    if (!rows[0] || !rows[0].node_data) {
      return null;  // 节点不存在或被软删除
    }

    const result = rows[0];
    
    return {
      node: result.node_data,
      parent: result.parent_data || null,
      turn: result.turn_data
        ? {
            ...result.turn_data,
            ai_pending: result.turn_data.status === 'pending',
          }
        : null,
      ai_reply: result.ai_reply_data || null,
      path_ids: result.path_ids || [],
      path_titles: result.path_titles || [],
      siblings_summary: result.siblings_json || [],
      children: result.children_json || []  // 确保返回数组，非null
    };
  } catch (error) {
    console.error('[LocalService] Query error:', error);
    throw error;
  }
}

export { getNodeLocal };
