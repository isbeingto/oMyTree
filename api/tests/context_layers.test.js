import { describe, it, expect } from 'vitest';
import { buildLayeredContextSections, truncateBySentence } from '../services/llm/context_layers.js';

describe('truncateBySentence', () => {
  it('keeps sentence boundary when truncating', () => {
    const text = '你好。你今天好吗？我很好。';
    const result = truncateBySentence(text, 12);
    expect(result.endsWith('？…')).toBe(true);
    expect(result.includes('你好。')).toBe(true);
    expect(result).not.toContain('我很好');
  });
});

describe('buildLayeredContextSections', () => {
  it('deduplicates core facts and path background when summaries overlap', async () => {
    const sections = await buildLayeredContextSections({
      scope: 'branch',
      breadcrumbTitles: ['A', 'B', 'C'],
      pathSummary: 'Alice 在学习编程，来自北京。',
      parentSummary: 'Alice 在学习编程，来自北京。',
      parentFullText: '',
      treeSummary: '',
      recentTurns: [{ role: 'assistant', text: 'Alice 在学习编程，来自北京。' }],
      limits: { pathSummary: 80, parentSummary: 80, parentFull: 0, recentTurns: 2 },
    });

    expect(sections.core_facts).toHaveLength(1);
    expect(sections.path_background).toBeNull();
    expect(sections.recent_dialogue).toHaveLength(0);
  });

  it('falls back to compact breadcrumbs when summaries are empty', async () => {
    const sections = await buildLayeredContextSections({
      scope: 'branch',
      breadcrumbTitles: ['Root', 'Child', 'Leaf'],
      pathSummary: '',
      parentSummary: '',
      parentFullText: '',
      treeSummary: '',
      recentTurns: [],
      limits: { pathSummary: 50, parentSummary: 50, parentFull: 0, recentTurns: 0 },
    });

    expect(sections.path_background).toBe('Root / Child / Leaf');
  });
});
