import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../services/semantic/embeddings.js', () => ({
  embedText: (text) => {
    const lower = (text || '').toLowerCase();
    if (lower.includes('编程') || lower.includes('coding')) return [1, 0];
    return [0, 1];
  },
}));

import { buildContextMessages } from '../services/llm/index.js';

describe('semantic core facts (experimental)', () => {
  let originalFlag;
  beforeAll(() => {
    originalFlag = process.env.SEMANTIC_CORE_FACTS_ENABLED;
    process.env.SEMANTIC_CORE_FACTS_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.SEMANTIC_CORE_FACTS_ENABLED = originalFlag;
  });

  it('prioritizes coding-related facts and path background', async () => {
    const messages = await buildContextMessages({
      tree_id: 'tree-sem',
      user_text: '如何系统学编程？',
      root_topic: '学习',
      path_summary: '火锅路径摘要',
      parent_summary: '编程学习计划与练习步骤',
      parent_full_text: '火锅历史与文化笔记',
      breadcrumb_titles: ['学习', '编程', '练习'],
      recent_turns: [],
      context_profile: 'standard',
      memory_scope: 'branch',
      user_language: 'zh',
    }, { semanticCoreFactsEnabled: true });

    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeTruthy();
    const content = system.content;
    expect(content).toContain('编程学习计划与练习步骤');
    expect(content.indexOf('编程学习计划与练习步骤')).toBeGreaterThanOrEqual(0);
    // Path background should favor breadcrumb with 编程 over火锅摘要
    expect(content).toContain('学习 / 编程 / 练习');
    // Ensure coding fact appears before firepot fact if both present
    const idxCode = content.indexOf('编程学习计划与练习步骤');
    const idxHotpot = content.indexOf('火锅历史与文化笔记');
    if (idxHotpot !== -1) {
      expect(idxCode).toBeLessThan(idxHotpot);
    }
  });
});
