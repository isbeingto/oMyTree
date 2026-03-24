import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createTurn } from '../services/turn/create.js';
import { Intent } from '../services/llm/intent_classifier.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'omytree',
});

beforeAll(async () => {
  await pool.query('ALTER TABLE turns ADD COLUMN IF NOT EXISTS intent TEXT NULL');
  await pool.query('ALTER TABLE nodes ADD COLUMN IF NOT EXISTS topic_tag TEXT NULL');
});

afterAll(async () => {
  await pool.end();
});

describe('createTurn intent persistence', () => {
  it('stores classified intent on the turn record', async () => {
    const userRes = await pool.query(
      `INSERT INTO users (name, email, enable_advanced_context, preferred_llm_provider)
       VALUES ($1, $2, true, 'openai')
       RETURNING id`,
      ['IntentUser', `intent+${Date.now()}@example.com`]
    );
    const userId = userRes.rows[0].id;

    const treeRes = await pool.query(
      `INSERT INTO trees (topic, created_by, status, user_id, context_profile, memory_scope)
       VALUES ('Intent Tree', 'tester', 'active', $1, 'lite', 'branch')
       RETURNING id`,
      [userId]
    );
    const treeId = treeRes.rows[0].id;

    const nodeRes = await pool.query(
      `INSERT INTO nodes (tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'user', 'root node')
       RETURNING id`,
      [treeId]
    );
    const parentId = nodeRes.rows[0].id;

    try {
      const result = await createTurn({
        tree_id: treeId,
        node_id: parentId,
        user_text: '谢谢你的帮助！',
        user_id: userId,
        with_ai: false,
      });

      expect(result.turn.intent).toBe(Intent.THANKS);

      const turnRow = await pool.query('SELECT intent FROM turns WHERE id = $1', [result.turn.id]);
      expect(turnRow.rows[0].intent).toBe(Intent.THANKS);
    } finally {
      await pool.query('DELETE FROM events WHERE tree_id = $1', [treeId]);
      await pool.query('DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)', [treeId]);
      await pool.query('DELETE FROM nodes WHERE tree_id = $1', [treeId]);
      await pool.query('DELETE FROM trees WHERE id = $1', [treeId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });
});
