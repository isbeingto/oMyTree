/**
 * T32-0: LLM Router 验收测试
 * 
 * 测试新的 Router 模块是否可以正确加载和导出
 */

import assert from 'node:assert';
import { test } from 'vitest';

async function run() {
  console.log('=== T32-0 Router Module Test ===\n');

  // 1. 测试 types.js 导出
  console.log('1. Testing types.js exports...');
  const types = await import('./types.js');
  assert(types.PROVIDER_KINDS, 'PROVIDER_KINDS should be exported');
  assert(types.PROVIDER_SOURCES, 'PROVIDER_SOURCES should be exported');
  assert(types.LLM_ERROR_CODES, 'LLM_ERROR_CODES should be exported');
  assert(typeof types.createLLMError === 'function', 'createLLMError should be a function');
  assert(typeof types.createLLMResponse === 'function', 'createLLMResponse should be a function');
  assert(typeof types.createLLMErrorResponse === 'function', 'createLLMErrorResponse should be a function');
  assert(typeof types.validateLLMRequest === 'function', 'validateLLMRequest should be a function');
  console.log('   ✓ types.js exports OK\n');

  // 2. 测试 router.js 导出
  console.log('2. Testing router.js exports...');
  const router = await import('./router.js');
  assert(typeof router.routeLLM === 'function', 'routeLLM should be a function');
  assert(typeof router.routeLLMWithResolve === 'function', 'routeLLMWithResolve should be a function');
  console.log('   ✓ router.js exports OK\n');

  // 3. 测试 drivers
  console.log('3. Testing drivers...');
  const openaiDriver = await import('./drivers/openai_native.js');
  assert(typeof openaiDriver.openaiNativeDriver === 'function', 'openaiNativeDriver should be a function');
  
  const geminiDriver = await import('./drivers/gemini.js');
  assert(typeof geminiDriver.geminiDriver === 'function', 'geminiDriver should be a function');
  console.log('   ✓ drivers exports OK\n');

  // 4. 测试 provider_adapter.js
  console.log('4. Testing provider_adapter.js exports...');
  const adapter = await import('./provider_adapter.js');
  assert(typeof adapter.createProviderAdapter === 'function', 'createProviderAdapter should be a function');
  console.log('   ✓ provider_adapter.js exports OK\n');

  // 5. 测试 index.js 整合
  console.log('5. Testing index.js integration...');
  const llm = await import('./index.js');
  assert(typeof llm.routeLLM === 'function', 'routeLLM should be exported from index.js');
  assert(typeof llm.routeLLMWithResolve === 'function', 'routeLLMWithResolve should be exported from index.js');
  assert(typeof llm.createProviderAdapter === 'function', 'createProviderAdapter should be exported from index.js');
  console.log('   ✓ index.js integration OK\n');

  // 6. 测试类型常量
  console.log('6. Testing type constants...');
  assert(types.PROVIDER_KINDS.OPENAI_NATIVE === 'openai_native', 'OPENAI_NATIVE should be correct');
  assert(types.PROVIDER_KINDS.GEMINI === 'gemini', 'GEMINI should be correct');
  assert(types.PROVIDER_SOURCES.BYOK === 'byok', 'BYOK should be correct');
  assert(types.PROVIDER_SOURCES.PLATFORM === 'platform', 'PLATFORM should be correct');
  console.log('   ✓ Type constants OK\n');

  // 7. 测试 createLLMError
  console.log('7. Testing createLLMError...');
  const error = types.createLLMError({
    code: types.LLM_ERROR_CODES.BYOK_INVALID_KEY,
    provider: 'openai',
    message: 'Invalid API key',
    isByok: true,
  });
  assert(error.code === types.LLM_ERROR_CODES.BYOK_INVALID_KEY, 'Error code should match');
  assert(error.provider === 'openai', 'Error provider should match');
  assert(error.isByok === true, 'Error isByok should be true');
  console.log('   ✓ createLLMError OK\n');

  // 8. 测试 createLLMResponse
  console.log('8. Testing createLLMResponse...');
  const response = types.createLLMResponse({
    text: 'Hello, world!',
    model: 'gpt-4o',
    provider: 'openai',
    isByok: true,
  });
  assert(response.ok === true, 'Response should be ok');
  assert(response.text === 'Hello, world!', 'Response text should match');
  assert(response.isByok === true, 'Response isByok should be true');
  console.log('   ✓ createLLMResponse OK\n');

  // 9. 测试 validateLLMRequest
  console.log('9. Testing validateLLMRequest...');
  const validRequest = {
    providerKind: types.PROVIDER_KINDS.OPENAI_NATIVE,
    providerSource: types.PROVIDER_SOURCES.BYOK,
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }],
    apiKey: 'sk-test',
  };
  const validResult = types.validateLLMRequest(validRequest);
  assert(validResult.valid === true, 'Valid request should pass validation');
  
  const invalidRequest = { providerKind: 'invalid' };
  const invalidResult = types.validateLLMRequest(invalidRequest);
  assert(invalidResult.valid === false, 'Invalid request should fail validation');
  console.log('   ✓ validateLLMRequest OK\n');

  console.log('=== All T32-0 Module Tests Passed! ===\n');
}

test('LLM Router module exports are available', async () => {
  await run();
});
