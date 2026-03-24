import { describe, it, expect } from 'vitest';
import {
  buildPromptCacheKey,
  roundPromptCacheTimestamp,
  estimatePromptTokensFromMessages,
} from '../services/llm/prompt_cache.js';

describe('prompt cache helpers (P3)', () => {
  it('builds stable cache keys', () => {
    const keyA = buildPromptCacheKey({ scope: 'system', content: 'hello' });
    const keyB = buildPromptCacheKey({ scope: 'system', content: 'hello' });
    const keyC = buildPromptCacheKey({ scope: 'system', content: 'world' });
    expect(keyA).toHaveLength(16);
    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('rounds timestamps to the given interval', () => {
    const rounded = roundPromptCacheTimestamp('2026-01-27T12:07:59Z', 5);
    expect(rounded).toBe('2026-01-27T12:05:00.000Z');
  });

  it('estimates tokens from message content', () => {
    const estimate = estimatePromptTokensFromMessages([
      { role: 'system', content: 'abcd' },
      { role: 'user', content: 'abcd' },
    ]);
    expect(estimate).toBe(2);
  });
});
