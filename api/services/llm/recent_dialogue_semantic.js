/**
 * Semantic recent dialogue selector (T46-1).
 * Falls back to recency when disabled or on error.
 * 
 * P1-03: Uses shared LRU cache, short-circuit optimization, and parallel embedding.
 * P1-04: Instrumented with metrics for monitoring.
 * P1-05: Neighborhood expansion and hybrid scoring for quality enhancement.
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

const SCOPE = 'recent_dialogue';

// Cache key config (for provider-aware caching)
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
const EMBEDDING_MODEL = (process.env.EMBEDDING_MODEL || process.env.EMBEDDING_OPENAI_MODEL || '').trim();
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '64', 10) || 64;

// P1-05: Hybrid scoring weight (0-1, 1=pure semantic, 0=pure recency)
function getSemanticWeight() {
  return Math.max(0, Math.min(1, parseFloat(process.env.SEMANTIC_SCORE_WEIGHT || '0.8') || 0.8));
}

// P1-05: Neighborhood expansion config
function getNeighborExpand() {
  return parseInt(process.env.SEMANTIC_NEIGHBOR_EXPAND || '1', 10) || 0;
}

function isNeighborExpandEnabled() {
  return !['0', 'false', 'no', 'off'].includes(
    (process.env.SEMANTIC_NEIGHBOR_EXPAND_ENABLED || 'true').toLowerCase()
  );
}


function isSemanticEnabled() {
  const flag = (process.env.RECENT_DIALOGUE_SEMANTIC_ENABLED || 'true').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(flag);
}

const PROFILE_RULES = {
  lite: { window: 6, topK: 2 },
  standard: { window: 10, topK: 4 },
  max: { window: 12, topK: 5 },
};

// P1-03: Minimum query length for semantic selection (short queries fallback to recency)
const MIN_QUERY_LENGTH = parseInt(process.env.SEMANTIC_MIN_QUERY_LENGTH || '3', 10) || 3;

function normalizeTurnList(turns = []) {
  if (!Array.isArray(turns)) return [];
  return turns
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      // P1-02: Normalize role - map 'ai' to 'assistant' for Native Provider compatibility
      let role = typeof t.role === 'string' ? t.role : 'user';
      if (role === 'ai') role = 'assistant';
      const text = typeof t.text === 'string' ? t.text.trim() : '';
      if (!text) return null;
      return {
        role,
        text,
        topic_tag: typeof t.topic_tag === 'string' ? t.topic_tag : null,
        reasoning_content: typeof t.reasoning_content === 'string' ? t.reasoning_content : null,
        thought_signature: typeof t.thought_signature === 'string' ? t.thought_signature : null,
        // P1-02: Preserve attachments for Native Provider history
        attachments: Array.isArray(t.attachments) ? t.attachments : [],
        hydratedAttachments: Array.isArray(t.hydratedAttachments) ? t.hydratedAttachments : [],
      };
    })
    .filter(Boolean);
}

function cosineSimilarity(a, b) {
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
 * P1-03: Get embedding with shared LRU cache.
 */
async function getEmbedding(text) {
  const key = embeddingCache.makeKey(text, EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIM);
  const cached = embeddingCache.get(key);
  if (cached) return cached;

  recordEmbeddingCall({ scope: SCOPE });
  const vec = await embedText(text);
  embeddingCache.set(key, vec);
  return vec;
}

/**
 * P1-05: Expand picked indices to include neighboring turns for coherence.
 * @param {number[]} pickedIndices - Indices of selected turns
 * @param {number} windowSize - Total window size (to prevent out-of-bounds)
 * @param {number} expand - Number of neighbors to add on each side
 * @returns {number[]} - Expanded and sorted indices
 */
function expandNeighborhood(pickedIndices, windowSize, expand = 1) {
  if (!isNeighborExpandEnabled() || expand <= 0) return pickedIndices;

  const expanded = new Set(pickedIndices);
  for (const idx of pickedIndices) {
    for (let d = 1; d <= expand; d++) {
      if (idx - d >= 0) expanded.add(idx - d);
      if (idx + d < windowSize) expanded.add(idx + d);
    }
  }
  return [...expanded].sort((a, b) => a - b);
}

function buildFinalIndices({ pickedIndices = [], expandedIndices = [], limit = 0 } = {}) {
  const n = Math.max(0, limit || 0);
  if (n === 0) return [];

  // Keep semantic hits first (score order), then fill with most-recent neighbors.
  const pickedUnique = [...new Set(pickedIndices.filter((v) => Number.isInteger(v)))];
  const keptHits = pickedUnique.length > n ? pickedUnique.slice(0, n) : pickedUnique;
  const keptSet = new Set(keptHits);

  const neighbors = expandedIndices
    .filter((v) => Number.isInteger(v) && !keptSet.has(v))
    .sort((a, b) => a - b);

  const remaining = n - keptHits.length;
  const final = [...keptHits, ...neighbors.slice(0, remaining)].sort((a, b) => a - b);
  return final;
}

/**
 * Select recent dialogue turns by semantic similarity to the current user text.
 * @param {object} params
 * @param {Array<{role:string,text:string}>} params.turns
 * @param {string} params.userText
 * @param {string} params.profile - 'lite' | 'standard' | 'max'
 * @param {number} params.limit - max turns allowed after selection (respects context limits)
 * @returns {Promise<Array<{role:string,text:string}>>}
 */
export async function selectRecentDialogueSemantic({
  turns = [],
  userText = '',
  profile = 'lite',
  limit = 0,
} = {}) {
  const startedAt = Date.now();
  recordSemanticSelectionAttempt({ scope: SCOPE });

  const normalized = normalizeTurnList(turns);
  const effectiveLimit = Math.max(0, limit || normalized.length);
  const queryText = typeof userText === 'string' ? userText.trim() : '';

  // P1-03: Short-circuit - disabled
  if (!isSemanticEnabled()) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'disabled' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return normalized.slice(0, effectiveLimit);
  }

  // P1-03: Short-circuit - empty turns
  if (normalized.length === 0) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'empty_turns' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return normalized.slice(0, effectiveLimit);
  }

  // P1-03: Short-circuit - empty or short query
  if (!queryText || queryText.length < MIN_QUERY_LENGTH) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'short_query' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return normalized.slice(0, effectiveLimit);
  }

  const rule = PROFILE_RULES[profile] || PROFILE_RULES.lite;
  const windowSize = Math.min(rule.window, normalized.length);
  const topK = Math.min(rule.topK, effectiveLimit || rule.topK, windowSize);
  const window = normalized.slice(0, windowSize);

  // P1-03: Short-circuit - if window size <= topK, no need for semantic selection
  if (windowSize <= topK) {
    recordSemanticSelectionShortcircuit({ scope: SCOPE, reason: 'window_small' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'shortcircuit', durationMs: Date.now() - startedAt });
    return window.slice(0, effectiveLimit);
  }

  try {
    // P1-03: Parallel embedding - get all embeddings concurrently
    const [queryVec, ...turnVecs] = await Promise.all([
      getEmbedding(queryText),
      ...window.map((turn) => getEmbedding(turn.text)),
    ]);

    // P1-05: Hybrid scoring - combine semantic similarity with recency
    const scored = window.map((turn, i) => {
      const semanticScore = cosineSimilarity(queryVec, turnVecs[i]);
      const recencyScore = 1 - (i / windowSize); // Higher for more recent (lower index)
      const semanticWeight = getSemanticWeight();
      const hybridScore = semanticWeight * semanticScore + (1 - semanticWeight) * recencyScore;
      return { turn, idx: i, score: hybridScore, semanticScore, recencyScore };
    });

    scored.sort((a, b) => {
      if (b.score === a.score) return a.idx - b.idx; // prefer earlier recency within window
      return b.score - a.score;
    });

    // Select top K indices
    const pickedIndices = scored.slice(0, topK).map((s) => s.idx);

    // P1-05: Expand neighborhood for coherence
    const expandedIndices = expandNeighborhood(pickedIndices, windowSize, getNeighborExpand());

    // P1-05: Keep semantic hits, fill with most-recent neighbors, then restore time order
    const finalIndices = buildFinalIndices({
      pickedIndices,
      expandedIndices,
      limit: effectiveLimit,
    });
    const result = finalIndices.map((idx) => window[idx]);

    recordSemanticSelectionSuccess({ scope: SCOPE });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'success', durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    console.warn('[recent_dialogue_semantic] fallback to recency due to error:', error?.message || error);
    recordSemanticSelectionFallback({ scope: SCOPE, reason: 'error' });
    recordSemanticSelectionDuration({ scope: SCOPE, outcome: 'fallback', durationMs: Date.now() - startedAt });
    return normalized.slice(0, effectiveLimit);
  }
}

export default {
  selectRecentDialogueSemantic,
};
