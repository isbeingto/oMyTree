/**
 * User API Keys Service
 * 
 * 用于获取用户绑定的 API Key，供 LLM Provider 使用
 */

import { pool } from '../db/pool.js';
import { decryptApiKey } from '../lib/api_key_crypto.js';

// 缓存（简单内存缓存，5 分钟过期）
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeProviderForUserApiKeys(provider) {
  if (!provider) return null;
  const p = String(provider).trim().toLowerCase();
  // user_api_keys.provider is an enum in DB; keep this list in sync with schema.
  // DeepSeek uses OpenAI-compatible API keys in this project.
  if (p === 'deepseek') return 'openai';
  if (p === 'openai' || p === 'google') return p;
  return null;
}

/**
 * 获取用户指定 provider 的 API Key
 * 
 * @param {string} userId - 用户 ID
 * @param {string} provider - Provider 类型 ('openai' | 'google')
 * @returns {Promise<string|null>} - 解密后的 API Key，如果不存在则返回 null
 */
export async function getUserApiKey(userId, provider) {
  if (!userId || !provider) {
    return null;
  }

  const normalizedProvider = normalizeProviderForUserApiKeys(provider);
  if (!normalizedProvider) {
    return null;
  }

  const cacheKey = `${userId}:${normalizedProvider}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT api_key_encrypted
       FROM user_api_keys
       WHERE user_id = $1 AND provider = $2
       LIMIT 1`,
      [userId, normalizedProvider]
    );

    if (rows.length === 0) {
      // 缓存空结果
      cache.set(cacheKey, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const encryptedKey = rows[0].api_key_encrypted;
    const plainKey = decryptApiKey(encryptedKey);

    // 缓存解密后的 key
    cache.set(cacheKey, { value: plainKey, expiresAt: Date.now() + CACHE_TTL_MS });
    return plainKey;
  } catch (error) {
    console.error(`[user-api-keys] Failed to get key for user=${userId} provider=${normalizedProvider}:`, error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * 清除用户的 API Key 缓存
 * 
 * @param {string} userId - 用户 ID
 * @param {string} [provider] - 可选，指定 provider；不指定则清除所有
 */
export function clearUserApiKeyCache(userId, provider) {
  if (provider) {
    cache.delete(`${userId}:${provider}`);
  } else {
    // 清除所有该用户的缓存
    for (const key of cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        cache.delete(key);
      }
    }
  }
}

/**
 * 检查用户是否有指定 provider 的 API Key
 * 
 * @param {string} userId - 用户 ID
 * @param {string} provider - Provider 类型
 * @returns {Promise<boolean>}
 */
export async function hasUserApiKey(userId, provider) {
  const key = await getUserApiKey(userId, provider);
  return key !== null;
}

export default {
  getUserApiKey,
  hasUserApiKey,
  clearUserApiKeyCache,
};
