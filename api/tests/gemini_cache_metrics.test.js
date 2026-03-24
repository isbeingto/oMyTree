import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetGeminiCacheMetrics,
  recordGeminiCacheUsage,
  buildGeminiCacheMetricsLines,
} from '../services/llm/gemini_cache_metrics.js';

/**
 * Phase 4.1: Cache metrics
 */

describe('gemini cache metrics (Phase 4.1)', () => {
  beforeEach(() => {
    resetGeminiCacheMetrics();
  });

  it('records requests and cache hits by model', () => {
    recordGeminiCacheUsage({ model: 'gemini-2.5-flash', usage: { cachedTokens: 0 } });
    recordGeminiCacheUsage({ model: 'gemini-2.5-flash', usage: { cachedTokens: 12 } });
    recordGeminiCacheUsage({ model: 'gemini-2.5-pro', usage: { cachedTokens: 3 } });

    const lines = buildGeminiCacheMetricsLines().join('\n');

    expect(lines).toMatch(/llm_gemini_requests_total\{model="gemini-2\.5-flash"\} 2/);
    expect(lines).toMatch(/llm_gemini_cache_hits_total\{model="gemini-2\.5-flash"\} 1/);
    expect(lines).toMatch(/llm_gemini_cached_tokens_total\{model="gemini-2\.5-flash"\} 12/);

    expect(lines).toMatch(/llm_gemini_requests_total\{model="gemini-2\.5-pro"\} 1/);
    expect(lines).toMatch(/llm_gemini_cache_hits_total\{model="gemini-2\.5-pro"\} 1/);
    expect(lines).toMatch(/llm_gemini_cached_tokens_total\{model="gemini-2\.5-pro"\} 3/);
  });
});
