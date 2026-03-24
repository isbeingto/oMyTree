import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiDriver } from '../services/llm/drivers/gemini.js';
import { RELEVANCE_SCHEMA } from '../services/llm/schemas/relevance.js';

describe('gemini structured output (Phase 3.1)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (_url, init) => {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: '{"classification":"in","confidence":0.9}' }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          };
        },
        body: null,
      };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('writes responseMimeType/responseSchema into generationConfig when provided', async () => {
    await geminiDriver({
      stream: false,
      providerSource: 'byok',
      apiKey: 'test',
      baseUrl: 'https://example.test/v1beta/models',
      model: 'gemini-3-pro-preview',
      maxTokens: 128,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: RELEVANCE_SCHEMA,
      messages: [
        { role: 'system', content: 'ctx' },
        { role: 'user', content: 'Q' },
      ],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body.generationConfig).toBeTruthy();
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeTruthy();
    expect(body.generationConfig.responseSchema.required).toContain('classification');
  });
});
