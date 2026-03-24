import { t, type Lang, type MessageKey } from './i18n';

export type LlmErrorPayload = {
  code?: string | null;
  provider?: string | null;
  message?: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  google: 'Google Gemini',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  claude: 'Anthropic Claude',
  deepseek: 'DeepSeek',
  'omytree-default': 'oMyTree Default',
  mock: 'Mock',
};

const CODE_TO_KEY: Record<string, MessageKey> = {
  byok_invalid_key: 'llm_error_byok_invalid_key',
  byok_insufficient_quota: 'llm_error_byok_insufficient_quota',
  provider_unreachable: 'llm_error_provider_unreachable',
  provider_rate_limited: 'llm_error_provider_rate_limited',
  provider_model_not_found: 'llm_error_provider_model_not_found',
  file_upload_failed: 'llm_error_file_upload_failed',
  file_type_unsupported: 'llm_error_file_type_unsupported',
  timeout: 'llm_error_timeout',
  internal_error: 'llm_error_internal_error',
};

export function formatProviderLabel(raw?: string | null) {
  if (!raw || typeof raw !== 'string') return 'provider';
  const normalized = raw.toLowerCase();
  return PROVIDER_LABELS[normalized] || raw;
}

export function formatLlmErrorMessage(error: LlmErrorPayload | null | undefined, lang: Lang) {
  const provider = formatProviderLabel(error?.provider || undefined);
  const code = (error?.code || 'internal_error').toLowerCase();
  const key = CODE_TO_KEY[code] || CODE_TO_KEY.internal_error;
  const template = t(lang, key) || t('en', key);
  const base = template.replace('{provider}', provider);
  if (base && base.trim().length > 0) {
    return base;
  }
  if (error?.message) {
    return error.message;
  }
  return t(lang, 'llm_error_internal_error').replace('{provider}', provider);
}
