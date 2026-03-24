import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { exportTreeJson } from '../services/tree/export_json.js';
import { HttpError } from '../lib/errors.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `export+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Export User', email],
  );
  return res.rows[0].id;
}

async function createTreeFixture(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id, topic, user_id, created_at`,
    ['export-topic', userId],
  );
  const tree = treeRes.rows[0];
  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'user', 'root text') RETURNING *`,
    [tree.id],
  );
  const childRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 1, 'ai', 'child text') RETURNING *`,
    [tree.id, rootRes.rows[0].id],
  );
  return { tree, root: rootRes.rows[0], child: childRes.rows[0] };
}

async function cleanupTree(treeId, userId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('exportTreeJson', () => {
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

  it('exports tree with nodes and metadata', async () => {
    const payload = await exportTreeJson({ treeId: tree.id, userId });
    expect(payload.version).toBe('1');
    expect(payload.tree.id).toBe(tree.id);
    expect(payload.tree.user_id).toBe(userId);
    expect(Array.isArray(payload.nodes)).toBe(true);
    expect(payload.nodes.length).toBe(2);
    const rootNode = payload.nodes.find((n) => n.parent_id === null);
    const childNode = payload.nodes.find((n) => n.parent_id === rootNode.id);
    expect(rootNode).toBeTruthy();
    expect(childNode).toBeTruthy();
    expect(payload.lens).toBeTruthy();
    expect(payload.timeline).toBeTruthy();
    expect(payload.metrics?.node_count).toBeGreaterThanOrEqual(2);
  });

  it('rejects export for other user', async () => {
    const otherUser = await createUser();
    await expect(exportTreeJson({ treeId: tree.id, userId: otherUser })).rejects.toBeInstanceOf(HttpError);
    await cleanupTree(tree.id, userId);
    await pool.query(`DELETE FROM users WHERE id = $1`, [otherUser]);
  });

  it('handles missing tree', async () => {
    const missingId = randomUUID();
    await expect(exportTreeJson({ treeId: missingId, userId })).rejects.toBeInstanceOf(HttpError);
  });
});
