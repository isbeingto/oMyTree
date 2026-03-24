/**
 * OpenAI embeddings provider (P1-01).
 *
 * Minimal, fail-open friendly wrapper:
 * - Callers should handle exceptions and fallback to recency/time-based logic.
 * - No secrets logged.
 */

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 15000;

function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_OPENAI_BASE;
  let normalized = url.trim();
  if (!normalized) return DEFAULT_OPENAI_BASE;
  // In this repo, OPENAI_API_BASE may be configured as a full chat endpoint.
  normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  return normalized.replace(/\/+$/, '') || DEFAULT_OPENAI_BASE;
}

function buildEndpoint(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
  return `${base}${path}`;
}

function assertApiKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) {
    const err = new Error('OpenAI API key missing for embeddings');
    err.code = 'EMBEDDING_MISSING_API_KEY';
    throw err;
  }
  return key;
}

function assertModel(model) {
  const m = typeof model === 'string' ? model.trim() : '';
  if (!m) {
    const err = new Error('Embedding model is required for OpenAI provider');
    err.code = 'EMBEDDING_MISSING_MODEL';
    throw err;
  }
  return m;
}

function normalizeDimensions(value) {
  if (value == null) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function validateVector(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return false;
  return vec.every((v) => typeof v === 'number' && Number.isFinite(v));
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Embed one or many texts via OpenAI.
 * @param {string[]} inputs
 * @param {object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.baseUrl]
 * @param {string} [options.model]
 * @param {number} [options.timeoutMs]
 * @param {number|null} [options.dimensions] - optional for models that support it
 * @returns {Promise<number[][]>}
 */
export async function embedTextsOpenAI(inputs, options = {}) {
  const apiKey =
    typeof options.apiKey === 'string' && options.apiKey.trim()
      ? options.apiKey.trim()
      : (process.env.EMBEDDING_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const model =
    typeof options.model === 'string' && options.model.trim()
      ? options.model.trim()
      : (process.env.EMBEDDING_OPENAI_MODEL || process.env.EMBEDDING_MODEL || '').trim();
  const baseUrl =
    typeof options.baseUrl === 'string' && options.baseUrl.trim()
      ? options.baseUrl.trim()
      : (process.env.EMBEDDING_OPENAI_BASE || process.env.OPENAI_API_BASE || '').trim();
  const timeoutMsRaw =
    options.timeoutMs != null ? options.timeoutMs : process.env.EMBEDDING_OPENAI_TIMEOUT_MS;
  const timeoutMs = Math.max(1000, Number.parseInt(String(timeoutMsRaw || DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS);
  const dimensions = normalizeDimensions(options.dimensions ?? process.env.EMBEDDING_OPENAI_DIMENSIONS);

  const key = assertApiKey(apiKey);
  const embeddingModel = assertModel(model);
  const texts = Array.isArray(inputs) ? inputs.filter((t) => typeof t === 'string' && t.trim()) : [];
  if (texts.length === 0) {
    const err = new Error('inputs must be a non-empty string array');
    err.code = 'EMBEDDING_INVALID_INPUT';
    throw err;
  }

  const endpoint = buildEndpoint(baseUrl, '/embeddings');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = {
      model: embeddingModel,
      input: texts,
    };
    if (dimensions) body.dimensions = dimensions;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readJsonSafe(response);
    if (!response.ok) {
      const message = payload?.error?.message || `OpenAI embeddings request failed (${response.status})`;
      const err = new Error(message);
      err.code = 'EMBEDDING_HTTP_ERROR';
      err.httpStatus = response.status;
      throw err;
    }

    const data = Array.isArray(payload?.data) ? payload.data : [];
    const vectors = data
      .map((row) => row?.embedding)
      .filter(Boolean);

    if (vectors.length !== texts.length) {
      const err = new Error('OpenAI embeddings response shape mismatch');
      err.code = 'EMBEDDING_INVALID_RESPONSE';
      throw err;
    }
    for (const vec of vectors) {
      if (!validateVector(vec)) {
        const err = new Error('OpenAI embeddings response contains invalid vector');
        err.code = 'EMBEDDING_INVALID_RESPONSE';
        throw err;
      }
    }

    return vectors;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const err = new Error('OpenAI embeddings request timeout');
      err.code = 'EMBEDDING_TIMEOUT';
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Embed a single text via OpenAI.
 * @param {string} text
 * @param {object} [options]
 * @returns {Promise<number[]>}
 */
export async function embedTextOpenAI(text, options = {}) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) {
    const err = new Error('Text must be a non-empty string');
    err.code = 'EMBEDDING_INVALID_INPUT';
    throw err;
  }
  const [vec] = await embedTextsOpenAI([normalized], options);
  return vec;
}

export default {
  embedTextOpenAI,
  embedTextsOpenAI,
};

