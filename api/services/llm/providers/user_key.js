/**
 * User Key Provider
 *
 * Wraps BYOK (Bring Your Own Key) providers with the unified LLM Router.
 * Keeps the legacy Provider interface (callChat / callChatStream) so
 * existing call sites continue to work.
 */

import { LLMProvider } from './base.js';
import { createProviderAdapter } from '../provider_adapter.js';
import { PROVIDER_KINDS } from '../types.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || '600000', 10);

const DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4',
  },
  google: {
    baseUrl: process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta/models',
    model: process.env.GOOGLE_LLM_MODEL || 'gemini-3-flash-preview',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: process.env.ANTHROPIC_LLM_MODEL || 'claude-sonnet-4-20250514',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_LLM_MODEL || 'deepseek-chat',
  },
};

function normalizeProvider(provider) {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'google' || normalized === 'gemini') return 'google';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  if (normalized === 'deepseek') return 'deepseek';
  throw new Error(`Unsupported BYOK provider: ${provider}`);
}

function createAdapter(providerId, apiKey) {
  const defaults = DEFAULTS[providerId];
  let providerKind;
  
  if (providerId === 'openai') {
    providerKind = PROVIDER_KINDS.OPENAI_NATIVE;
  } else if (providerId === 'google') {
    providerKind = PROVIDER_KINDS.GEMINI;
  } else if (providerId === 'anthropic') {
    providerKind = PROVIDER_KINDS.ANTHROPIC;
  } else if (providerId === 'deepseek') {
    providerKind = PROVIDER_KINDS.DEEPSEEK;
  } else {
    providerKind = PROVIDER_KINDS.OPENAI_COMPATIBLE;
  }

  return createProviderAdapter({
    providerKind,
    providerId,
    apiKey,
    baseUrl: defaults.baseUrl,
    defaultModel: defaults.model,
    isByok: true,
  });
}

export class UserKeyProvider extends LLMProvider {
  constructor(providerId, apiKey) {
    const nameMap = {
      google: 'Google Gemini (BYOK)',
      openai: 'OpenAI (BYOK)',
      anthropic: 'Anthropic Claude (BYOK)',
      deepseek: 'DeepSeek (BYOK)',
    };
    super({
      id: providerId,
      name: nameMap[providerId] || `${providerId} (BYOK)`,
      description: 'User-provided API key',
    });
    this.providerId = providerId;
    this.apiKey = apiKey;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async callChat({ prompt, messages, options = {} }) {
    const adapter = createAdapter(this.providerId, this.apiKey);
    const optionsWithDefaults = { ...options };
    if (optionsWithDefaults.timeout_ms == null && Number.isFinite(DEFAULT_TIMEOUT_MS)) {
      optionsWithDefaults.timeout_ms = DEFAULT_TIMEOUT_MS;
    }
    return adapter.callChat({ prompt, messages, options: optionsWithDefaults });
  }

  async *callChatStream({ prompt, messages, options = {} }) {
    const adapter = createAdapter(this.providerId, this.apiKey);
    const optionsWithDefaults = { ...options };
    if (optionsWithDefaults.timeout_ms == null && Number.isFinite(DEFAULT_TIMEOUT_MS)) {
      optionsWithDefaults.timeout_ms = DEFAULT_TIMEOUT_MS;
    }
    yield* adapter.callChatStream({ prompt, messages, options: optionsWithDefaults });
  }
}

export function createUserKeyProvider(provider, apiKey) {
  const providerId = normalizeProvider(provider);
  return new UserKeyProvider(providerId, apiKey);
}

export default { createUserKeyProvider, UserKeyProvider };
