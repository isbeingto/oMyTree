import { CONTEXT_MESSAGE_LIMITS } from './context_limits.js';

/**
 * Context profile configuration (single source of truth)
 * - promptTokensBudget: prompt construction budget
 */
export const CONTEXT_PROFILE_CONFIG_PLATFORM = {
  // Output token budgets 移除，以后不再设置可选参数 max_tokens
  lite: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.lite.tokensBudget },
  standard: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.standard.tokensBudget },
  max: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.max.tokensBudget },
};

export const CONTEXT_PROFILE_CONFIG_BYOK = {
  // BYOK 用户自己承担成本，移除 max_tokens 限制让模型自然结束
  lite: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.lite.tokensBudget },
  standard: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.standard.tokensBudget },
  max: { promptTokensBudget: CONTEXT_MESSAGE_LIMITS.max.tokensBudget },
};

/**
 * Resolve effective profile.
 * @param {string} profile - requested profile ('lite' | 'standard' | 'max')
 * @param {boolean} isByok - whether the call uses BYOK (non-platform)
 * @returns {{ profile: 'lite' | 'standard' | 'max' }}
 */
export function resolveContextProfile(profile, isByok) {
  const normalized = typeof profile === 'string' ? profile.trim().toLowerCase() : 'lite';
  const configStore = isByok ? CONTEXT_PROFILE_CONFIG_BYOK : CONTEXT_PROFILE_CONFIG_PLATFORM;
  if (normalized === 'max' && !isByok) {
    // Safety: Max is only allowed for BYOK; downgrade to standard
    const standard = CONTEXT_PROFILE_CONFIG_PLATFORM.standard;
    return { profile: 'standard', promptTokensBudget: standard.promptTokensBudget };
  }

  if (configStore[normalized]) {
    const config = configStore[normalized];
    return { profile: normalized, promptTokensBudget: config.promptTokensBudget };
  }

  const fallback = configStore.lite;
  return { profile: 'lite', promptTokensBudget: fallback.promptTokensBudget };
}

export default {
  CONTEXT_PROFILE_CONFIG_PLATFORM,
  CONTEXT_PROFILE_CONFIG_BYOK,
  resolveContextProfile,
};
