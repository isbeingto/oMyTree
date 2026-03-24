import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { enableShare, revokeShare, getSharedTreeByToken, getShareInfo } from '../services/tree/share.js';
import { HttpError } from '../lib/errors.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `share+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Share User', email],
  );
  return res.rows[0].id;
}

async function createTreeFixture(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id, topic, user_id, created_at`,
    ['share-topic', userId],
  );
  const tree = treeRes.rows[0];
  await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'user', 'root share')`,
    [tree.id],
  );
  return tree;
}

async function cleanupTree(treeId, userId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('tree share lifecycle', () => {
  let userId;
  let tree;

  beforeEach(async () => {
    userId = await createUser();
    tree = await createTreeFixture(userId);
  });

  afterEach(async () => {
    if (tree?.id && userId) {
      await cleanupTree(tree.id, userId);
    }
  });

  it('enables share and returns token/url', async () => {
    const res = await enableShare({ treeId: tree.id, userId, baseUrl: 'http://localhost:8000' });
    expect(res.share_token).toBeTruthy();
    expect(res.share_url).toContain(res.share_token);
    const info = await getShareInfo({ treeId: tree.id, userId, baseUrl: 'http://localhost:8000' });
    expect(info.share_token).toBe(res.share_token);
  });

  it('prevents other users from enabling share', async () => {
    const otherUser = await createUser();
    await expect(enableShare({ treeId: tree.id, userId: otherUser })).rejects.toBeInstanceOf(HttpError);
    await pool.query(`DELETE FROM users WHERE id = $1`, [otherUser]);
  });

  it('share view works then revokes', async () => {
    const res = await enableShare({ treeId: tree.id, userId, baseUrl: 'http://localhost:8000' });
    const view = await getSharedTreeByToken({ token: res.share_token });
    expect(view?.tree?.id).toBe(tree.id);
    expect(view?.tree?.user_id).toBeUndefined();
    await revokeShare({ treeId: tree.id, userId });
    await expect(getSharedTreeByToken({ token: res.share_token })).rejects.toBeInstanceOf(HttpError);
  });

  it('missing token returns 404', async () => {
    await expect(getSharedTreeByToken({ token: randomUUID() })).rejects.toBeInstanceOf(HttpError);
  });
});
