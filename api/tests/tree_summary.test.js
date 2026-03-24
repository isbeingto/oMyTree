import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { updateTreeSummary, maybeRefreshTreeSummary, __private__ } from '../services/tree/tree_summary.js';
import { getTreeSummaryMetricsSnapshot, resetTreeSummaryMetrics } from '../lib/tree_summary_metrics.js';
import { TREE_SUMMARY_REFRESH_INTERVAL } from '../services/llm/context_limits.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

let lastCallChat = 0;
let lastPrompt = null;
let shouldFail = false;

vi.mock('../services/llm/providers/index.js', () => {
  return {
    resolveProviderForRequest: vi.fn(async () => ({
      provider: {
        callChat: vi.fn(async ({ prompt }) => {
          lastCallChat += 1;
          lastPrompt = prompt;
          if (shouldFail) {
            throw new Error('simulated summary failure');
          }
          const payload = {
            lang: 'en',
            themes: [
              { name: 'Basics', facts: ['Alice, 25, Beijing'], questions: [] },
              { name: 'Interests', facts: ['Hotpot, sushi'], questions: [] },
            ],
          };
          return { ai_text: JSON.stringify(payload), model: 'mock-model' };
        }),
      },
      name: 'mock-provider',
      defaultModel: 'mock-model',
    })),
  };
});

async function createUserAndTree({
  topic = 'ts-topic',
  preferredLanguage = 'en',
  rootText = 'root text',
} = {}) {
  const userRes = await pool.query(
    `INSERT INTO users (name, email, preferred_language) VALUES ($1, $2, $3) RETURNING id`,
    ['TreeSummaryUser', `tree-summary+${Date.now()}@example.com`, preferredLanguage]
  );
  const userId = userRes.rows[0].id;

  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id, node_count, branch_count)
     VALUES ($1, 'user', 'active', $2, $3, 1) RETURNING id`,
    [topic, userId, TREE_SUMMARY_REFRESH_INTERVAL]
  );
  const treeId = treeRes.rows[0].id;

  // root node
  const rootRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, NULL, 0, 'user', $2) RETURNING id`,
    [treeId, rootText]
  );
  const rootId = rootRes.rows[0].id;

  // one child with summary
  await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, $2, 1, 'ai', 'child ai text')`,
    [treeId, rootId]
  );
  await pool.query(
    `INSERT INTO node_summaries (node_id, path_summary, parent_summary)
     VALUES ($1, 'path summary here', 'parent summary here')`,
    [rootId]
  );

  return { userId, treeId };
}

async function cleanup(userId, treeId) {
  await pool.query(`DELETE FROM events WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM node_summaries WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)`, [treeId]);
  await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [treeId]);
  await pool.query(`DELETE FROM trees WHERE id = $1`, [treeId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('tree summary updater', () => {
  let userId;
  let treeId;

  beforeEach(async () => {
    lastCallChat = 0;
    lastPrompt = null;
    shouldFail = false;
    resetTreeSummaryMetrics();
    const res = await createUserAndTree();
    userId = res.userId;
    treeId = res.treeId;
  });

  afterEach(async () => {
    if (treeId && userId) {
      await cleanup(userId, treeId);
    }
  });

  it('writes tree_summary via updateTreeSummary', async () => {
    const res = await updateTreeSummary(treeId, { userId });
    expect(res?.ok).toBe(true);
    const { rows } = await pool.query(
      `SELECT tree_summary FROM trees WHERE id = $1`,
      [treeId]
    );
    expect(rows[0].tree_summary?.text).toMatch(/Themes:/);
    expect(rows[0].tree_summary?.semantic?.themes?.length).toBeGreaterThan(0);
    expect(lastPrompt).toMatch(/Target language:\s*en/);
  });

  it('refreshes only when threshold met', async () => {
    // Existing summary should prevent refresh unless interval condition true
    const lastNodeCount = TREE_SUMMARY_REFRESH_INTERVAL + 1;
    await pool.query(
      `UPDATE trees SET 
        tree_summary = jsonb_build_object(
          'text', 'existing',
          'meta', jsonb_build_object('last_node_count', $2::int),
          'updated_at', now()::text
        ),
        node_count = $2::int 
       WHERE id = $1`,
      [treeId, lastNodeCount]
    );
    await maybeRefreshTreeSummary(treeId, { userId });
    expect(lastCallChat).toBe(0);
  });

  it('picks zh-CN when topic and content are Chinese-heavy', async () => {
    const { userId: zhUserId, treeId: zhTreeId } = await createUserAndTree({
      topic: '中文话题 树概览',
      preferredLanguage: 'en',
      rootText: '这是中文的根节点内容，用于判断语言。',
    });
    await updateTreeSummary(zhTreeId, { userId: zhUserId });
    expect(lastPrompt).toMatch(/Target language:\s*zh-CN/);
    await cleanup(zhUserId, zhTreeId);
  });

  it('refreshes when topic tag changes', async () => {
    await pool.query(
      `UPDATE trees SET tree_summary = jsonb_build_object(
        'text','existing',
        'semantic', jsonb_build_object('themes', jsonb_build_array()),
        'meta', jsonb_build_object('last_topic_tag','coding','last_node_count',1),
        'updated_at', (now() - interval '15 minutes')::text
      ), node_count = 2 WHERE id = $1`,
      [treeId]
    );
    await maybeRefreshTreeSummary(treeId, { userId, topicTag: 'food' });
    expect(lastCallChat).toBe(1);
  });

  it('prefers user preferred_language when provided', async () => {
    const { userId: zhUserId, treeId: zhTreeId } = await createUserAndTree({
      topic: 'English topic only',
      preferredLanguage: 'zh-CN',
    });
    await updateTreeSummary(zhTreeId, { userId: zhUserId });
    expect(lastPrompt).toMatch(/Target language:\s*zh-CN/);
    await cleanup(zhUserId, zhTreeId);
  });

  it('exposes language helpers for fallback logic', () => {
    const { selectTargetLanguage } = __private__;
    const lang = selectTargetLanguage({
      preferredLanguage: null,
      topic: '混合 Mixed 内容 mixed',
      recentNodes: [{ text: '再多一些中文内容' }],
    });
    expect(lang).toBe('zh-CN');
  });

  it('records last_error and metrics on summary failure', async () => {
    shouldFail = true;
    const res = await updateTreeSummary(treeId, { userId });
    expect(res?.ok).toBe(false);
    const { rows } = await pool.query(
      `SELECT tree_summary_last_error, tree_summary_last_error_at FROM trees WHERE id = $1`,
      [treeId]
    );
    expect(rows[0].tree_summary_last_error).toContain('simulated summary failure');
    expect(rows[0].tree_summary_last_error_at).toBeTruthy();
    const metrics = getTreeSummaryMetricsSnapshot();
    expect(Object.keys(metrics.failure).length).toBeGreaterThan(0);
    const firstValue = Object.values(metrics.failure)[0];
    expect(firstValue).toBeGreaterThan(0);
  });
});
