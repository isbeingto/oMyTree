import { recomputeTreeCounters } from './counters.js';
import { pool } from '../../db/pool.js';

export async function forkTreeFromNode({ node_id, created_by = 'system', dedupe = false }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 读取源节点（过滤软删）
    const { rows: srcRows } = await client.query(
      `SELECT n.id, n.text, n.tree_id
       FROM nodes n
       WHERE n.id = $1 AND n.soft_deleted_at IS NULL
       LIMIT 1`, [node_id]
    );
    const src = srcRows[0];
    if (!src) {
      const e = new Error('NODE_NOT_FOUND');
      e.status = 404;
      throw e;
    }
    const topic = (src.text || '').trim();
    if (!topic) {
      const e = new Error('EMPTY_TOPIC');
      e.status = 422;
      throw e;
    }

    // 2) 幂等判重（同创建者+同主题可选阻断）
    if (dedupe) {
      const { rows: ex } = await client.query(
        `SELECT id FROM trees WHERE topic=$1 AND created_by=$2 LIMIT 1`,
        [topic, created_by]
      );
      if (ex[0]) {
        const e = new Error('TREE_EXISTS');
        e.status = 409;
        throw e;
      }
    }

    // 3) 创建新树 + 根节点（root.text = 源节点 text）
    const { rows: trows } = await client.query(
      `INSERT INTO trees(topic, created_by, status)
       VALUES ($1,$2,'active')
       RETURNING id, topic, created_by, status, created_at`,
      [topic, created_by]
    );
    const tree = trows[0];

    const { rows: nrows } = await client.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'system', $2)
       RETURNING id, tree_id, parent_id, level, role, text, created_at`,
      [tree.id, topic]
    );
    const root = nrows[0];

    // 4) 事件
    await client.query(
      `INSERT INTO events(event_type, tree_id, payload)
       VALUES ('tree.forked', $1,
         jsonb_build_object(
           'new_tree_id', $1::uuid,
           'source_tree_id', $2::uuid,
           'anchor_node_id', $3::uuid,
           'source_node_id', $3::uuid,
           'topic', $4::text,
           'created_by', $5::text
         )
       )`,
      [tree.id, src.tree_id, src.id, topic, created_by]
    );
    await client.query(
      `INSERT INTO events(event_type, tree_id, node_id, payload)
       VALUES ('node.created', $1, $2, jsonb_build_object('role', 'system'::text, 'level', 0::integer))`,
      [tree.id, root.id]
    );

    await recomputeTreeCounters(client, tree.id);
    await client.query('COMMIT');
    return { tree, root };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('[tree/fork] ROLLBACK failed:', rollbackErr?.message);
    }
    throw e;
  } finally {
    client.release();
  }
}
