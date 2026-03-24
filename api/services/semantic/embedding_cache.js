/**
 * P1-03: Shared LRU embedding cache with TTL and provider-aware keys.
 * P1-04: Instrumented with metrics for cache hits/misses/size.
 * 
 * Features:
 * - LRU eviction when cache exceeds maxSize
 * - TTL-based expiration
 * - Cache key includes provider/model/dim to avoid cross-config collisions
 */

import {
    recordEmbeddingCacheHit,
    recordEmbeddingCacheMiss,
    updateEmbeddingCacheSize,
} from '../llm/semantic_selection_metrics.js';

const MAX_CACHE_SIZE = parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE || '500', 10) || 500;
const TTL_MS = parseInt(process.env.EMBEDDING_CACHE_TTL_MS || '3600000', 10) || 3600000; // 1 hour default

class EmbeddingCache {
    constructor(maxSize = MAX_CACHE_SIZE, ttlMs = TTL_MS) {
        this.maxSize = Math.max(1, maxSize);
        this.ttlMs = Math.max(1000, ttlMs);
        this.cache = new Map(); // key -> { vec, ts }
    }

    /**
     * Build a cache key that includes provider/model/dim to avoid cross-config collisions.
     * @param {string} text
     * @param {string} provider
     * @param {string} model
     * @param {number} dim
     * @returns {string}
     */
    makeKey(text, provider = 'mock', model = '', dim = 64) {
        return `${provider}:${model}:${dim}:${text}`;
    }

    /**
     * Get a cached embedding if it exists and is not expired.
     * Implements LRU by moving accessed entries to the end.
     * @param {string} key
     * @returns {number[] | null}
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            recordEmbeddingCacheMiss();
            return null;
        }
        if (Date.now() - entry.ts > this.ttlMs) {
            this.cache.delete(key);
            this._updateSizeMetric();
            recordEmbeddingCacheMiss();
            return null;
        }
        // LRU: move to end by re-inserting
        this.cache.delete(key);
        this.cache.set(key, entry);
        recordEmbeddingCacheHit();
        return entry.vec;
    }

    /**
     * Set a cached embedding, evicting oldest entry if at capacity.
     * @param {string} key
     * @param {number[]} vec
     */
    set(key, vec) {
        // Evict oldest (first key) if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) {
                this.cache.delete(oldest);
            }
        }
        this.cache.set(key, { vec, ts: Date.now() });
        this._updateSizeMetric();
    }

    /**
     * Check if a key exists and is not expired (without affecting LRU order).
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        if (Date.now() - entry.ts > this.ttlMs) {
            this.cache.delete(key);
            this._updateSizeMetric();
            return false;
        }
        return true;
    }

    /** Current cache size */
    get size() {
        return this.cache.size;
    }

    /** Clear all cached entries */
    clear() {
        this.cache.clear();
        this._updateSizeMetric();
    }

    /** P1-04: Update size metric */
    _updateSizeMetric() {
        updateEmbeddingCacheSize(this.cache.size);
    }
}

// Shared singleton instance
export const embeddingCache = new EmbeddingCache();

// Export class for testing or custom instances
export { EmbeddingCache };

export default {
    embeddingCache,
    EmbeddingCache,
};
