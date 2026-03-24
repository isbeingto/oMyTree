import { describe, it, expect, vi } from 'vitest';

import { shouldUpdateBranchSummary, generateBranchSummary } from '../services/llm/branch_summary.js';

describe('P2 branch summary update/generate', () => {
  it('shouldUpdateBranchSummary requires min turns for new branch', async () => {
    const prevMin = process.env.BRANCH_SUMMARY_MIN_TURNS;
    process.env.BRANCH_SUMMARY_MIN_TURNS = '5';

    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const resLow = await shouldUpdateBranchSummary('t1', 'b1', 4, client);
    const resHigh = await shouldUpdateBranchSummary('t1', 'b1', 5, client);

    if (typeof prevMin === 'undefined') delete process.env.BRANCH_SUMMARY_MIN_TURNS;
    else process.env.BRANCH_SUMMARY_MIN_TURNS = prevMin;

    expect(resLow.needsUpdate).toBe(false);
    expect(resHigh.needsUpdate).toBe(true);
  });

  it('shouldUpdateBranchSummary updates when new nodes exceed threshold', async () => {
    const prevThreshold = process.env.BRANCH_SUMMARY_UPDATE_THRESHOLD;
    process.env.BRANCH_SUMMARY_UPDATE_THRESHOLD = '5';

    const client = {
      query: vi.fn(async () => ({
        rows: [
          {
            summary: { overview: 'x', key_points: [], conclusions: '', open_questions: [] },
            summary_text: 'Topic: x',
            node_count: 10,
            total_tokens: 123,
            updated_at: new Date().toISOString(),
            summarized_at: new Date().toISOString(),
          },
        ],
      })),
    };

    const res = await shouldUpdateBranchSummary('t1', 'b1', 14, client);
    const res2 = await shouldUpdateBranchSummary('t1', 'b1', 15, client);

    if (typeof prevThreshold === 'undefined') delete process.env.BRANCH_SUMMARY_UPDATE_THRESHOLD;
    else process.env.BRANCH_SUMMARY_UPDATE_THRESHOLD = prevThreshold;

    expect(res.needsUpdate).toBe(false);
    expect(res2.needsUpdate).toBe(true);
    expect(res2.existingNodeCount).toBe(10);
  });

  it('generateBranchSummary upserts parsed JSON and returns updated=true', async () => {
    const client = {
      query: vi.fn(async (sql) => {
        const q = String(sql);
        if (q.includes('FROM nodes')) {
          return {
            rows: [
              { id: '00000000-0000-0000-0000-000000000001', role: 'user', text: 'Hello', level: 1 },
              { id: '00000000-0000-0000-0000-000000000002', role: 'ai', text: 'Hi', level: 2 },
              { id: '00000000-0000-0000-0000-000000000003', role: 'user', text: 'Need summary', level: 3 },
              { id: '00000000-0000-0000-0000-000000000004', role: 'ai', text: 'Ok', level: 4 },
              { id: '00000000-0000-0000-0000-000000000005', role: 'user', text: 'More', level: 5 },
            ],
          };
        }
        if (q.includes('INSERT INTO branch_summaries')) {
          return { rows: [] };
        }
        throw new Error('unexpected query');
      }),
    };

    const provider = {
      callChat: vi.fn(async ({ prompt }) => {
        expect(String(prompt)).toContain('Conversation turns:');
        return {
          ai_text: '{"overview":"Branch topic","key_points":["K1"],"conclusions":"","open_questions":[]}',
          usage_json: { total_tokens: 77 },
          model: 'gpt-x',
        };
      }),
    };

    const providerResolver = vi.fn(async () => ({ provider, name: 'mock', defaultModel: 'gpt-x' }));

    const res = await generateBranchSummary({
      treeId: '00000000-0000-0000-0000-0000000000aa',
      branchId: 'branch-1',
      branchNodes: [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005',
      ],
      branchPoint: '00000000-0000-0000-0000-000000000001',
      existingSummary: null,
      existingNodeCount: 0,
      client,
      providerResolver,
      userLanguage: 'en',
    });

    expect(res.updated).toBe(true);
    expect(res.nodeCount).toBe(5);
    expect(res.totalTokens).toBe(77);
    expect(res.summary).toMatchObject({ overview: 'Branch topic' });
    expect(res.summaryText).toContain('Topic: Branch topic');
    expect(provider.callChat).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalled();
  });

  it('generateBranchSummary incremental prompt includes only new turns', async () => {
    const client = {
      query: vi.fn(async (sql) => {
        const q = String(sql);
        if (q.includes('FROM nodes')) {
          return {
            rows: [
              { id: '00000000-0000-0000-0000-000000000010', role: 'user', text: 'Old', level: 1 },
              { id: '00000000-0000-0000-0000-000000000011', role: 'ai', text: 'Old answer', level: 2 },
              { id: '00000000-0000-0000-0000-000000000012', role: 'user', text: 'New question', level: 3 },
              { id: '00000000-0000-0000-0000-000000000013', role: 'ai', text: 'New answer', level: 4 },
              { id: '00000000-0000-0000-0000-000000000014', role: 'user', text: 'More new', level: 5 },
            ],
          };
        }
        if (q.includes('INSERT INTO branch_summaries')) {
          return { rows: [] };
        }
        throw new Error('unexpected query');
      }),
    };

    const provider = {
      callChat: vi.fn(async ({ prompt }) => {
        const p = String(prompt);
        expect(p).toContain('EXISTING summary (JSON):');
        expect(p).toContain('New question');
        expect(p).toContain('New answer');
        expect(p).toContain('More new');
        // Existing turn content should not appear in "NEW turns" section
        const newSection = p.split('NEW turns to integrate:')[1] || '';
        expect(newSection).not.toContain('Old answer');

        return {
          ai_text: '{"overview":"x","key_points":[],"conclusions":"","open_questions":[]}',
          usage_json: { total_tokens: 10 },
          model: 'gpt-x',
        };
      }),
    };

    const providerResolver = vi.fn(async () => ({ provider, name: 'mock', defaultModel: 'gpt-x' }));

    const res = await generateBranchSummary({
      treeId: '00000000-0000-0000-0000-0000000000bb',
      branchId: 'branch-2',
      branchNodes: [
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000012',
        '00000000-0000-0000-0000-000000000013',
        '00000000-0000-0000-0000-000000000014',
      ],
      branchPoint: '00000000-0000-0000-0000-000000000010',
      existingSummary: { overview: 'old', key_points: [], conclusions: '', open_questions: [] },
      existingNodeCount: 2,
      client,
      providerResolver,
      userLanguage: 'en',
    });

    expect(res.updated).toBe(true);
    expect(provider.callChat).toHaveBeenCalledTimes(1);
  });

  it('generateBranchSummary falls back to provider-compatible model when env model mismatches provider', async () => {
    const prevModel = process.env.BRANCH_SUMMARY_LLM_MODEL;
    process.env.BRANCH_SUMMARY_LLM_MODEL = 'gpt-4o-mini';

    const client = {
      query: vi.fn(async (sql) => {
        const q = String(sql);
        if (q.includes('FROM nodes')) {
          return {
            rows: [
              { id: '00000000-0000-0000-0000-000000000101', role: 'user', text: 'Hello', level: 1 },
              { id: '00000000-0000-0000-0000-000000000102', role: 'ai', text: 'Hi', level: 2 },
              { id: '00000000-0000-0000-0000-000000000103', role: 'user', text: 'Need summary', level: 3 },
              { id: '00000000-0000-0000-0000-000000000104', role: 'ai', text: 'Ok', level: 4 },
              { id: '00000000-0000-0000-0000-000000000105', role: 'user', text: 'More', level: 5 },
            ],
          };
        }
        if (q.includes('INSERT INTO branch_summaries')) {
          return { rows: [] };
        }
        throw new Error('unexpected query');
      }),
    };

    const provider = {
      callChat: vi.fn(async ({ options }) => {
        expect(options.model).toBe('gemini-3-flash-preview');
        return {
          ai_text: '{"overview":"Branch topic","key_points":["K1"],"conclusions":"","open_questions":[]}',
          usage_json: { total_tokens: 11 },
          model: options.model,
        };
      }),
    };

    const providerResolver = vi.fn(async () => ({
      provider,
      name: 'google',
      providerKind: 'gemini',
      defaultModel: 'gemini-3-flash-preview',
    }));

    const res = await generateBranchSummary({
      treeId: '00000000-0000-0000-0000-0000000000cc',
      branchId: 'branch-3',
      branchNodes: [
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000104',
        '00000000-0000-0000-0000-000000000105',
      ],
      branchPoint: '00000000-0000-0000-0000-000000000101',
      existingSummary: null,
      existingNodeCount: 0,
      client,
      providerResolver,
      userLanguage: 'en',
    });

    if (typeof prevModel === 'undefined') delete process.env.BRANCH_SUMMARY_LLM_MODEL;
    else process.env.BRANCH_SUMMARY_LLM_MODEL = prevModel;

    expect(res.updated).toBe(true);
    expect(provider.callChat).toHaveBeenCalledTimes(1);
  });
});
