import { describe, it, expect } from 'vitest';
import { buildLearningReport } from './reportUtils';

const sampleNodes = [
  { id: 'r', parent_id: null, level: 0, role: 'user', text: 'root question' },
  { id: 'a1', parent_id: 'r', level: 1, role: 'ai', text: 'answer 1' },
  { id: 'u2', parent_id: 'r', level: 1, role: 'user', text: 'branch question' },
  { id: 'a2', parent_id: 'u2', level: 2, role: 'ai', text: 'branch answer' },
];

describe('buildLearningReport', () => {
  it('builds summary line and markdown with metrics', () => {
    const { summaryLine, markdown, branchNodes } = buildLearningReport({
      tree: { name: 'Test Tree', topic: 'Testing', created_at: '2024-01-01T00:00:00.000Z' },
      metrics: {
        version: 'v1',
        tree_id: 't1',
        node_count: 4,
        depth_max: 2,
        branch_node_count: 1,
        user_question_count: 2,
        ai_answer_count: 2,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      },
      nodes: sampleNodes as any,
    });

    expect(summaryLine).toContain('Testing');
    expect(summaryLine).toContain('branching');
    expect(branchNodes.length).toBeGreaterThanOrEqual(1);
    expect(markdown).toContain('# Learning report for');
    expect(markdown).toContain('Total nodes');
  });

  it('handles missing metrics gracefully', () => {
    const { summaryLine, mainPathLength } = buildLearningReport({
      tree: { name: 'No Metrics' },
      metrics: null,
      nodes: sampleNodes as any,
    });
    expect(mainPathLength).toBeGreaterThan(0);
    expect(summaryLine).toContain('No Metrics');
  });
});
