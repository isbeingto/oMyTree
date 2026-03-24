export type ByokProviderKind = 'openai' | 'google' | 'anthropic' | 'deepseek' | 'ollama';

// Product policy: fetch full model list, but only allow selecting models in whitelist.
// For providers not listed here, allow all models.
const BYOK_MODEL_WHITELIST: Partial<Record<ByokProviderKind, Set<string>>> = {
  // Focused support: Gemini 3 series (BYOK Google AI).
  google: new Set([
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3-pro-image-preview',
  ]),
};

export function isByokModelWhitelisted(kind: ByokProviderKind, modelKey: string): boolean {
  const allow = BYOK_MODEL_WHITELIST[kind];
  if (!allow) return true;
  return allow.has(modelKey);
}

export function getByokWhitelistHint(kind: ByokProviderKind, lang: 'zh-CN' | 'en' = 'zh-CN'): string | null {
  const allow = BYOK_MODEL_WHITELIST[kind];
  if (!allow) return null;
  const models = Array.from(allow);
  if (lang === 'zh-CN') {
    return `当前仅开放白名单模型：${models.join('、')}`;
  }
  return `Only whitelisted models are selectable: ${models.join(', ')}`;
}
