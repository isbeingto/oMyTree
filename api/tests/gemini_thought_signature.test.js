import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiDriver } from '../services/llm/drivers/gemini.js';

function createMockResponse({ ok = true, status = 200, json = {}, bodyText = '' } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
    // Streaming path isn't needed for this test.
    body: null,
    async text() {
      return bodyText;
    },
  };
}

describe('gemini thought signatures (Phase 2)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (_url, init) => {
      const parsed = JSON.parse(init.body);
      return createMockResponse({
        ok: true,
        status: 200,
        json: {
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          // Echo back the body for debugging if needed
          __requestBody: parsed,
        },
      });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('includes thoughtSignature in model history parts when provided', async () => {
    await geminiDriver({
      stream: false,
      providerSource: 'byok',
      apiKey: 'test',
      baseUrl: 'https://example.test/v1beta/models',
      model: 'gemini-3-pro-preview',
      maxTokens: 128,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'ctx' },
        { role: 'user', content: 'Q1' },
        {
          role: 'assistant',
          content: 'A1',
          thoughtSignature: 'sig-123',
          reasoningText: 'reasoning',
        },
        { role: 'user', content: 'Q2' },
      ],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);

    const modelTurn = body.contents.find((c) => c.role === 'model');
    expect(modelTurn).toBeTruthy();
    expect(Array.isArray(modelTurn.parts)).toBe(true);

    const thoughtPart = modelTurn.parts.find((p) => p && p.thought === true);
    expect(thoughtPart).toBeTruthy();
    expect(thoughtPart.thoughtSignature).toBe('sig-123');
  });
});
