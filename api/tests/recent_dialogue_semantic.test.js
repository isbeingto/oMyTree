import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../services/semantic/embeddings.js', () => ({
  embedText: (text) => {
    // Simple 2d encoding: python dimension vs food dimension
    const lower = (text || '').toLowerCase();
    if (lower.includes('python') || lower.includes('编程')) return [1, 0];
    if (lower.includes('火锅')) return [0, 1];
    return [0.5, 0.5];
  },
}));

import { selectRecentDialogueSemantic } from '../services/llm/recent_dialogue_semantic.js';

describe('semantic recent dialogue selection', () => {
  // P1-05: Disable neighbor expansion and use pure semantic for deterministic tests
  beforeAll(() => {
    process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED = 'false';
    process.env.SEMANTIC_SCORE_WEIGHT = '1.0';
  });

  afterAll(() => {
    delete process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED;
    delete process.env.SEMANTIC_SCORE_WEIGHT;
  });

  const turns = [
    { role: 'user', text: '我喜欢火锅' },
    { role: 'assistant', text: '好的，记录火锅偏好' },
    { role: 'user', text: '我想系统学 Python 编程' },
    { role: 'assistant', text: '可以从基础语法开始' },
    { role: 'user', text: '再聊聊刷题' },
  ];

  it('prefers programming turns when query is about Python', async () => {
    const picked = await selectRecentDialogueSemantic({
      turns,
      userText: '怎么系统学 Python？',
      profile: 'standard',
      limit: 3,
    });
    const texts = picked.map((t) => t.text);
    expect(texts.some((t) => t.includes('Python'))).toBe(true);
    expect(texts[0]).toContain('我想系统学 Python 编程');
  });

  it('keeps semantic hits when neighbor expansion exceeds limit', async () => {
    const originalExpandEnabled = process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED;
    const originalExpand = process.env.SEMANTIC_NEIGHBOR_EXPAND;
    process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED = 'true';
    process.env.SEMANTIC_NEIGHBOR_EXPAND = '1';

    const spacedTurns = [
      { role: 'user', text: 'noise 0' },
      { role: 'assistant', text: 'noise 1' },
      { role: 'user', text: 'python A 编程' },
      { role: 'assistant', text: 'noise 3' },
      { role: 'user', text: 'noise 4' },
      { role: 'assistant', text: 'python B programming' },
      { role: 'user', text: 'noise 6' },
    ];

    const picked = await selectRecentDialogueSemantic({
      turns: spacedTurns,
      userText: 'Python 学习路线',
      profile: 'lite',
      limit: 3,
    });

    const texts = picked.map((t) => t.text.toLowerCase());
    expect(texts.some((t) => t.includes('python a'))).toBe(true);
    expect(texts.some((t) => t.includes('python b'))).toBe(true);

    if (originalExpandEnabled === undefined) delete process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED;
    else process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED = originalExpandEnabled;
    if (originalExpand === undefined) delete process.env.SEMANTIC_NEIGHBOR_EXPAND;
    else process.env.SEMANTIC_NEIGHBOR_EXPAND = originalExpand;
  });

  it('falls back to recency when disabled', async () => {
    const original = process.env.RECENT_DIALOGUE_SEMANTIC_ENABLED;
    process.env.RECENT_DIALOGUE_SEMANTIC_ENABLED = 'false';
    const mod = await import('../services/llm/recent_dialogue_semantic.js');
    const picked = await mod.selectRecentDialogueSemantic({
      turns,
      userText: '怎么系统学 Python？',
      profile: 'lite',
      limit: 2,
    });
    const texts = picked.map((t) => t.text);
    expect(texts).toEqual(turns.slice(0, 2).map((t) => t.text));
    process.env.RECENT_DIALOGUE_SEMANTIC_ENABLED = original;
  });
});
