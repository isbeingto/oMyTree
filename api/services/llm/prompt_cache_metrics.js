const metrics = new Map();

function normalizeLabel(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function getKey(provider, model) {
  const p = normalizeLabel(provider);
  const m = normalizeLabel(model);
  return `${p}::${m}`;
}

function ensureEntry(provider, model) {
  const key = getKey(provider, model);
  if (!metrics.has(key)) {
    metrics.set(key, {
      provider: normalizeLabel(provider),
      model: normalizeLabel(model),
      requests_total: 0,
      cache_hits_total: 0,
      cache_misses_total: 0,
      cache_read_tokens_total: 0,
      cache_write_tokens_total: 0,
      prompt_tokens_total: 0,
    });
  }
  return metrics.get(key);
}

export function resetPromptCacheMetrics() {
  metrics.clear();
}

export function recordPromptCacheUsage({
  provider,
  model,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  promptTokens = null,
  cacheApplied = false,
} = {}) {
  if (!provider) return;
  const entry = ensureEntry(provider, model);
  entry.requests_total += 1;

  if (cacheApplied) {
    if (cacheReadTokens > 0) {
      entry.cache_hits_total += 1;
    } else {
      entry.cache_misses_total += 1;
    }
  }

  if (Number.isFinite(cacheReadTokens) && cacheReadTokens > 0) {
    entry.cache_read_tokens_total += cacheReadTokens;
  }
  if (Number.isFinite(cacheWriteTokens) && cacheWriteTokens > 0) {
    entry.cache_write_tokens_total += cacheWriteTokens;
  }
  if (Number.isFinite(promptTokens) && promptTokens > 0) {
    entry.prompt_tokens_total += promptTokens;
  }
}

export function buildPromptCacheMetricsLines() {
  const lines = [
    '## llm_prompt_cache',
    '# HELP omytree_prompt_cache_requests_total Total prompt cache requests',
    '# TYPE omytree_prompt_cache_requests_total counter',
    '# HELP omytree_prompt_cache_hits_total Total prompt cache hits',
    '# TYPE omytree_prompt_cache_hits_total counter',
    '# HELP omytree_prompt_cache_misses_total Total prompt cache misses',
    '# TYPE omytree_prompt_cache_misses_total counter',
    '# HELP omytree_prompt_cache_read_tokens_total Total prompt cache read tokens',
    '# TYPE omytree_prompt_cache_read_tokens_total counter',
    '# HELP omytree_prompt_cache_write_tokens_total Total prompt cache write tokens',
    '# TYPE omytree_prompt_cache_write_tokens_total counter',
    '# HELP omytree_prompt_cache_hit_rate Prompt cache hit rate',
    '# TYPE omytree_prompt_cache_hit_rate gauge',
  ];

  const entries = Array.from(metrics.values()).sort((a, b) => {
    if (a.provider === b.provider) return a.model.localeCompare(b.model);
    return a.provider.localeCompare(b.provider);
  });

  for (const entry of entries) {
    const label = `provider="${entry.provider}",model="${entry.model}"`;
    lines.push(`omytree_prompt_cache_requests_total{${label}} ${entry.requests_total}`);
    lines.push(`omytree_prompt_cache_hits_total{${label}} ${entry.cache_hits_total}`);
    lines.push(`omytree_prompt_cache_misses_total{${label}} ${entry.cache_misses_total}`);
    lines.push(`omytree_prompt_cache_read_tokens_total{${label}} ${entry.cache_read_tokens_total}`);
    lines.push(`omytree_prompt_cache_write_tokens_total{${label}} ${entry.cache_write_tokens_total}`);
    const denom = entry.cache_hits_total + entry.cache_misses_total;
    const hitRate = denom > 0 ? (entry.cache_hits_total / denom) : 0;
    lines.push(`omytree_prompt_cache_hit_rate{${label}} ${hitRate}`);
  }

  return lines;
}

export default {
  resetPromptCacheMetrics,
  recordPromptCacheUsage,
  buildPromptCacheMetricsLines,
};
