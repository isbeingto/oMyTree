/**
 * Gemini Thinking/Reasoning Tests (Phase 1)
 *
 * Coverage:
 * - buildRequestBody(): Gemini 3 thinkingConfig (thinkingLevel/includeThoughts)
 * - streamGemini(): parse parts[].thought into reasoning chunks (no delay)
 * - usage mapping: thoughtsTokens/cachedTokens
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

class MockResponse {
  constructor(chunks, options = {}) {
    this.ok = options.ok !== undefined ? options.ok : true;
    this.status = options.status || 200;
    this.body = this._createReadableStream(chunks);
    this._jsonData = options.jsonData;
  }

  _createReadableStream(chunks) {
    let index = 0;
    return {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) {
            return { done: true };
          }
          const chunk = chunks[index++];
          const encoded = new TextEncoder().encode(chunk);
          return { done: false, value: encoded };
        },
      }),
    };
  }

  async json() {
    return this._jsonData || {};
  }

  async text() {
    return JSON.stringify(this._jsonData || {});
  }
}

describe('Gemini Driver - Thinking/Reasoning (Phase 1)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should send Gemini 3 thinkingConfig (thinkingLevel/includeThoughts)', async () => {
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body || '{}');
      return new MockResponse([], {
        ok: true,
        status: 200,
        jsonData: {
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        },
      });
    };

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');

    const res = await geminiDriver({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-3-flash',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 128,
      temperature: 1.0,
      providerSource: 'platform',
      stream: false,
    });

    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH',
      includeThoughts: true,
    });
    expect(res.text).toBe('ok');
  });

  it('should send Gemini 2.5 thinkingConfig (thinkingBudget)', async () => {
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body || '{}');
      return new MockResponse([], {
        ok: true,
        status: 200,
        jsonData: {
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        },
      });
    };

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');

    await geminiDriver({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 128,
      temperature: 1.0,
      providerSource: 'platform',
      stream: false,
    });

    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
  });

  it('should send Gemini 2.5 Pro thinkingConfig with higher thinkingBudget', async () => {
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init?.body || '{}');
      return new MockResponse([], {
        ok: true,
        status: 200,
        jsonData: {
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        },
      });
    };

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');

    await geminiDriver({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 128,
      temperature: 1.0,
      providerSource: 'platform',
      stream: false,
    });

    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 4096,
      includeThoughts: true,
    });
  });

  it('should stream thought as reasoning chunks and keep fullReasoning + usage', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"thought":"abcd"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n',
      'data: {"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3,"thoughtsTokenCount":4,"cachedContentTokenCount":5},"candidates":[{"content":{"parts":[{"text":""}]}}]}\n\n',
    ];

    global.fetch = async () => new MockResponse(sseChunks, { ok: true, status: 200 });

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');

    const stream = await geminiDriver({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-3-flash',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 128,
      temperature: 1.0,
      providerSource: 'platform',
      timeoutMs: 2000,
      stream: true,
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const reasoningText = chunks
      .filter((c) => c.type === 'reasoning')
      .map((c) => c.reasoningText)
      .join('');

    const deltaText = chunks
      .filter((c) => c.type === 'delta')
      .map((c) => c.deltaText)
      .join('');

    const finalUsage = chunks.findLast((c) => c.type === 'usage');

    expect(reasoningText).toBe('abcd');
    expect(deltaText).toBe('hi');

    expect(finalUsage?.fullReasoning).toBe('abcd');
    expect(finalUsage?.fullText).toBe('hi');

    expect(finalUsage?.usage?.thoughtsTokens).toBe(4);
    expect(finalUsage?.usage?.cachedTokens).toBe(5);
    expect(finalUsage?.usage?.totalTokens).toBe(3);
  });

  it('should treat {text, thought:true} parts as reasoning (Gemini 3 includeThoughts)', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"abcd","thought":true}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n',
      'data: {"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3,"thoughtsTokenCount":4,"cachedContentTokenCount":5},"candidates":[{"content":{"parts":[{"text":""}]}}]}\n\n',
    ];

    global.fetch = async () => new MockResponse(sseChunks, { ok: true, status: 200 });

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');

    const stream = await geminiDriver({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      model: 'gemini-3-flash',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 128,
      temperature: 1.0,
      providerSource: 'platform',
      timeoutMs: 2000,
      stream: true,
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const reasoningText = chunks
      .filter((c) => c.type === 'reasoning')
      .map((c) => c.reasoningText)
      .join('');

    const deltaText = chunks
      .filter((c) => c.type === 'delta')
      .map((c) => c.deltaText)
      .join('');

    const finalUsage = chunks.findLast((c) => c.type === 'usage');

    expect(reasoningText).toBe('abcd');
    expect(deltaText).toBe('hi');

    expect(finalUsage?.fullReasoning).toBe('abcd');
    expect(finalUsage?.fullText).toBe('hi');
    expect(finalUsage?.usage?.thoughtsTokens).toBe(4);
  });
});
