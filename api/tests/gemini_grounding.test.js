import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiDriver } from '../services/llm/drivers/gemini.js';

/**
 * Phase 4.2: Grounding with Google Search
 *
 * Validates that enableGrounding=true results in tools=[{google_search:{}}] in request body.
 */

describe('gemini grounding (Phase 4.2)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('adds tools.google_search when enableGrounding is true', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    const res = await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      enableGrounding: true,
    });

    expect(res.ok).toBe(true);
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0].tools).toEqual([{ google_search: {} }]);
  });

  it('uses legacy google_search_retrieval for Gemini 1.5 models', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    const res = await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      enableGrounding: true,
    });

    expect(res.ok).toBe(true);
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0].tools).toEqual([
      {
        google_search_retrieval: {
          dynamic_retrieval_config: {
            mode: 'MODE_DYNAMIC',
            dynamic_threshold: 0.7,
          },
        },
      },
    ]);
  });
});
