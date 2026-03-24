import { describe, it, expect, vi } from 'vitest';

import { identifyBranch } from '../services/llm/branch_summary.js';

describe('P2 identifyBranch', () => {
  it('throws NODE_NOT_FOUND when node is missing', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(identifyBranch('n1', 't1', client)).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('falls back to root when there is no fork', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          { id: 'root', parent_id: null, depth: 2, children_count: 1 },
          { id: 'a1', parent_id: 'root', depth: 1, children_count: 1 },
          { id: 'a2', parent_id: 'a1', depth: 0, children_count: 0 },
        ],
      })),
    };

    const res = await identifyBranch('a2', 't1', client);
    expect(res).toMatchObject({
      branchPoint: 'root',
      branchRootNodeId: 'root',
      branchTipNodeId: 'a2',
      branchNodes: ['root', 'a1', 'a2'],
      branchId: 'branch-root-to-a2',
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('selects nearest fork ancestor as branch point', async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [
          { id: 'root', parent_id: null, depth: 3, children_count: 2 },
          { id: 'a1', parent_id: 'root', depth: 2, children_count: 2 },
          { id: 'a2', parent_id: 'a1', depth: 1, children_count: 1 },
          { id: 'leaf', parent_id: 'a2', depth: 0, children_count: 0 },
        ],
      })),
    };

    const res = await identifyBranch('leaf', 't1', client);
    expect(res).toMatchObject({
      branchPoint: 'a1',
      branchRootNodeId: 'a1',
      branchTipNodeId: 'leaf',
      branchNodes: ['a1', 'a2', 'leaf'],
      branchId: 'branch-a1-to-leaf',
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

