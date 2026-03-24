/**
 * Generic text similarity ranker using embeddings.
 * 
 * P1-03: Uses shared LRU cache, short-circuit optimization, and parallel embedding.
 * P1-04: Instrumented with semantic selection metrics (scope=semantic_ranker), fail-open on errors.
 */
import { embedText } from '../semantic/embeddings.js';
import { embeddingCache } from '../semantic/embedding_cache.js';
import {
  recordSemanticSelectionAttempt,
  recordSemanticSelectionSuccess,
  recordSemanticSelectionFallback,
  recordSemanticSelectionShortcircuit,
  recordSemanticSelectionDuration,
  recordEmbeddingCall,
} from './semantic_selection_metrics.js';

const SCOPE = 'semantic_ranker';

// Cache key config (for provider-aware caching)
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
const EMBEDDING_MODEL = (process.env.EMBEDDING_MODEL || process.env.EMBEDDING_OPENAI_MODEL || '').trim();
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '64', 10) || 64;

/**
 * P1-03: Get embedding with shared LRU cache.
 */
async function getVec(text) {
  const key = embeddingCache.makeKey(text, EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIM);
  const cached = embeddingCache.get(key);
  if (cached) return cached;

  recordEmbeddingCall({ scope: SCOPE });
  const vec = await embedText(text);
  embeddingCache.set(key, vec);
  return vec;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Rank candidate texts by similarity to query text.
 * @param {string[]} texts
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
export async function rankTextsBySimilarity(texts = [], query = '', topK = 1) {
  const startedAt = Date.now();
  recordSemanticSelectionAttempt({ scope: SCOPE });

  const clean = (texts || []).filter((t) => typeof t === 'string' && t.trim());
  const queryText = typeof query === 'string' ? query.trim() : '';

  // P1-03: Short-circuit - empty inputs
  if (!clean.length || !queryText) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'empty_inputs' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return clean.slice(0, topK);
  }

  // P1-03: Short-circuit - if texts.length <= topK, no need for ranking
  if (clean.length <= topK) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'small_input' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return clean;
  }

  try {
    // P1-03: Parallel embedding - get all embeddings concurrently
    const [queryVec, ...textVecs] = await Promise.all([
      getVec(queryText),
      ...clean.map((text) => getVec(text)),
    ]);

    const scored = clean.map((text, i) => ({
      text,
      idx: i,
      score: cosine(queryVec, textVecs[i]),
    }));

    scored.sort((a, b) => {
      if (b.score === a.score) return a.idx - b.idx;
      return b.score - a.score;
    });

    recordSemanticSelectionSuccess({ scope: SCOPE });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'success', durationMs: Date.now() - startedAt });
    return scored.slice(0, topK).map((s) => s.text);
  } catch (error) {
    console.warn('[semantic_ranker] fallback to original order due to error:', error?.message || error);
    recordSemanticSelectionFallback({ scope: SCOPE, reason: error?.code || 'error' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'fallback', durationMs: Date.now() - startedAt });
    return clean.slice(0, topK);
  }
}

export default {
  rankTextsBySimilarity,
};
