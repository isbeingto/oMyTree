import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { buildQANodesFromNodes } from '../services/tree/qa_model.js';
import createTreeQaRouter from '../routes/tree_qa.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

function makeNode(treeId, id, parentId, role, level, text, createdAtMs) {
  return {
    id,
    tree_id: treeId,
    parent_id: parentId,
    role,
    level,
    text,
    created_at: new Date(createdAtMs),
  };
}

async function createUser() {
  const email = `qa-model+${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['QA Model User', email],
  );
  return res.rows[0].id;
}

async function createTreeFixture(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id)
     VALUES ($1, 'user', 'active', $2)
     RETURNING id`,
    ['qa-model-tree', userId],
  );
  const treeId = treeRes.rows[0].id;

  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, NULL, 0, 'user', 'Root question')
     RETURNING id`,
    [treeId],
  );
  const rootId = rootRes.rows[0].id;

  const aiRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, $2, 1, 'ai', 'Root answer')
     RETURNING id`,
    [treeId, rootId],
  );
  const aiId = aiRes.rows[0].id;

  const followUpRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, $2, 2, 'user', 'Follow up') 
     RETURNING id`,
    [treeId, aiId],
  );
  const followUpId = followUpRes.rows[0].id;

  return { treeId, rootId, aiId, followUpId };
}

async function cleanupTree(treeId) {
  if (!treeId) return;
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
}

async function cleanupUser(userId) {
  if (!userId) return;
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('buildQANodesFromNodes', () => {
  const base = Date.parse('2025-01-01T00:00:00Z');

  it('creates QANodes for a linear conversation', () => {
    const treeId = 'tree-linear';
    const nodes = [
      makeNode(treeId, 'u1', null, 'user', 0, 'Q1', base),
      makeNode(treeId, 'a1', 'u1', 'ai', 1, 'A1', base + 1_000),
      makeNode(treeId, 'u2', 'a1', 'user', 2, 'Q2', base + 2_000),
      makeNode(treeId, 'a2', 'u2', 'ai', 3, 'A2', base + 3_000),
    ];

    const qaNodes = buildQANodesFromNodes(treeId, nodes);
    expect(qaNodes.map((n) => n.id)).toEqual(['u1', 'u2']);
    expect(qaNodes[0].ai_text).toBe('A1');
    expect(qaNodes[0].children_ids).toEqual(['u2']);
    expect(qaNodes[1].parent_id).toBe('u1');
    expect(qaNodes[1].ai_text).toBe('A2');
  });

  it('tracks branches from the same parent user', () => {
    const treeId = 'tree-branch';
    const nodes = [
      makeNode(treeId, 'u1', null, 'user', 0, 'Root', base),
      makeNode(treeId, 'a1', 'u1', 'ai', 1, 'A1', base + 100),
      makeNode(treeId, 'u2', 'a1', 'user', 2, 'Deep question', base + 200),
      makeNode(treeId, 'a2', 'u2', 'ai', 3, 'A2', base + 300),
      makeNode(treeId, 'u3', 'a2', 'user', 4, 'Branch A', base + 400),
      makeNode(treeId, 'u4', 'a2', 'user', 4, 'Branch B', base + 500),
    ];

    const qaNodes = buildQANodesFromNodes(treeId, nodes);
    const parent = qaNodes.find((n) => n.id === 'u2');
    const branchA = qaNodes.find((n) => n.id === 'u3');
    const branchB = qaNodes.find((n) => n.id === 'u4');
    expect(parent?.children_ids).toEqual(['u3', 'u4']);
    expect(branchA?.parent_id).toBe('u2');
    expect(branchB?.parent_id).toBe('u2');
  });

  it('keeps QANodes without AI replies', () => {
    const treeId = 'tree-missing-ai';
    const nodes = [
      makeNode(treeId, 'u1', null, 'user', 0, 'Q1', base),
      makeNode(treeId, 'u2', 'u1', 'user', 1, 'Q2', base + 1_000),
    ];

    const qaNodes = buildQANodesFromNodes(treeId, nodes);
    expect(qaNodes.length).toBe(2);
    expect(qaNodes[0].ai_node_id).toBeNull();
    expect(qaNodes[1].ai_node_id).toBeNull();
  });

  it('soft-corrects legacy system roots', () => {
    const treeId = 'tree-legacy';
    const nodes = [
      makeNode(treeId, 'sys', null, 'system', 0, 'Legacy topic', base),
      makeNode(treeId, 'u1', 'sys', 'user', 1, 'Real root', base + 1_000),
      makeNode(treeId, 'a1', 'u1', 'ai', 2, 'A1', base + 2_000),
    ];

    const qaNodes = buildQANodesFromNodes(treeId, nodes);
    expect(qaNodes.length).toBe(1);
    expect(qaNodes[0].id).toBe('u1');
    expect(qaNodes[0].parent_id).toBeNull();
    expect(qaNodes[0].ai_text).toBe('A1');
  });
});

describe('GET /api/tree/:id/qa', () => {
  let app;
  let userId;
  let otherUserId;
  let tree;

  beforeEach(async () => {
    userId = await createUser();
    otherUserId = await createUser();
    tree = await createTreeFixture(userId);
    app = express();
    app.use(express.json());
    app.use('/api/tree', createTreeQaRouter(pool));
  });

  afterEach(async () => {
    if (tree?.treeId) {
      await cleanupTree(tree.treeId);
    }
    if (userId) {
      await cleanupUser(userId);
    }
    if (otherUserId) {
      await cleanupUser(otherUserId);
    }
  });

  it('returns QANodes for the owner', async () => {
    const res = await request(app)
      .get(`/api/tree/${tree.treeId}/qa`)
      .set('x-omytree-user-id', userId);

    expect(res.status).toBe(200);
    expect(res.body.root_id).toBe(tree.rootId);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes.length).toBe(2);
    const rootNode = res.body.nodes.find((n) => n.id === tree.rootId);
    expect(rootNode.ai_text).toBe('Root answer');
  });

  it('blocks access for non-owners', async () => {
    const res = await request(app)
      .get(`/api/tree/${tree.treeId}/qa`)
      .set('x-omytree-user-id', otherUserId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TREE_NOT_FOUND');
  });

  it('404s missing trees', async () => {
    const missingId = randomUUID();
    const res = await request(app)
      .get(`/api/tree/${missingId}/qa`)
      .set('x-omytree-user-id', userId);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TREE_NOT_FOUND');
  });
});
