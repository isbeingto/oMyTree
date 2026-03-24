import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { embedText } from '../services/semantic/embeddings.js';

describe('embeddings provider: openai (P1-01)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws EMBEDDING_MISSING_API_KEY when OPENAI_API_KEY is not set', async () => {
    delete process.env.EMBEDDING_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.EMBEDDING_OPENAI_MODEL = 'test-embed-model';

    await expect(embedText('hello', { provider: 'openai' })).rejects.toMatchObject({
      code: 'EMBEDDING_MISSING_API_KEY',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws EMBEDDING_MISSING_MODEL when embedding model is not configured', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    delete process.env.EMBEDDING_OPENAI_MODEL;
    delete process.env.EMBEDDING_MODEL;

    await expect(embedText('hello', { provider: 'openai' })).rejects.toMatchObject({
      code: 'EMBEDDING_MISSING_MODEL',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('normalizes OPENAI_API_BASE and calls /embeddings', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.EMBEDDING_OPENAI_MODEL = 'test-embed-model';
    process.env.OPENAI_API_BASE = 'https://api.openai.com/v1/chat/completions';

    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2] }],
      }),
    });

    const vec = await embedText('hello', { provider: 'openai' });
    expect(vec).toEqual([0.1, 0.2]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
  });

  it('throws EMBEDDING_HTTP_ERROR on non-2xx responses', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.EMBEDDING_OPENAI_MODEL = 'test-embed-model';

    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate_limited' } }),
    });

    await expect(embedText('hello', { provider: 'openai' })).rejects.toMatchObject({
      code: 'EMBEDDING_HTTP_ERROR',
      httpStatus: 429,
    });
  });
});

