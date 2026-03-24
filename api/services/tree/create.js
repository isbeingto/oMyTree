import { recomputeTreeCounters } from './counters.js';
import { pool } from '../../db/pool.js';

export async function createTreeWithRoot({
  topic_text,
  created_by = 'system',
  dedupe = false,
  user_id = null,
  context_profile = null,
  memory_scope = null,
}) {
  if (typeof topic_text !== 'string' || topic_text.trim().length < 1 || topic_text.length > 256) {
    const e = new Error('INVALID_TOPIC');
    e.status = 422;
    throw e;
  }
  if (!user_id || typeof user_id !== 'string') {
    const e = new Error('MISSING_USER_ID');
    e.status = 422;
    throw e;
  }
  const topic = topic_text.trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (dedupe) {
      const { rows: ex } = await client.query(
        'SELECT id FROM trees WHERE topic=$1 AND created_by=$2 AND user_id = $3 LIMIT 1',
        [topic, created_by, user_id]
      );
      if (ex[0]) {
        const e = new Error('TREE_EXISTS');
        e.status = 409;
        throw e;
      }
    }

    const { rows: trows } = await client.query(
      `INSERT INTO trees(topic, created_by, status, user_id, context_profile, memory_scope)
       VALUES ($1,$2,'active',$3,$4,$5)
       RETURNING id, topic, created_by, status, created_at, user_id, context_profile, memory_scope`,
      [topic, created_by, user_id, context_profile || 'lite', memory_scope || 'branch']
    );
    const tree = trows[0];

    const { rows: nrows } = await client.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'system', $2)
       RETURNING id, tree_id, parent_id, level, role, text, created_at`,
      [tree.id, topic]
    );
    const root = nrows[0];

    await client.query(
      `INSERT INTO events(event_type, tree_id, payload)
       VALUES ('tree.created', $1, jsonb_build_object('topic', $2::text, 'created_by', $3::text))`,
      [tree.id, topic, created_by]
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
      console.warn('[tree/create] ROLLBACK failed:', rollbackErr?.message);
    }
    throw e;
  } finally {
    // Safety net: if BEGIN was executed but neither COMMIT nor ROLLBACK succeeded,
    // ensure we don't return an "idle in transaction" connection to pool
    // Note: We don't track inTransaction here, so we rely on pg's implicit state
    client.release();
  }
}
