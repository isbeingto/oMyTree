// Centralized model policy/whitelist rules.
// Keep this small and deterministic; it is used by both BYOK and platform-default paths.
//
// Whitelist strategy:
// - Only include latest-generation models that fully support our features
//   (thinking chain / extended thinking, File API with images + PDF)
// - Exact match for models with stable IDs (OpenAI, Gemini)
// - Prefix match for date-versioned models (Anthropic claude-*-YYYYMMDD)
//
// Deliberately excluded:
// - OpenAI GPT-4o / 4o-mini: retiring from ChatGPT on 2026-02-13, superseded by GPT-5.x
// - OpenAI Codex models: this is not a coding platform
// - Anthropic Claude 3.0 / 3.5: no extended thinking support
// - Anthropic Claude 3.7: transitional generation, superseded by Claude 4.x

/**
 * Exact-match whitelist: model key must appear in the Set.
 */
const EXACT_WHITELIST = {
  google: new Set([
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3-pro-image-preview',
  ]),
  gemini: new Set([
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3-pro-image-preview',
  ]),
  openai: new Set([
    // GPT-5.x family (latest generation, full feature support)
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-5.1',
    'gpt-5',
    'gpt-5-mini',
    // GPT-4.1 family (current generation, vision + PDF + reasoning)
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
  ]),
};

/**
 * Prefix whitelist: model key must start with one of these prefixes.
 * Used for providers with date-versioned model IDs (e.g. claude-opus-4-20250514).
 *
 * Claude 4.x: full support — extended thinking (adaptive for Opus 4.6+),
 * File API (images + PDF), Files API beta for upload-once-use-many.
 */
const PREFIX_WHITELIST = {
  anthropic: [
    // Claude 4.x Opus (flagship, supports adaptive thinking for 4.6+)
    'claude-opus-4',
    // Claude 4.x Sonnet (balanced performance)
    'claude-sonnet-4',
    // Claude 4.x Haiku (fast, cost-effective, supports thinking for 4.5+)
    'claude-haiku-4',
  ],
};

export function isModelWhitelisted(kind, modelKey) {
  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  const normalizedModel = typeof modelKey === 'string' ? modelKey.trim() : '';
  if (!normalizedModel) return false;

  // 1. Check exact whitelist
  const exactSet = EXACT_WHITELIST[normalizedKind];
  if (exactSet) {
    return exactSet.has(normalizedModel);
  }

  // 2. Check prefix whitelist
  const prefixes = PREFIX_WHITELIST[normalizedKind];
  if (prefixes) {
    return prefixes.some((prefix) => normalizedModel.startsWith(prefix));
  }

  // 3. No whitelist for this kind → allow all (e.g. deepseek)
  return true;
}

export function filterWhitelistedModels(kind, modelKeys) {
  if (!Array.isArray(modelKeys)) {
    return [];
  }
  return modelKeys
    .map((m) => (typeof m === 'string' ? m.trim() : ''))
    .filter((m) => m.length > 0)
    .filter((m) => isModelWhitelisted(kind, m));
}

export function getWhitelistedModels(kind) {
  const normalizedKind = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  const exactSet = EXACT_WHITELIST[normalizedKind];
  if (exactSet) return Array.from(exactSet);
  const prefixes = PREFIX_WHITELIST[normalizedKind];
  if (prefixes) return [...prefixes]; // Return prefixes as representative list
  return null;
}

export default {
  isModelWhitelisted,
  filterWhitelistedModels,
  getWhitelistedModels,
};
