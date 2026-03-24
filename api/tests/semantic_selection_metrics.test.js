import { describe, it, expect } from 'vitest';

import {
  resetSemanticSelectionMetrics,
  recordSemanticSelectionAttempt,
  recordSemanticSelectionSuccess,
  recordSemanticSelectionDuration,
  recordEmbeddingCall,
  buildSemanticSelectionMetricsLines,
} from '../services/llm/semantic_selection_metrics.js';

describe('semantic selection metrics (P1-04)', () => {
  it('emits stable metric names for both scopes', () => {
    resetSemanticSelectionMetrics();
    const text = buildSemanticSelectionMetricsLines().join('\n');

    expect(text).toContain('## llm_semantic_selection');
    expect(text).toContain('omytree_semantic_selection_attempts_total{scope="recent_dialogue"} 0');
    expect(text).toContain('omytree_semantic_selection_attempts_total{scope="semantic_ranker"} 0');
    expect(text).toContain('omytree_semantic_selection_duration_ms_sum{scope="recent_dialogue",outcome="success"} 0');
    expect(text).toContain('omytree_embedding_calls_total{scope="semantic_ranker"} 0');
  });

  it('records duration samples and embedding calls', () => {
    resetSemanticSelectionMetrics();

    recordSemanticSelectionAttempt({ scope: 'recent_dialogue' });
    recordSemanticSelectionSuccess({ scope: 'recent_dialogue' });
    recordSemanticSelectionDuration({ scope: 'recent_dialogue', outcome: 'success', durationMs: 12 });
    recordEmbeddingCall({ scope: 'recent_dialogue' });

    const text = buildSemanticSelectionMetricsLines().join('\n');
    expect(text).toContain('omytree_embedding_calls_total{scope="recent_dialogue"} 1');
    expect(text).toContain('omytree_semantic_selection_duration_ms_sum{scope="recent_dialogue",outcome="success"} 12');
    expect(text).toContain('omytree_semantic_selection_duration_ms_count{scope="recent_dialogue",outcome="success"} 1');
  });
});

