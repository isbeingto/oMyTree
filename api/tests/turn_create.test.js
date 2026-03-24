import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTurn } from '../services/turn/create.js';
import { evaluateRelevance } from '../services/llm/relevance.js';
import { getAnswer } from '../services/llm/index.js';
import { randomUUID } from 'crypto';

vi.mock('../services/llm/relevance.js', () => ({
  evaluateRelevance: vi.fn(async () => ({
    classification: 'in',
    rule_decision: { score: 100, reason: 'test' },
    source: 'test',
    confidence: 1,
  })),
}));

let lastGetAnswerOptions = null;
vi.mock('../services/llm/index.js', () => ({
  getAnswer: vi.fn(async (_payload, options) => {
    lastGetAnswerOptions = options;
    return { ai_text: 'ai-reply', usage_json: { test: true } };
  }),
}));

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createUser() {
  const email = `test+${Date.now()}@example.com`;
  const res = await pool.query(
    `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
    ['Test User', email],
  );
  return res.rows[0].id;
}

async function createTreeWithRoot(userId) {
  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id) VALUES ($1, 'user', 'active', $2) RETURNING id, topic, user_id`,
    ['coverage-tree', userId],
  );
  const tree = treeRes.rows[0];
  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text) VALUES ($1, NULL, 0, 'user', 'root text') RETURNING *`,
    [tree.id],
  );
  return { tree, root: rootRes.rows[0] };
}

async function cleanupTree(treeId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
}

describe('createTurn core flow', () => {
  let userId;
  let tree;
  let root;

  beforeEach(async () => {
    userId = await createUser();
    const setup = await createTreeWithRoot(userId);
    tree = setup.tree;
    root = setup.root;
  });

  afterEach(async () => {
    if (tree?.id) {
      await cleanupTree(tree.id);
    }
    if (userId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    vi.clearAllMocks();
    lastGetAnswerOptions = null;
  });

  it('creates user + ai nodes under a parent (happy path)', async () => {
    const res = await createTurn({
      tree_id: tree.id,
      node_id: root.id,
      user_text: 'follow up q',
      user_id: userId,
      route_mode: 'auto',
    });

    expect(res.user_node).toBeTruthy();
    expect(res.ai_node).toBeTruthy();
    expect(res.user_node.parent_id).toBe(root.id);
    expect(res.ai_node.parent_id).toBe(res.user_node.id);
    expect(res.user_node.level).toBe(root.level + 1);
    expect(res.ai_node.level).toBe(res.user_node.level + 1);
    expect(res.user_node.role).toBe('user');
    expect(res.ai_node.role).toBe('ai');
    expect(res.turn.status).toBe('completed');
    expect(getAnswer).toHaveBeenCalled();
    expect(evaluateRelevance).toHaveBeenCalled();
  });

  it('rejects empty user text', async () => {
    await expect(
      createTurn({ tree_id: tree.id, node_id: root.id, user_text: ' ', user_id: userId })
    ).rejects.toMatchObject({ code: 'EMPTY_USER_TEXT', status: 422 });
  });

  it('rejects missing parent', async () => {
    await expect(
      createTurn({
        tree_id: tree.id,
        node_id: randomUUID(),
        user_text: 'hi',
        user_id: userId,
      })
    ).rejects.toMatchObject({ code: 'PARENT_NOT_FOUND', status: 404 });
  });

  it('propagates LLM errors when provider fails', async () => {
    vi.mocked(getAnswer).mockRejectedValueOnce(new Error('llm boom'));

    await expect(
      createTurn({
        tree_id: tree.id,
        node_id: root.id,
        user_text: 'cause pending',
        user_id: userId,
      })
    ).rejects.toMatchObject({
      code: 'internal_error',
      isLlmError: true,
    });
  });

  it('forces lite/branch profile when advanced context is disabled', async () => {
    await pool.query(
      `UPDATE trees SET context_profile = 'standard', memory_scope = 'tree' WHERE id = $1`,
      [tree.id],
    );

    await createTurn({
      tree_id: tree.id,
      node_id: root.id,
      user_text: 'check profile',
      user_id: userId,
    });

    expect(lastGetAnswerOptions?.context_profile).toBe('lite');
    expect(lastGetAnswerOptions?.memory_scope).toBe('branch');
  });

  it('passes tree context profile/scope when advanced context is enabled', async () => {
    await pool.query(`UPDATE users SET enable_advanced_context = TRUE WHERE id = $1`, [userId]);
    await pool.query(
      `UPDATE trees SET context_profile = 'standard', memory_scope = 'tree' WHERE id = $1`,
      [tree.id],
    );

    await createTurn({
      tree_id: tree.id,
      node_id: root.id,
      user_text: 'advanced profile',
      user_id: userId,
      provider: 'mock',
    });

    expect(lastGetAnswerOptions?.context_profile).toBe('standard');
    expect(lastGetAnswerOptions?.memory_scope).toBe('tree');
  });
});
