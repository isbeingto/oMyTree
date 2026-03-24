import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetPromptCacheMetrics,
  recordPromptCacheUsage,
  buildPromptCacheMetricsLines,
} from '../services/llm/prompt_cache_metrics.js';

describe('prompt cache metrics (P3)', () => {
  beforeEach(() => {
    resetPromptCacheMetrics();
  });

  it('records hits, misses, and tokens by provider/model', () => {
    recordPromptCacheUsage({
      provider: 'openai_native',
      model: 'gpt-4',
      cacheReadTokens: 120,
      cacheApplied: true,
    });
    recordPromptCacheUsage({
      provider: 'openai_native',
      model: 'gpt-4',
      cacheReadTokens: 0,
      cacheApplied: true,
    });
    recordPromptCacheUsage({
      provider: 'anthropic',
      model: 'claude-3',
      cacheWriteTokens: 200,
      cacheApplied: true,
    });

    const text = buildPromptCacheMetricsLines().join('\n');

    expect(text).toContain('## llm_prompt_cache');
    expect(text).toContain('omytree_prompt_cache_requests_total{provider="openai_native",model="gpt-4"} 2');
    expect(text).toContain('omytree_prompt_cache_hits_total{provider="openai_native",model="gpt-4"} 1');
    expect(text).toContain('omytree_prompt_cache_misses_total{provider="openai_native",model="gpt-4"} 1');
    expect(text).toContain('omytree_prompt_cache_read_tokens_total{provider="openai_native",model="gpt-4"} 120');
    expect(text).toContain('omytree_prompt_cache_write_tokens_total{provider="openai_native",model="gpt-4"} 0');

    expect(text).toContain('omytree_prompt_cache_requests_total{provider="anthropic",model="claude-3"} 1');
    expect(text).toContain('omytree_prompt_cache_hits_total{provider="anthropic",model="claude-3"} 0');
    expect(text).toContain('omytree_prompt_cache_misses_total{provider="anthropic",model="claude-3"} 1');
    expect(text).toContain('omytree_prompt_cache_write_tokens_total{provider="anthropic",model="claude-3"} 200');
  });
});
