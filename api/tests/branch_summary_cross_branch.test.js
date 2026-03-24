import { describe, it, expect, vi } from 'vitest';

import { detectCrossBranchReferences } from '../services/llm/branch_summary.js';

function makeCache() {
  const store = new Map();
  return {
    makeKey: (text, provider, model, dim) => `${provider}:${model}:${dim}:${text}`,
    get: (key) => store.get(key) || null,
    set: (key, vec) => store.set(key, vec),
  };
}

describe('P2 cross-branch detection', () => {
  it('returns semantic matches above threshold', async () => {
    const prevThreshold = process.env.CROSS_BRANCH_SIMILARITY_THRESHOLD;
    process.env.CROSS_BRANCH_SIMILARITY_THRESHOLD = '0.6';

    const client = {
      query: vi.fn(async () => ({
        rows: [
          { branch_id: 'branch-a', summary: { overview: 'Postgres' }, summary_text: 'PostgreSQL tuning tips' },
          { branch_id: 'branch-b', summary: { overview: 'Frontend' }, summary_text: 'React performance notes' },
        ],
      })),
    };

    const embedder = vi.fn(async (text) => {
      if (text.toLowerCase().includes('postgres')) return [1, 0];
      if (text.toLowerCase().includes('react')) return [0, 1];
      return [0.2, 0.2];
    });

    const refs = await detectCrossBranchReferences(
      'postgres optimization',
      'branch-current',
      'tree-1',
      { client, embedder, cache: makeCache() }
    );

    if (typeof prevThreshold === 'undefined') delete process.env.CROSS_BRANCH_SIMILARITY_THRESHOLD;
    else process.env.CROSS_BRANCH_SIMILARITY_THRESHOLD = prevThreshold;

    expect(refs.length).toBe(1);
    expect(refs[0]).toMatchObject({ branchId: 'branch-a', referenceType: 'semantic' });
    expect(embedder).toHaveBeenCalled();
  });

  it('marks explicit reference type when keyword is present', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          { branch_id: 'branch-a', summary: { overview: 'DB' }, summary_text: 'Database indexes' },
        ],
      })),
    };

    const embedder = vi.fn(async () => [1, 0]);

    const refs = await detectCrossBranchReferences(
      '回到另一个分支的数据库方案',
      'branch-current',
      'tree-1',
      { client, embedder, cache: makeCache() }
    );

    expect(refs.length).toBe(1);
    expect(refs[0].referenceType).toBe('explicit');
  });

  it('returns explicit branch id without embeddings', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          {
            branch_id: 'branch-00000000-0000-0000-0000-000000000001-to-00000000-0000-0000-0000-000000000002',
            summary: { overview: 'DB' },
            summary_text: 'Database summary',
            updated_at: new Date().toISOString(),
          },
        ],
      })),
    };

    const embedder = vi.fn(async () => { throw new Error('embedding should not be called'); });
    const refs = await detectCrossBranchReferences(
      '请看这个分支 branch-00000000-0000-0000-0000-000000000001-to-00000000-0000-0000-0000-000000000002',
      'branch-current',
      'tree-1',
      { client, embedder, cache: makeCache() }
    );

    expect(refs.length).toBe(1);
    expect(refs[0].referenceType).toBe('explicit');
    expect(refs[0].score).toBe(1);
    expect(embedder).not.toHaveBeenCalled();
  });

  it('returns empty for short query without explicit mention', async () => {
    const prevMin = process.env.SEMANTIC_MIN_QUERY_LENGTH;
    process.env.SEMANTIC_MIN_QUERY_LENGTH = '5';

    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const refs = await detectCrossBranchReferences('hi', 'b', 't', { client, embedder: async () => [1, 0], cache: makeCache() });

    if (typeof prevMin === 'undefined') delete process.env.SEMANTIC_MIN_QUERY_LENGTH;
    else process.env.SEMANTIC_MIN_QUERY_LENGTH = prevMin;

    expect(refs.length).toBe(0);
  });
});
