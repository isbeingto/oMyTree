/**
 * T32-0: OpenAI Compatible Driver (Stub)
 * 
 * 用于兼容 OpenAI 格式的第三方 API（网关/代理，如 DeepSeek）
 * 这是一个 stub 实现，后续 T32-1 会完善
 */

import { openaiNativeDriver } from './openai_native.js';

/**
 * OpenAI Compatible Driver
 * 
 * 目前直接复用 openai_native driver，后续可扩展：
 * - 自定义 baseUrl
 * - 不同的认证方式
 * - 特定厂商的参数调整
 * 
 * @param {import('../types.js').LLMRequest} request
 */
export async function openaiCompatibleDriver(request) {
  // 目前直接使用 openai_native driver
  // 区别在于 request.baseUrl 可以是自定义的第三方 URL
  return openaiNativeDriver(request);
}

export default openaiCompatibleDriver;
