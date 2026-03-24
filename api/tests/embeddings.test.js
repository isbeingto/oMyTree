import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embedText } from '../services/semantic/embeddings.js';

describe('embedText (mock provider)', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('returns a vector with configured dimension', async () => {
    const vec = await embedText('hello embeddings', { dim: 32, provider: 'mock' });
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBe(32);
    expect(vec.every((n) => typeof n === 'number')).toBe(true);
  });

  it('is deterministic for the same input', async () => {
    const a = await embedText('deterministic test', { dim: 16 });
    const b = await embedText('deterministic test', { dim: 16 });
    expect(a).toEqual(b);
  });

  it('throws when disabled via env', async () => {
    process.env.EMBEDDING_ENABLED = 'false';
    const mod = await import('../services/semantic/embeddings.js');
    await expect(mod.embedText('should fail')).rejects.toHaveProperty('code', 'EMBEDDING_DISABLED');
  });
});
