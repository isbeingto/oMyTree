import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pool } from '../db/pool.js';
import createTreeStartRootRouter from '../routes/tree_start_root.js';
import { createTurn } from '../services/turn/create.js';
import { exportTreeJson } from '../services/tree/export_json.js';
import { exportTreeMarkdown } from '../services/tree/export_markdown.js';
import { getTreeMetrics } from '../services/tree/metrics.js';
import express from 'express';
import request from 'supertest';

// Mock getAuthUserIdForRequest
vi.mock('../lib/auth_user.js', () => ({
  getAuthUserIdForRequest: vi.fn(async () => '00000000-0000-0000-0000-000000000000'),
}));

// Mock getAnswer in LLM service to avoid external calls
vi.mock('../services/llm/index.js', () => ({
  getAnswer: vi.fn(async () => ({ ai_text: 'AI Answer', usage_json: {} })),
}));

// Mock bus to avoid side effects
vi.mock('../bus/event_bus.js', () => ({
  default: {
    emit: vi.fn(),
  },
}));

// Mock relevance evaluation
vi.mock('../services/llm/relevance.js', () => ({
  evaluateRelevance: vi.fn(async () => ({
    classification: 'in',
    rule_decision: { score: 100, reason: 'test' },
    source: 'test',
    confidence: 1,
  })),
}));

const TEST_USER_ID = '00000000-0000-0000-0000-000000000000';

async function ensureTestUser() {
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [TEST_USER_ID]);
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id, name, email) VALUES ($1, 'Test User', 'test@example.com') ON CONFLICT DO NOTHING`,
      [TEST_USER_ID]
    );
  }
}

async function cleanupTestUserTrees() {
  const treeIdsRes = await pool.query(`SELECT id FROM trees WHERE user_id = $1`, [TEST_USER_ID]);
  const treeIds = treeIdsRes.rows.map((r) => r.id);
  if (treeIds.length === 0) return;
  await pool.query(`DELETE FROM events WHERE tree_id = ANY($1::uuid[])`, [treeIds]);
  await pool.query(
    `DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = ANY($1::uuid[]))`,
    [treeIds]
  );
  await pool.query(
    `DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = ANY($1::uuid[]))`,
    [treeIds]
  );
  await pool.query(`DELETE FROM nodes WHERE tree_id = ANY($1::uuid[])`, [treeIds]);
  await pool.query(`DELETE FROM trees WHERE id = ANY($1::uuid[])`, [treeIds]);
}

describe('POST /api/tree/start-root Root Semantics', () => {
  let app;

  beforeEach(async () => {
    await ensureTestUser();
    await cleanupTestUserTrees();
    app = express();
    app.use(express.json());
    app.use(createTreeStartRootRouter());
  });

  it('should create tree with correct root semantics', async () => {
    const firstQuestion = 'First Question?';

    const res = await request(app)
      .post('/api/tree/start-root')
      .send({
        user_text: firstQuestion,
      });

    if (res.status !== 201) {
      console.error(res.body);
    }
    expect(res.status).toBe(201);
    const { tree, root_node, ai_node } = res.body;

    // Topic is initially set to user_text (or truncated version for long questions)
    // Will be replaced async by LLM-generated topic (not tested here due to mock)
    expect(tree.topic).toBe(firstQuestion);
    
    // Verify Root Node
    expect(root_node.role).toBe('user');
    expect(root_node.text).toBe(firstQuestion);
    expect(root_node.level).toBe(0);
    expect(root_node.parent_id).toBeNull();

    // Verify AI Node
    expect(ai_node.role).toBe('ai');
    expect(ai_node.parent_id).toBe(root_node.id);
    expect(ai_node.level).toBe(1);

    // Verify DB state
    const { rows: nodes } = await pool.query('SELECT * FROM nodes WHERE tree_id = $1 ORDER BY level', [tree.id]);
    expect(nodes.length).toBe(2);
    expect(nodes[0].id).toBe(root_node.id);
    expect(nodes[1].id).toBe(ai_node.id);
  });
});

describe('createTurn continuation - no new root created', () => {
  let treeId;
  let aiNodeId;

  beforeEach(async () => {
    await ensureTestUser();
    await cleanupTestUserTrees();
    // Create a tree with start-root first
    const { rows: treeRows } = await pool.query(
      `INSERT INTO trees(topic, created_by, status, user_id)
       VALUES ('Continue Test Tree', 'user', 'active', $1)
       RETURNING id`,
      [TEST_USER_ID]
    );
    treeId = treeRows[0].id;

    // Create root user node
    const { rows: rootRows } = await pool.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'user', 'Initial question')
       RETURNING id`,
      [treeId]
    );
    const rootId = rootRows[0].id;

    // Create AI response
    const { rows: aiRows } = await pool.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, $2, 1, 'ai', 'AI response')
       RETURNING id`,
      [treeId, rootId]
    );
    aiNodeId = aiRows[0].id;
  });

  afterEach(async () => {
    if (treeId) {
      await pool.query('DELETE FROM events WHERE tree_id = $1', [treeId]);
      await pool.query('DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)', [treeId]);
      await pool.query('DELETE FROM nodes WHERE tree_id = $1', [treeId]);
      await pool.query('DELETE FROM trees WHERE id = $1', [treeId]);
    }
  });

  it('should NOT create a new root when continuing conversation', async () => {
    // Continue conversation from AI node
    const result = await createTurn({
      tree_id: treeId,
      node_id: aiNodeId,
      user_text: 'Follow-up question',
      with_ai: true,
      who: 'user',
      user_id: TEST_USER_ID,
    });

    expect(result.user_node).toBeDefined();
    expect(result.user_node.parent_id).toBe(aiNodeId);
    expect(result.user_node.level).toBe(2);

    // Verify no new root was created
    const { rows: roots } = await pool.query(
      'SELECT * FROM nodes WHERE tree_id = $1 AND parent_id IS NULL',
      [treeId]
    );
    expect(roots.length).toBe(1);
    expect(roots[0].role).toBe('user');
    expect(roots[0].text).toBe('Initial question');
  });
});

describe('Legacy system root soft correction', () => {
  let legacyTreeId;

  beforeEach(async () => {
    await ensureTestUser();
    await cleanupTestUserTrees();
    // Create a legacy tree with system root structure
    const { rows: treeRows } = await pool.query(
      `INSERT INTO trees(topic, created_by, status, user_id)
       VALUES ('Legacy Tree', 'user', 'active', $1)
       RETURNING id`,
      [TEST_USER_ID]
    );
    legacyTreeId = treeRows[0].id;

    // Create system root (legacy pattern)
    const { rows: sysRootRows } = await pool.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, NULL, 0, 'system', 'Legacy Topic')
       RETURNING id`,
      [legacyTreeId]
    );
    const sysRootId = sysRootRows[0].id;

    // Create user node under system root
    const { rows: userRows } = await pool.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, $2, 1, 'user', 'User question')
       RETURNING id`,
      [legacyTreeId, sysRootId]
    );
    const userNodeId = userRows[0].id;

    // Create AI response
    await pool.query(
      `INSERT INTO nodes(tree_id, parent_id, level, role, text)
       VALUES ($1, $2, 2, 'ai', 'AI answer')`,
      [legacyTreeId, userNodeId]
    );
  });

  afterEach(async () => {
    if (legacyTreeId) {
      await pool.query('DELETE FROM events WHERE tree_id = $1', [legacyTreeId]);
      await pool.query('DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)', [legacyTreeId]);
      await pool.query('DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)', [legacyTreeId]);
      await pool.query('DELETE FROM nodes WHERE tree_id = $1', [legacyTreeId]);
      await pool.query('DELETE FROM trees WHERE id = $1', [legacyTreeId]);
    }
  });

  it('exportTreeJson should filter out system root and reparent children', async () => {
    const json = await exportTreeJson({ treeId: legacyTreeId, userId: TEST_USER_ID });

    // System root should be gone
    const systemNodes = json.nodes.filter(n => n.role === 'system');
    expect(systemNodes.length).toBe(0);

    // User node should now be root (parent_id = null)
    const userRoot = json.nodes.find(n => n.role === 'user' && n.parent_id === null);
    expect(userRoot).toBeDefined();
    expect(userRoot.text).toBe('User question');

    // Total should be 2 (user + ai), not 3
    expect(json.nodes.length).toBe(2);
  });

  it('exportTreeMarkdown should show user question as root', async () => {
    const md = await exportTreeMarkdown({ treeId: legacyTreeId, userId: TEST_USER_ID });

    expect(md).toContain('## Root');
    expect(md).toContain('Q (user): User question');
    expect(md).toContain('A (ai): AI answer');
    // Should NOT contain system role text as root
    expect(md).not.toContain('Q (user): Legacy Topic');
  });

  it('getTreeMetrics should exclude system root from counts', async () => {
    const metrics = await getTreeMetrics({ treeId: legacyTreeId, userId: TEST_USER_ID });

    // node_count should be 2 (user + ai), not 3
    expect(metrics.node_count).toBe(2);
    expect(metrics.user_question_count).toBe(1);
    expect(metrics.ai_answer_count).toBe(1);
    // depth_max should be 1 (relative to user root at 0)
    // After correction: user is level 0, ai is level 1
    expect(metrics.depth_max).toBe(1);
  });
});
