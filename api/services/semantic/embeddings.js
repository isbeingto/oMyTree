/**
 * Experimental embedding abstraction (T46-0).
 * Default provider: mock deterministic vector for dev/testing.
 */

import { embedTextOpenAI } from './embeddings_openai.js';

const EMBEDDING_ENABLED_FLAG = (process.env.EMBEDDING_ENABLED || 'true').toLowerCase();
const EMBEDDING_ENABLED = !['0', 'false', 'no', 'off'].includes(EMBEDDING_ENABLED_FLAG);
const EMBEDDING_DIM = Number.parseInt(process.env.EMBEDDING_DIM || '64', 10) || 64;
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();

function assertEnabled() {
  if (!EMBEDDING_ENABLED) {
    const err = new Error('Embedding is disabled via EMBEDDING_ENABLED');
    err.code = 'EMBEDDING_DISABLED';
    throw err;
  }
}

function seededRandom(seed) {
  // Mulberry32 PRNG
  let t = seed + 0x6d2b79f5;
  return function next() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSeed(text) {
  if (typeof text !== 'string') return 0;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function mockEmbed(text, dim = EMBEDDING_DIM) {
  const seed = toSeed(text);
  const rand = seededRandom(seed);
  const vec = [];
  for (let i = 0; i < dim; i += 1) {
    // Center around 0 using [-1,1) range.
    vec.push((rand() * 2) - 1);
  }
  return vec;
}

/**
 * Embed text into a numeric vector.
 * Current provider: mock (deterministic, no network).
 * @param {string} text
 * @param {{ provider?: string, dim?: number }} [options]
 * @returns {Promise<number[]>}
 */
export async function embedText(text, options = {}) {
  assertEnabled();
  const provider = (options.provider || EMBEDDING_PROVIDER).toLowerCase();
  const dim = Number.parseInt(options.dim || EMBEDDING_DIM, 10) || EMBEDDING_DIM;
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) {
    const err = new Error('Text must be a non-empty string');
    err.code = 'EMBEDDING_INVALID_INPUT';
    throw err;
  }

  if (provider === 'mock') {
    return mockEmbed(normalized, dim);
  }

  if (provider === 'openai') {
    return embedTextOpenAI(normalized, {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      timeoutMs: options.timeoutMs,
      dimensions: options.dimensions,
    });
  }

  const err = new Error(`Unsupported embedding provider: ${provider}`);
  err.code = 'EMBEDDING_UNSUPPORTED_PROVIDER';
  throw err;
}

export default {
  embedText,
};
