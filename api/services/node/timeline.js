import { pool } from '../../db/pool.js';

const TITLE_EXPR = "LEFT(TRIM(BOTH FROM split_part(COALESCE(text, ''), E'\\n', 1)), 80)";

/**
 * 获取节点时间回放：主干（root→current）和直系（当前子节点）
 * @param {string} nodeId
 * @param {{ limit: number, order: 'asc' | 'desc' }} options
 * @returns {Promise<{ trunk: any[], direct: any[] } | null>}
 */
export async function getNodeTimeline(nodeId, { limit, order, userId = null }) {
  if (!userId) {
    throw Object.assign(new Error('user_id is required'), { status: 422, code: 'INVALID_USER_ID' });
  }
  const direction = order === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    WITH RECURSIVE authorized_tree AS (
      SELECT tree_id
      FROM nodes n
      JOIN trees t ON t.id = n.tree_id
      WHERE n.id = $1 AND t.user_id = $3
      LIMIT 1
    ),
    path AS (
      SELECT
        n.id,
        n.parent_id,
        n.role,
        n.created_at,
        ${TITLE_EXPR} AS title,
        1 AS depth
      FROM nodes n
      WHERE n.id = $1
        AND n.soft_deleted_at IS NULL
        AND n.tree_id = (SELECT tree_id FROM authorized_tree)

      UNION ALL

      SELECT
        p2.id,
        p2.parent_id,
        p2.role,
        p2.created_at,
        ${TITLE_EXPR.replace(/text/g, 'p2.text')} AS title,
        path.depth + 1 AS depth
      FROM nodes p2
      INNER JOIN path ON path.parent_id = p2.id
      WHERE p2.soft_deleted_at IS NULL
        AND path.depth < 96
    ),
    trunk_rows AS (
      SELECT id, role, created_at, title
      FROM path
    ),
    direct_rows AS (
      SELECT
        c.id,
        c.role,
        c.created_at,
        ${TITLE_EXPR.replace(/text/g, 'c.text')} AS title
      FROM nodes c
      JOIN trees t ON t.id = c.tree_id
      WHERE c.parent_id = $1
        AND c.soft_deleted_at IS NULL
        AND t.user_id = $3
      ORDER BY c.created_at ${direction}
      LIMIT $2
    )
    SELECT
      (SELECT COUNT(*) FROM trunk_rows) AS trunk_count,
      COALESCE(
        (SELECT json_agg(
            json_build_object(
              'id', id,
              'role', role,
              'title', title,
              'created_at', created_at,
              'kind', 'trunk'
            )
            ORDER BY created_at ASC
          )
         FROM trunk_rows),
        '[]'::json
      ) AS trunk,
      COALESCE(
        (SELECT json_agg(
            json_build_object(
              'id', id,
              'role', role,
              'title', title,
              'created_at', created_at,
              'kind', 'direct'
            )
            ORDER BY created_at ${direction}
          )
         FROM direct_rows),
        '[]'::json
      ) AS direct
  `;

  const { rows } = await pool.query(sql, [nodeId, limit, userId]);
  const row = rows[0];

  if (!row || Number(row.trunk_count) === 0) {
    return null;
  }

  return {
    trunk: Array.isArray(row.trunk) ? row.trunk : [],
    direct: Array.isArray(row.direct) ? row.direct : []
  };
}
