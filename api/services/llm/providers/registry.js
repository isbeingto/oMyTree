/**
 * LLM Provider Registry
 * 
 * 统一管理所有 LLM Provider 的注册和获取。
 * 配置来源：ecosystem.config.js (通过 process.env 读取)
 */

import { LLMProvider } from './base.js';

class ProviderRegistry {
  constructor() {
    /** @type {Map<string, LLMProvider>} */
    this.providers = new Map();
    this._defaultProviderId = null;
  }

  /**
   * 注册一个 Provider
   * @param {LLMProvider} provider 
   */
  register(provider) {
    if (!(provider instanceof LLMProvider) && 
        !(provider.id && typeof provider.callChat === 'function')) {
      throw new Error('Invalid provider: must be LLMProvider instance or implement callChat()');
    }
    this.providers.set(provider.id, provider);
    console.log(`[LLM Registry] Registered provider: ${provider.id}`);
  }

  /**
   * 设置默认 Provider
   * @param {string} providerId 
   */
  setDefault(providerId) {
    if (!this.providers.has(providerId)) {
      console.warn(`[LLM Registry] Warning: Setting default to unregistered provider: ${providerId}`);
    }
    this._defaultProviderId = providerId;
    console.log(`[LLM Registry] Default provider set to: ${providerId}`);
  }

  /**
   * 获取指定 Provider
   * @param {string} [providerId] - 如果不指定，返回默认 provider
   * @returns {LLMProvider|null}
   */
  get(providerId) {
    const id = providerId || this._defaultProviderId;
    if (!id) {
      return null;
    }
    return this.providers.get(id) || null;
  }

  /**
   * 获取默认 Provider
   * @returns {LLMProvider|null}
   */
  getDefault() {
    return this.get(this._defaultProviderId);
  }

  /**
   * 获取默认 Provider ID
   * @returns {string|null}
   */
  getDefaultId() {
    return this._defaultProviderId;
  }

  /**
   * 列出所有已注册的 Provider
   * @returns {Array<{id: string, name: string, available: boolean}>}
   */
  list() {
    const result = [];
    for (const provider of this.providers.values()) {
      result.push(provider.getInfo ? provider.getInfo() : {
        id: provider.id,
        name: provider.name || provider.id,
        available: typeof provider.isAvailable === 'function' ? provider.isAvailable() : true,
      });
    }
    return result;
  }

  /**
   * 检查 Provider 是否存在
   * @param {string} providerId 
   * @returns {boolean}
   */
  has(providerId) {
    return this.providers.has(providerId);
  }
}

// 单例导出
export const registry = new ProviderRegistry();

export default registry;
