import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { exportTreeMarkdown } from '../services/tree/export_markdown.js';
import { HttpError } from '../lib/errors.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `md+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Markdown User', email],
  );
  return res.rows[0].id;
}

async function createTreeFixture(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id, topic, user_id, created_at`,
    ['md-topic', userId],
  );
  const tree = treeRes.rows[0];
  const systemRoot = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'system', 'system root') RETURNING *`,
    [tree.id],
  );
  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 1, 'user', 'root q') RETURNING *`,
    [tree.id, systemRoot.rows[0].id],
  );
  await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 2, 'ai', 'root a')`,
    [tree.id, rootRes.rows[0].id],
  );
  return { tree, root: rootRes.rows[0] };
}

async function cleanupTree(treeId, userId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('exportTreeMarkdown', () => {
  let userId;
  let tree;

  beforeEach(async () => {
    userId = await createUser();
    const setup = await createTreeFixture(userId);
    tree = setup.tree;
  });

  afterEach(async () => {
    if (tree?.id && userId) {
      await cleanupTree(tree.id, userId);
    }
  });

  it('builds readable markdown with root Q/A', async () => {
    const md = await exportTreeMarkdown({ treeId: tree.id, userId });
    const lines = md.split('\n');
    expect(lines[0].startsWith('# ')).toBe(true);
    expect(md).toContain('Q (user):');
    expect(md).toContain('A (ai):');
  });

  it('renders branch sections with correct indentation', async () => {
    // add a branch under the actual user root (not system root)
    // After soft correction in export, the user node becomes root
    const userRootRes = await pool.query(`SELECT id FROM nodes WHERE tree_id = $1 AND role = 'user' ORDER BY level ASC LIMIT 1`, [tree.id]);
    const userRootId = userRootRes.rows[0].id;
    const branchQ = await pool.query(
      `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 2, 'user', 'branch question') RETURNING id`,
      [tree.id, userRootId],
    );
    await pool.query(
      `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 3, 'ai', 'branch answer')`,
      [tree.id, branchQ.rows[0].id],
    );
    const md = await exportTreeMarkdown({ treeId: tree.id, userId });
    expect(md).toContain('## Branch from node');
    expect(md).toMatch(/- Q \(user\): branch question/);
    expect(md).toMatch(/- A \(ai\): branch answer/);
  });

  it('rejects export for other user', async () => {
    const otherUser = await createUser();
    await expect(exportTreeMarkdown({ treeId: tree.id, userId: otherUser })).rejects.toBeInstanceOf(HttpError);
    await pool.query(`DELETE FROM users WHERE id = $1`, [otherUser]);
  });

  it('handles missing tree', async () => {
    const missingId = randomUUID();
    await expect(exportTreeMarkdown({ treeId: missingId, userId })).rejects.toBeInstanceOf(HttpError);
  });
});
