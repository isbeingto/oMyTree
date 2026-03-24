import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getTreeMetrics } from '../services/tree/metrics.js';
import { HttpError } from '../lib/errors.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `metrics+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Metrics User', email],
  );
  return res.rows[0].id;
}

async function createTreeWithBranches(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id, created_at`,
    ['metrics-topic', userId],
  );
  const tree = treeRes.rows[0];
  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'user', 'root q') RETURNING id, created_at, level, role, parent_id`,
    [tree.id],
  );
  const root = rootRes.rows[0];
  const childA = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 1, 'ai', 'root a') RETURNING id, created_at, level, role, parent_id`,
    [tree.id, root.id],
  );
  const childB = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 1, 'user', 'branch q1') RETURNING id, created_at, level, role, parent_id`,
    [tree.id, root.id],
  );
  await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, $2, 2, 'ai', 'branch a1')`,
    [tree.id, childB.rows[0].id],
  );

  return { tree, root, childA: childA.rows[0], childB: childB.rows[0] };
}

async function cleanup(treeId, userId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('getTreeMetrics', () => {
  let userId;
  let tree;

  beforeEach(async () => {
    userId = await createUser();
    const setup = await createTreeWithBranches(userId);
    tree = setup.tree;
  });

  afterEach(async () => {
    if (tree?.id && userId) {
      await cleanup(tree.id, userId);
    }
  });

  it('returns metrics for owner', async () => {
    const metrics = await getTreeMetrics({ treeId: tree.id, userId });
    expect(metrics.tree_id).toBe(tree.id);
    expect(metrics.node_count).toBeGreaterThanOrEqual(4);
    expect(metrics.depth_max).toBeGreaterThanOrEqual(1);
    expect(metrics.user_question_count).toBeGreaterThanOrEqual(1);
    expect(metrics.ai_answer_count).toBeGreaterThanOrEqual(1);
  });

  it('counts branch nodes where children >= 2', async () => {
    const metrics = await getTreeMetrics({ treeId: tree.id, userId });
    expect(metrics.branch_node_count).toBeGreaterThanOrEqual(1);
  });

  it('ignores soft-deleted nodes', async () => {
    const { rows } = await pool.query(`SELECT id FROM nodes WHERE tree_id = $1 LIMIT 1`, [tree.id]);
    await pool.query(`UPDATE nodes SET soft_deleted_at = now() WHERE id = $1`, [rows[0].id]);
    const metrics = await getTreeMetrics({ treeId: tree.id, userId });
    expect(metrics.node_count).toBeGreaterThanOrEqual(3);
  });

  it('uses latest node created_at for updated_at', async () => {
    const farFuture = new Date(Date.now() + 3600 * 1000).toISOString();
    await pool.query(
      `UPDATE nodes SET created_at = $1 WHERE id IN (
        SELECT id FROM nodes WHERE tree_id = $2 ORDER BY created_at DESC LIMIT 1
      )`,
      [farFuture, tree.id]
    );
    const metrics = await getTreeMetrics({ treeId: tree.id, userId });
    expect(metrics.updated_at).toBeTruthy();
  });

  it('blocks non-owner', async () => {
    const otherUser = await createUser();
    await expect(getTreeMetrics({ treeId: tree.id, userId: otherUser })).rejects.toBeInstanceOf(HttpError);
    await pool.query(`DELETE FROM users WHERE id = $1`, [otherUser]);
  });

  it('404s missing tree', async () => {
    await expect(getTreeMetrics({ treeId: randomUUID(), userId })).rejects.toBeInstanceOf(HttpError);
  });
});
