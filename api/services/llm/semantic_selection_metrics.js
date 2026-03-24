/**
 * P1-04: Semantic Selection Metrics (in-memory, Prometheus text format)
 *
 * Tracks:
 * - Selection attempts/success/fallback by scope (recent_dialogue / semantic_ranker)
 * - Short-circuit events by reason
 * - Embedding cache hits/misses/size
 * - Embedding calls (post-cache) by scope
 * - Selection duration (ms) by scope/outcome
 */

// Metric stores
const SELECTION_SCOPES = ['recent_dialogue', 'semantic_ranker'];
const DURATION_OUTCOMES = ['success', 'fallback', 'shortcircuit'];

const selectionStore = new Map(); // scope -> { attempts, success, fallback: Map<reason, count>, shortcircuit: Map<reason, count> }
let cacheHits = 0;
let cacheMisses = 0;
let cacheSize = 0;
const embeddingCallsStore = new Map(); // scope -> count
const durationStore = new Map(); // scope -> Map<outcome, { sumMs, count }>

function normalizeScope(value) {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return s || 'unknown';
}

function normalizeOutcome(value) {
    const o = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (o === 'success' || o === 'fallback' || o === 'shortcircuit') return o;
    return 'unknown';
}

function normalizeReason(value) {
    const r = typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
    return r || 'unknown';
}

function getSelectionEntry(scope) {
    const key = normalizeScope(scope);
    if (!selectionStore.has(key)) {
        selectionStore.set(key, {
            attempts: 0,
            success: 0,
            fallback: new Map(),
            shortcircuit: new Map(),
        });
    }
    return selectionStore.get(key);
}

function getDurationEntry(scope, outcome) {
    const key = normalizeScope(scope);
    const o = normalizeOutcome(outcome);
    if (!durationStore.has(key)) {
        durationStore.set(key, new Map());
    }
    const byOutcome = durationStore.get(key);
    if (!byOutcome.has(o)) {
        byOutcome.set(o, { sumMs: 0, count: 0 });
    }
    return byOutcome.get(o);
}

// ============================================================
// Recording functions
// ============================================================

export function recordSemanticSelectionAttempt({ scope } = {}) {
    const entry = getSelectionEntry(scope);
    entry.attempts += 1;
}

export function recordSemanticSelectionSuccess({ scope } = {}) {
    const entry = getSelectionEntry(scope);
    entry.success += 1;
}

export function recordSemanticSelectionFallback({ scope, reason } = {}) {
    const entry = getSelectionEntry(scope);
    const r = normalizeReason(reason);
    entry.fallback.set(r, (entry.fallback.get(r) || 0) + 1);
}

export function recordSemanticSelectionShortcircuit({ scope, reason } = {}) {
    const entry = getSelectionEntry(scope);
    const r = normalizeReason(reason);
    entry.shortcircuit.set(r, (entry.shortcircuit.get(r) || 0) + 1);
}

export function recordEmbeddingCacheHit() {
    cacheHits += 1;
}

export function recordEmbeddingCacheMiss() {
    cacheMisses += 1;
}

export function updateEmbeddingCacheSize(size) {
    cacheSize = typeof size === 'number' && Number.isFinite(size) ? size : 0;
}

export function recordEmbeddingCall({ scope } = {}) {
    const key = normalizeScope(scope);
    embeddingCallsStore.set(key, (embeddingCallsStore.get(key) || 0) + 1);
}

export function recordSemanticSelectionDuration({ scope, outcome, durationMs } = {}) {
    const v = Number(durationMs);
    if (!Number.isFinite(v) || v < 0) return;
    const entry = getDurationEntry(scope, outcome);
    entry.sumMs += v;
    entry.count += 1;
}

export function resetSemanticSelectionMetrics() {
    selectionStore.clear();
    cacheHits = 0;
    cacheMisses = 0;
    cacheSize = 0;
    embeddingCallsStore.clear();
    durationStore.clear();
}

// ============================================================
// Snapshot (for testing)
// ============================================================

export function getSemanticSelectionMetricsSnapshot() {
    const entries = [];
    for (const [scope, data] of selectionStore.entries()) {
        entries.push({
            scope,
            attempts: data.attempts,
            success: data.success,
            fallback: Object.fromEntries(data.fallback),
            shortcircuit: Object.fromEntries(data.shortcircuit),
        });
    }

    const embeddingCalls = {};
    for (const [scope, count] of embeddingCallsStore.entries()) {
        embeddingCalls[scope] = count;
    }

    const durations = {};
    for (const [scope, byOutcome] of durationStore.entries()) {
        durations[scope] = Object.fromEntries(
            [...byOutcome.entries()].map(([outcome, data]) => [outcome, { ...data }])
        );
    }

    return {
        selection: entries,
        durations,
        embeddingCalls,
        cache: { hits: cacheHits, misses: cacheMisses, size: cacheSize },
    };
}

// ============================================================
// Prometheus text format output
// ============================================================

export function buildSemanticSelectionMetricsLines() {
    const lines = [];

    lines.push('## llm_semantic_selection');
    lines.push('');

    // Attempts
    lines.push('# HELP omytree_semantic_selection_attempts_total Total number of semantic selection attempts');
    lines.push('# TYPE omytree_semantic_selection_attempts_total counter');
    for (const scope of SELECTION_SCOPES) {
        const data = selectionStore.get(scope);
        lines.push(`omytree_semantic_selection_attempts_total{scope="${scope}"} ${data ? data.attempts : 0}`);
    }
    lines.push('');

    // Success
    lines.push('# HELP omytree_semantic_selection_success_total Total number of successful semantic selections');
    lines.push('# TYPE omytree_semantic_selection_success_total counter');
    for (const scope of SELECTION_SCOPES) {
        const data = selectionStore.get(scope);
        lines.push(`omytree_semantic_selection_success_total{scope="${scope}"} ${data ? data.success : 0}`);
    }
    lines.push('');

    // Fallback
    lines.push('# HELP omytree_semantic_selection_fallback_total Total number of semantic selection fallbacks by reason');
    lines.push('# TYPE omytree_semantic_selection_fallback_total counter');
    for (const [scope, data] of selectionStore.entries()) {
        for (const [reason, count] of data.fallback.entries()) {
            lines.push(`omytree_semantic_selection_fallback_total{scope="${scope}",reason="${reason}"} ${count}`);
        }
    }
    lines.push('');

    // Short-circuit
    lines.push('# HELP omytree_semantic_selection_shortcircuit_total Total number of semantic selection short-circuits by reason');
    lines.push('# TYPE omytree_semantic_selection_shortcircuit_total counter');
    for (const [scope, data] of selectionStore.entries()) {
        for (const [reason, count] of data.shortcircuit.entries()) {
            lines.push(`omytree_semantic_selection_shortcircuit_total{scope="${scope}",reason="${reason}"} ${count}`);
        }
    }
    lines.push('');

    // Duration (sum)
    lines.push('# HELP omytree_semantic_selection_duration_ms_sum Total duration in ms of semantic selection by scope/outcome');
    lines.push('# TYPE omytree_semantic_selection_duration_ms_sum counter');
    for (const scope of SELECTION_SCOPES) {
        const byOutcome = durationStore.get(scope);
        for (const outcome of DURATION_OUTCOMES) {
            const entry = byOutcome ? byOutcome.get(outcome) : null;
            const value = entry ? entry.sumMs : 0;
            lines.push(`omytree_semantic_selection_duration_ms_sum{scope="${scope}",outcome="${outcome}"} ${value}`);
        }
    }
    lines.push('');

    // Duration (count)
    lines.push('# HELP omytree_semantic_selection_duration_ms_count Total number of semantic selection duration samples by scope/outcome');
    lines.push('# TYPE omytree_semantic_selection_duration_ms_count counter');
    for (const scope of SELECTION_SCOPES) {
        const byOutcome = durationStore.get(scope);
        for (const outcome of DURATION_OUTCOMES) {
            const entry = byOutcome ? byOutcome.get(outcome) : null;
            const value = entry ? entry.count : 0;
            lines.push(`omytree_semantic_selection_duration_ms_count{scope="${scope}",outcome="${outcome}"} ${value}`);
        }
    }
    lines.push('');

    // Embedding calls
    lines.push('# HELP omytree_embedding_calls_total Total number of embedding calls (after cache miss) by scope');
    lines.push('# TYPE omytree_embedding_calls_total counter');
    for (const scope of SELECTION_SCOPES) {
        const value = embeddingCallsStore.get(scope) || 0;
        lines.push(`omytree_embedding_calls_total{scope="${scope}"} ${value}`);
    }
    lines.push('');

    // Cache metrics
    lines.push('# HELP omytree_embedding_cache_hits_total Total embedding cache hits');
    lines.push('# TYPE omytree_embedding_cache_hits_total counter');
    lines.push(`omytree_embedding_cache_hits_total ${cacheHits}`);
    lines.push('');

    lines.push('# HELP omytree_embedding_cache_misses_total Total embedding cache misses');
    lines.push('# TYPE omytree_embedding_cache_misses_total counter');
    lines.push(`omytree_embedding_cache_misses_total ${cacheMisses}`);
    lines.push('');

    lines.push('# HELP omytree_embedding_cache_size Current embedding cache size');
    lines.push('# TYPE omytree_embedding_cache_size gauge');
    lines.push(`omytree_embedding_cache_size ${cacheSize}`);

    return lines;
}

export default {
    recordSemanticSelectionAttempt,
    recordSemanticSelectionSuccess,
    recordSemanticSelectionFallback,
    recordSemanticSelectionShortcircuit,
    recordSemanticSelectionDuration,
    recordEmbeddingCall,
    recordEmbeddingCacheHit,
    recordEmbeddingCacheMiss,
    updateEmbeddingCacheSize,
    resetSemanticSelectionMetrics,
    getSemanticSelectionMetricsSnapshot,
    buildSemanticSelectionMetricsLines,
};
