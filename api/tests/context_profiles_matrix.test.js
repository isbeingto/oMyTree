import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { createTurn } from '../services/turn/create.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

let lastOptions = null;
let lastMessages = null;
let mockIsByok = false;
let mockProviderName = 'mock-provider';

vi.mock('../services/llm/providers/index.js', () => ({
  resolveProviderForRequest: vi.fn(async ({ providerHint }) => ({
    provider: {
      callChat: vi.fn(async ({ options, messages }) => {
        lastOptions = options;
        lastMessages = messages;
        return { ai_text: 'ok', usage_json: {} };
      }),
    },
    name: providerHint || mockProviderName,
    isByok: mockIsByok,
    defaultModel: 'mock-model',
    allowedModels: ['mock-model'],
  })),
}));

async function createUserAndTree({
  advancedEnabled,
  contextProfile,
  memoryScope,
  preferredProvider = 'openai',
  treeSummaryText = null,
}) {
  const userRes = await pool.query(
    `INSERT INTO users (name, email, enable_advanced_context, preferred_llm_provider)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ['MatrixUser', `matrix+${Date.now()}@example.com`, advancedEnabled, preferredProvider]
  );
  const userId = userRes.rows[0].id;

  const treeRes = await pool.query(
    `INSERT INTO trees (topic, created_by, status, user_id, context_profile, memory_scope, tree_summary)
     VALUES ('topic', 'user', 'active', $1, $2, $3, $4)
     RETURNING id`,
    [userId, contextProfile, memoryScope, treeSummaryText ? { text: treeSummaryText } : null]
  );
  const treeId = treeRes.rows[0].id;

  const nodeRes = await pool.query(
    `INSERT INTO nodes (tree_id, parent_id, level, role, text)
     VALUES ($1, NULL, 0, 'user', 'root question') RETURNING id`,
    [treeId]
  );
  const rootNodeId = nodeRes.rows[0].id;

  return { userId, treeId, rootNodeId };
}

async function cleanup(userId, treeId) {
  await pool.query('DELETE FROM events WHERE tree_id = $1', [treeId]);
  await pool.query('DELETE FROM turns WHERE node_id IN (SELECT id FROM nodes WHERE tree_id = $1)', [treeId]);
  await pool.query('DELETE FROM nodes WHERE tree_id = $1', [treeId]);
  await pool.query('DELETE FROM trees WHERE id = $1', [treeId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

describe('Context behaviour matrix (T36-1)', () => {
  beforeEach(() => {
    lastOptions = null;
    lastMessages = null;
    mockIsByok = false;
    mockProviderName = 'mock-provider';
  });

  afterEach(async () => {
    // Clean up stray test data (if a test aborted early, ids may be undefined)
  });

  it('advanced OFF forces lite/branch even if tree profile is max', async () => {
    const { userId, treeId, rootNodeId } = await createUserAndTree({
      advancedEnabled: false,
      contextProfile: 'max',
      memoryScope: 'tree',
    });

    await createTurn({
      tree_id: treeId,
      node_id: rootNodeId,
      user_text: 'hello',
      user_id: userId,
    });

    expect(lastOptions?.context_profile).toBe('lite');
    expect(lastOptions?.memory_scope).toBe('branch');
    expect(lastOptions?.max_tokens).toBeUndefined();
    const system = lastMessages?.find((m) => m.role === 'system');
    // T50-1: New format uses "- 树概况:"
    expect(system?.content || '').not.toContain('- 树概况:');

    await cleanup(userId, treeId);
  });

  it('advanced ON blocks platform default provider', async () => {
    const { userId, treeId, rootNodeId } = await createUserAndTree({
      advancedEnabled: true,
      contextProfile: 'standard',
      memoryScope: 'branch',
      preferredProvider: 'omytree-default',
    });

    await expect(
      createTurn({
        tree_id: treeId,
        node_id: rootNodeId,
        user_text: 'hello',
        user_id: userId,
        provider: 'omytree-default',
      })
    ).rejects.toMatchObject({ code: 'DEFAULT_BLOCKED_IN_ADVANCED' });

    await cleanup(userId, treeId);
  });

  it('BYOK + standard + branch does not force max_tokens', async () => {
    mockIsByok = true;
    const { userId, treeId, rootNodeId } = await createUserAndTree({
      advancedEnabled: true,
      contextProfile: 'standard',
      memoryScope: 'branch',
    });

    await createTurn({
      tree_id: treeId,
      node_id: rootNodeId,
      user_text: 'hello',
      user_id: userId,
      provider: 'byok-mock',
    });

    expect(lastOptions?.context_profile).toBe('standard');
    expect(lastOptions?.max_tokens).toBeUndefined();
    const system = lastMessages?.find((m) => m.role === 'system');
    // T50-1: New format uses "- 树概况:"
    expect(system?.content || '').not.toContain('- 树概况:');

    await cleanup(userId, treeId);
  });

  it('BYOK + max + tree adds tree_summary without max_tokens', async () => {
    mockIsByok = true;
    const summaryText = 'Tree summary for testing';
    const { userId, treeId, rootNodeId } = await createUserAndTree({
      advancedEnabled: true,
      contextProfile: 'max',
      memoryScope: 'tree',
      treeSummaryText: summaryText,
    });

    await createTurn({
      tree_id: treeId,
      node_id: rootNodeId,
      user_text: 'hello',
      user_id: userId,
      provider: 'byok-mock',
    });

    expect(lastOptions?.context_profile).toBe('max');
    expect(lastOptions?.memory_scope).toBe('tree');
    expect(lastOptions?.max_tokens).toBeUndefined();
    const system = lastMessages?.find((m) => m.role === 'system');
    expect(system?.content || '').toContain(summaryText);
    const content = system?.content || '';
    // T50-1: New format uses "- 树概况:" or "- Tree:"
    expect(content.includes('- 树概况:') || content.includes('- Tree:')).toBe(true);

    await cleanup(userId, treeId);
  });
});
