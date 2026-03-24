/**
 * P2: Branch Summary & Cross-branch Metrics (in-memory, Prometheus text format)
 */

const generationCounts = {
  attempt: 0,
  success: 0,
  error: 0,
  skipped: 0,
};

const detectionCounts = {
  attempt: 0,
  hit: 0,
  miss: 0,
  error: 0,
};

let referenceCount = 0;

const durationStore = {
  generation: { sumMs: 0, count: 0, error: { sumMs: 0, count: 0 }, success: { sumMs: 0, count: 0 } },
  detection: { sumMs: 0, count: 0, error: { sumMs: 0, count: 0 }, hit: { sumMs: 0, count: 0 }, miss: { sumMs: 0, count: 0 } },
};

function recordDuration(bucket, outcome, durationMs) {
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms < 0) return;
  const base = durationStore[bucket];
  if (!base) return;
  base.sumMs += ms;
  base.count += 1;
  if (outcome && base[outcome]) {
    base[outcome].sumMs += ms;
    base[outcome].count += 1;
  }
}

export function recordBranchSummaryGenerationAttempt() {
  generationCounts.attempt += 1;
}

export function recordBranchSummaryGenerationSuccess() {
  generationCounts.success += 1;
}

export function recordBranchSummaryGenerationError() {
  generationCounts.error += 1;
}

export function recordBranchSummaryGenerationSkipped() {
  generationCounts.skipped += 1;
}

export function recordBranchSummaryGenerationDuration({ durationMs, outcome } = {}) {
  recordDuration('generation', outcome, durationMs);
}

export function recordCrossBranchDetectionAttempt() {
  detectionCounts.attempt += 1;
}

export function recordCrossBranchDetectionHit() {
  detectionCounts.hit += 1;
}

export function recordCrossBranchDetectionMiss() {
  detectionCounts.miss += 1;
}

export function recordCrossBranchDetectionError() {
  detectionCounts.error += 1;
}

export function recordCrossBranchDetectionDuration({ durationMs, outcome } = {}) {
  recordDuration('detection', outcome, durationMs);
}

export function recordCrossBranchReferenceCount(count = 1) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return;
  referenceCount += n;
}

export function resetBranchSummaryMetrics() {
  generationCounts.attempt = 0;
  generationCounts.success = 0;
  generationCounts.error = 0;
  generationCounts.skipped = 0;
  detectionCounts.attempt = 0;
  detectionCounts.hit = 0;
  detectionCounts.miss = 0;
  detectionCounts.error = 0;
  referenceCount = 0;
  durationStore.generation = { sumMs: 0, count: 0, error: { sumMs: 0, count: 0 }, success: { sumMs: 0, count: 0 } };
  durationStore.detection = { sumMs: 0, count: 0, error: { sumMs: 0, count: 0 }, hit: { sumMs: 0, count: 0 }, miss: { sumMs: 0, count: 0 } };
}

export function buildBranchSummaryMetricsLines() {
  const lines = [];
  lines.push('## llm_branch_summary');
  lines.push('');

  lines.push('# HELP omytree_branch_summary_generation_total Branch summary generation counts by outcome');
  lines.push('# TYPE omytree_branch_summary_generation_total counter');
  for (const [outcome, count] of Object.entries(generationCounts)) {
    lines.push(`omytree_branch_summary_generation_total{outcome="${outcome}"} ${count}`);
  }
  lines.push('');

  lines.push('# HELP omytree_branch_summary_generation_duration_ms Total duration of branch summary generation (ms)');
  lines.push('# TYPE omytree_branch_summary_generation_duration_ms counter');
  lines.push(`omytree_branch_summary_generation_duration_ms_sum ${durationStore.generation.sumMs}`);
  lines.push(`omytree_branch_summary_generation_duration_ms_count ${durationStore.generation.count}`);
  lines.push('');

  lines.push('# HELP omytree_cross_branch_detection_total Cross-branch detection counts by outcome');
  lines.push('# TYPE omytree_cross_branch_detection_total counter');
  for (const [outcome, count] of Object.entries(detectionCounts)) {
    lines.push(`omytree_cross_branch_detection_total{outcome="${outcome}"} ${count}`);
  }
  lines.push('');

  lines.push('# HELP omytree_cross_branch_detection_duration_ms Total duration of cross-branch detection (ms)');
  lines.push('# TYPE omytree_cross_branch_detection_duration_ms counter');
  lines.push(`omytree_cross_branch_detection_duration_ms_sum ${durationStore.detection.sumMs}`);
  lines.push(`omytree_cross_branch_detection_duration_ms_count ${durationStore.detection.count}`);
  lines.push('');

  lines.push('# HELP omytree_cross_branch_reference_total Total referenced branches injected into context');
  lines.push('# TYPE omytree_cross_branch_reference_total counter');
  lines.push(`omytree_cross_branch_reference_total ${referenceCount}`);

  return lines;
}

export default {
  recordBranchSummaryGenerationAttempt,
  recordBranchSummaryGenerationSuccess,
  recordBranchSummaryGenerationError,
  recordBranchSummaryGenerationSkipped,
  recordBranchSummaryGenerationDuration,
  recordCrossBranchDetectionAttempt,
  recordCrossBranchDetectionHit,
  recordCrossBranchDetectionMiss,
  recordCrossBranchDetectionError,
  recordCrossBranchDetectionDuration,
  recordCrossBranchReferenceCount,
  resetBranchSummaryMetrics,
  buildBranchSummaryMetricsLines,
};

