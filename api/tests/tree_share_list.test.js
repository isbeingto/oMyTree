import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { enableShare, revokeShare } from '../services/tree/share.js';
import { listUserSharedTrees } from '../services/tree/share_list.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `sharelist+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Share List User', email],
  );
  return res.rows[0].id;
}

async function createTree(userId, topic) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id`,
    [topic, userId],
  );
  const tree = treeRes.rows[0];
  await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'user', 'root share list')`,
    [tree.id],
  );
  return tree;
}

async function cleanup(treeIds, userIds) {
  await pool.query(`DELETE FROM events WHERE tree_id = ANY($1)`, [treeIds]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = ANY($1))`, [treeIds]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = ANY($1))`, [treeIds]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = ANY($1)`, [treeIds]);
  await pool.query(`DELETE FROM trees WHERE id = ANY($1)`, [treeIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
}

describe('listUserSharedTrees', () => {
  let userA;
  let userB;
  let treeIds = [];

  beforeEach(async () => {
    userA = await createUser();
    userB = await createUser();
    const t1 = await createTree(userA, 'topic-a1');
    const t2 = await createTree(userA, 'topic-a2');
    treeIds = [t1.id, t2.id];
    await enableShare({ treeId: t1.id, userId: userA, baseUrl: 'http://localhost:8000' });
    await enableShare({ treeId: t2.id, userId: userA, baseUrl: 'http://localhost:8000' });
  });

  afterEach(async () => {
    await cleanup(treeIds, [userA, userB]);
    treeIds = [];
  });

  it('returns only current user shared trees', async () => {
    const aList = await listUserSharedTrees({ userId: userA });
    expect(aList.length).toBe(2);
    const bList = await listUserSharedTrees({ userId: userB });
    expect(bList.length).toBe(0);
  });

  it('excludes revoked shares', async () => {
    const [first] = treeIds;
    await revokeShare({ treeId: first, userId: userA });
    const aList = await listUserSharedTrees({ userId: userA });
    expect(aList.length).toBe(1);
  });
});
