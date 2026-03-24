/**
 * Phase 4.1: Gemini Context Caching metrics
 *
 * Tracks cache-hit statistics using Gemini's usageMetadata.cachedContentTokenCount.
 * Exported in Prometheus text format and included in /metrics.
 */

const store = new Map();

function getEntry(model) {
  const key = typeof model === 'string' && model.trim().length > 0 ? model.trim() : 'unknown';
  if (!store.has(key)) {
    store.set(key, {
      model: key,
      requests_total: 0,
      cache_hits_total: 0,
      cached_tokens_total: 0,
    });
  }
  return store.get(key);
}

/**
 * @param {object} params
 * @param {string} params.model
 * @param {{cachedTokens?: number|null}|null|undefined} params.usage
 */
export function recordGeminiCacheUsage({ model, usage }) {
  const entry = getEntry(model);
  entry.requests_total += 1;

  const cachedTokens = Number.isFinite(usage?.cachedTokens)
    ? Number(usage.cachedTokens)
    : 0;

  if (cachedTokens > 0) {
    entry.cache_hits_total += 1;
    entry.cached_tokens_total += cachedTokens;
  }
}

export function resetGeminiCacheMetrics() {
  store.clear();
}

export function getGeminiCacheMetricsSnapshot() {
  const snapshot = {};
  for (const [model, entry] of store) {
    snapshot[model] = { ...entry };
  }
  return snapshot;
}

export function buildGeminiCacheMetricsLines() {
  const lines = [
    '## llm_gemini_cache',
    '# HELP llm_gemini_requests_total Total number of Gemini requests observed',
    '# TYPE llm_gemini_requests_total counter',
  ];

  for (const [_key, entry] of store) {
    lines.push(`llm_gemini_requests_total{model="${entry.model}"} ${entry.requests_total}`);
  }

  lines.push(
    '',
    '# HELP llm_gemini_cache_hits_total Total number of Gemini requests with cachedContentTokenCount > 0',
    '# TYPE llm_gemini_cache_hits_total counter',
  );

  for (const [_key, entry] of store) {
    lines.push(`llm_gemini_cache_hits_total{model="${entry.model}"} ${entry.cache_hits_total}`);
  }

  lines.push(
    '',
    '# HELP llm_gemini_cached_tokens_total Total cached tokens reported by Gemini (cachedContentTokenCount)',
    '# TYPE llm_gemini_cached_tokens_total counter',
  );

  for (const [_key, entry] of store) {
    lines.push(`llm_gemini_cached_tokens_total{model="${entry.model}"} ${entry.cached_tokens_total}`);
  }

  return lines;
}
