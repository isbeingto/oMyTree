import crypto from 'crypto';
import { recordPromptCacheUsage } from './prompt_cache_metrics.js';

const PROMPT_CACHING_ENABLED_FLAG = (process.env.PROMPT_CACHING_ENABLED || '1').toLowerCase();
const PROMPT_CACHING_ENABLED = !['0', 'false', 'no', 'off'].includes(PROMPT_CACHING_ENABLED_FLAG);
const PROMPT_CACHE_MIN_TOKENS = Number.parseInt(process.env.PROMPT_CACHE_MIN_TOKENS || '1024', 10);
const PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN = Number.parseInt(
  process.env.PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN || '5',
  10
);
const PROMPT_CACHE_ENABLE_METRICS_FLAG = (process.env.PROMPT_CACHE_ENABLE_METRICS || '1').toLowerCase();
const PROMPT_CACHE_ENABLE_METRICS = !['0', 'false', 'no', 'off'].includes(PROMPT_CACHE_ENABLE_METRICS_FLAG);
const PROMPT_CACHE_PROVIDER_WHITELIST = (process.env.PROMPT_CACHE_PROVIDER_WHITELIST || '').trim();

const SUPPORTED_PROVIDERS = new Set(['openai_native', 'anthropic']);

function parseWhitelist(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const PROVIDER_WHITELIST = parseWhitelist(PROMPT_CACHE_PROVIDER_WHITELIST);

export function getPromptCacheConfig() {
  return {
    enabled: PROMPT_CACHING_ENABLED,
    minTokens: Number.isFinite(PROMPT_CACHE_MIN_TOKENS) && PROMPT_CACHE_MIN_TOKENS > 0
      ? PROMPT_CACHE_MIN_TOKENS
      : 1024,
    roundingMinutes: Number.isFinite(PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN) && PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN > 0
      ? PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN
      : 5,
    metricsEnabled: PROMPT_CACHE_ENABLE_METRICS,
    whitelist: [...PROVIDER_WHITELIST],
  };
}

export function estimatePromptTokensFromMessages(messages = []) {
  if (!Array.isArray(messages)) return 0;
  let chars = 0;
  for (const msg of messages) {
    if (!msg) continue;
    const content = msg.content;
    if (typeof content === 'string') {
      chars += content.length;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block?.text === 'string') {
          chars += block.text.length;
        } else if (typeof block?.content === 'string') {
          chars += block.content.length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

export function isPromptCachingEnabled({ providerKind, providerName, promptTokens } = {}) {
  if (!PROMPT_CACHING_ENABLED) return false;
  const normalizedProvider = typeof providerName === 'string' ? providerName.trim().toLowerCase() : '';
  const normalizedKind = typeof providerKind === 'string' ? providerKind.trim().toLowerCase() : '';
  if (PROVIDER_WHITELIST.length > 0) {
    const allowed = PROVIDER_WHITELIST.includes(normalizedKind) || PROVIDER_WHITELIST.includes(normalizedProvider);
    if (!allowed) return false;
  }
  if (!SUPPORTED_PROVIDERS.has(normalizedKind)) return false;
  if (Number.isFinite(promptTokens) && promptTokens > 0 && promptTokens < PROMPT_CACHE_MIN_TOKENS) {
    return false;
  }
  return true;
}

export function buildPromptCacheKey(payload = {}) {
  const json = JSON.stringify(payload);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

export function roundPromptCacheTimestamp(value, roundingMinutes = PROMPT_CACHE_TIMESTAMP_ROUNDING_MIN) {
  const ms = value instanceof Date ? value.getTime() : (typeof value === 'number' ? value : Date.parse(value));
  if (!Number.isFinite(ms)) return null;
  const roundingMs = Math.max(1, roundingMinutes) * 60 * 1000;
  const rounded = Math.floor(ms / roundingMs) * roundingMs;
  return new Date(rounded).toISOString();
}

export function buildAnthropicSystemPayload(systemText, cacheEnabled) {
  if (!systemText) {
    return { system: null, cacheApplied: false };
  }
  if (!cacheEnabled) {
    return { system: systemText, cacheApplied: false };
  }
  return {
    system: [
      { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
    ],
    cacheApplied: true,
  };
}

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function extractPromptCacheUsage({ providerKind, usage } = {}) {
  const raw = usage?.raw || usage || {};
  const kind = typeof providerKind === 'string' ? providerKind.trim().toLowerCase() : '';

  if (kind === 'anthropic') {
    return {
      cacheReadTokens: normalizeNumber(
        raw?.cache_read_input_tokens ?? raw?.cacheReadInputTokens ?? raw?.cache_read_tokens
      ),
      cacheWriteTokens: normalizeNumber(
        raw?.cache_creation_input_tokens ?? raw?.cacheCreationInputTokens ?? raw?.cache_write_tokens
      ),
    };
  }

  const details = raw?.prompt_tokens_details || raw?.input_tokens_details || {};
  return {
    cacheReadTokens: normalizeNumber(
      details?.cached_tokens ?? raw?.cached_tokens ?? raw?.cachedTokens ?? raw?.cache_read_tokens
    ),
    cacheWriteTokens: 0,
  };
}

export function recordPromptCacheMetrics({
  providerKind,
  providerName,
  model,
  usage,
  promptTokens,
  cacheApplied = false,
} = {}) {
  if (!PROMPT_CACHE_ENABLE_METRICS) return;
  const { cacheReadTokens, cacheWriteTokens } = extractPromptCacheUsage({ providerKind, usage });
  if (!cacheApplied && cacheReadTokens <= 0 && cacheWriteTokens <= 0) return;
  const provider = typeof providerKind === 'string' && providerKind.trim()
    ? providerKind
    : (providerName || 'unknown');
  recordPromptCacheUsage({
    provider,
    model,
    cacheReadTokens,
    cacheWriteTokens,
    promptTokens,
    cacheApplied,
  });
}

export default {
  getPromptCacheConfig,
  estimatePromptTokensFromMessages,
  isPromptCachingEnabled,
  buildPromptCacheKey,
  roundPromptCacheTimestamp,
  buildAnthropicSystemPayload,
  extractPromptCacheUsage,
  recordPromptCacheMetrics,
};
