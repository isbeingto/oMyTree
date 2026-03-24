/**
 * P0-05: Rolling Summary Metrics (in-memory, Prometheus text format)
 *
 * Included in /metrics via metrics_unified router.
 * - Updater (async write-path) outcomes
 * - Compression (LLM) latency + summary length histograms
 */

const UPDATER_PROFILES = ['lite', 'standard', 'max'];
const UPDATER_SKIP_REASONS = ['disabled', 'missing_pool', 'invalid_node_id', 'locked'];

const LATENCY_MS_BUCKETS = [50, 100, 250, 500, 1000, 3000, 10000, Infinity];
const SUMMARY_LENGTH_BUCKETS = [100, 200, 300, 450, 600, 1000, Infinity];

const updaterStore = new Map();
const compressionStore = new Map();

function normalizeProfile(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'standard' || v === 'max' || v === 'lite') return v;
  return 'lite';
}

function normalizeLabel(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function getUpdaterEntry(profile) {
  const p = normalizeProfile(profile);
  if (!updaterStore.has(p)) {
    updaterStore.set(p, {
      profile: p,
      attempts_total: 0,
      success_total: 0,
      errors_total: 0,
      skipped_total: new Map(),
    });
  }
  return updaterStore.get(p);
}

function getCompressionEntry({ profile, provider, model }) {
  const p = normalizeProfile(profile);
  const prov = normalizeLabel(provider);
  const m = normalizeLabel(model);
  const key = `${p}__${prov}__${m}`;

  if (!compressionStore.has(key)) {
    compressionStore.set(key, {
      profile: p,
      provider: prov,
      model: m,
      compressions_total: 0,
      compressed_turns_total: 0,
      errors_total: 0,
      latency_histogram: new Map(LATENCY_MS_BUCKETS.map((b) => [b, 0])),
      latency_sum: 0,
      latency_count: 0,
      summary_length_histogram: new Map(SUMMARY_LENGTH_BUCKETS.map((b) => [b, 0])),
      summary_length_sum: 0,
      summary_length_count: 0,
    });
  }

  return compressionStore.get(key);
}

function observeHistogram(histMap, buckets, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return;
  for (const bucket of buckets) {
    if (v <= bucket) {
      histMap.set(bucket, (histMap.get(bucket) || 0) + 1);
      break;
    }
  }
}

export function recordRollingSummaryUpdateAttempt({ profile } = {}) {
  const entry = getUpdaterEntry(profile);
  entry.attempts_total += 1;
}

export function recordRollingSummaryUpdateSuccess({ profile } = {}) {
  const entry = getUpdaterEntry(profile);
  entry.success_total += 1;
}

export function recordRollingSummaryUpdateSkipped({ profile, reason } = {}) {
  const entry = getUpdaterEntry(profile);
  const r = normalizeLabel(reason, 'unknown');
  entry.skipped_total.set(r, (entry.skipped_total.get(r) || 0) + 1);
}

export function recordRollingSummaryUpdateError({ profile } = {}) {
  const entry = getUpdaterEntry(profile);
  entry.errors_total += 1;
}

export function recordRollingSummaryCompression({
  profile,
  provider,
  model,
  latencyMs,
  summaryLength,
  turnsCompressed,
} = {}) {
  const entry = getCompressionEntry({ profile, provider, model });
  entry.compressions_total += 1;

  const turns = Number(turnsCompressed);
  if (Number.isFinite(turns) && turns > 0) {
    entry.compressed_turns_total += Math.trunc(turns);
  }

  const latency = Number(latencyMs);
  if (Number.isFinite(latency) && latency >= 0) {
    entry.latency_sum += latency;
    entry.latency_count += 1;
    observeHistogram(entry.latency_histogram, LATENCY_MS_BUCKETS, latency);
  }

  const length = Number(summaryLength);
  if (Number.isFinite(length) && length >= 0) {
    entry.summary_length_sum += length;
    entry.summary_length_count += 1;
    observeHistogram(entry.summary_length_histogram, SUMMARY_LENGTH_BUCKETS, length);
  }
}

export function recordRollingSummaryCompressionError({ profile, provider, model } = {}) {
  const entry = getCompressionEntry({ profile, provider, model });
  entry.errors_total += 1;
}

export function resetRollingSummaryMetrics() {
  updaterStore.clear();
  compressionStore.clear();
}

export function getRollingSummaryMetricsSnapshot() {
  const updater = {};
  for (const [profile, entry] of updaterStore) {
    updater[profile] = {
      ...entry,
      skipped_total: Object.fromEntries(entry.skipped_total.entries()),
    };
  }

  const compression = {};
  for (const [key, entry] of compressionStore) {
    compression[key] = {
      ...entry,
      latency_histogram: Object.fromEntries(entry.latency_histogram.entries()),
      summary_length_histogram: Object.fromEntries(entry.summary_length_histogram.entries()),
    };
  }

  return { updater, compression };
}

export function buildRollingSummaryMetricsLines() {
  const lines = [
    '## llm_rolling_summary',
    '# HELP omytree_rolling_summary_update_attempts_total Total number of async rolling summary update attempts',
    '# TYPE omytree_rolling_summary_update_attempts_total counter',
  ];

  for (const profile of UPDATER_PROFILES) {
    const entry = updaterStore.get(profile);
    const value = entry ? entry.attempts_total : 0;
    lines.push(`omytree_rolling_summary_update_attempts_total{profile="${profile}"} ${value}`);
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_update_success_total Total number of async rolling summary updates that ran successfully',
    '# TYPE omytree_rolling_summary_update_success_total counter',
  );
  for (const profile of UPDATER_PROFILES) {
    const entry = updaterStore.get(profile);
    const value = entry ? entry.success_total : 0;
    lines.push(`omytree_rolling_summary_update_success_total{profile="${profile}"} ${value}`);
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_update_errors_total Total number of async rolling summary updates that failed (fail-open)',
    '# TYPE omytree_rolling_summary_update_errors_total counter',
  );
  for (const profile of UPDATER_PROFILES) {
    const entry = updaterStore.get(profile);
    const value = entry ? entry.errors_total : 0;
    lines.push(`omytree_rolling_summary_update_errors_total{profile="${profile}"} ${value}`);
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_update_skipped_total Total number of skipped async rolling summary updates by reason',
    '# TYPE omytree_rolling_summary_update_skipped_total counter',
  );
  for (const profile of UPDATER_PROFILES) {
    const entry = updaterStore.get(profile);
    for (const reason of UPDATER_SKIP_REASONS) {
      const value = entry ? (entry.skipped_total.get(reason) || 0) : 0;
      lines.push(`omytree_rolling_summary_update_skipped_total{profile="${profile}",reason="${reason}"} ${value}`);
    }
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_compressions_total Total number of rolling summary LLM compressions performed',
    '# TYPE omytree_rolling_summary_compressions_total counter',
  );
  for (const [_key, entry] of compressionStore) {
    lines.push(
      `omytree_rolling_summary_compressions_total{profile="${entry.profile}",provider="${entry.provider}",model="${entry.model}"} ${entry.compressions_total}`
    );
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_compressed_turns_total Total number of turns compressed into rolling summaries',
    '# TYPE omytree_rolling_summary_compressed_turns_total counter',
  );
  for (const [_key, entry] of compressionStore) {
    lines.push(
      `omytree_rolling_summary_compressed_turns_total{profile="${entry.profile}",provider="${entry.provider}",model="${entry.model}"} ${entry.compressed_turns_total}`
    );
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_compression_errors_total Total number of rolling summary compression errors (LLM failures)',
    '# TYPE omytree_rolling_summary_compression_errors_total counter',
  );
  for (const [_key, entry] of compressionStore) {
    lines.push(
      `omytree_rolling_summary_compression_errors_total{profile="${entry.profile}",provider="${entry.provider}",model="${entry.model}"} ${entry.errors_total}`
    );
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_compress_latency_ms_histogram Distribution of rolling summary compression latency in milliseconds',
    '# TYPE omytree_rolling_summary_compress_latency_ms_histogram histogram',
  );
  for (const [_key, entry] of compressionStore) {
    const labels = `profile="${entry.profile}",provider="${entry.provider}",model="${entry.model}"`;
    let cumulative = 0;
    for (const bucket of LATENCY_MS_BUCKETS) {
      cumulative += entry.latency_histogram.get(bucket) || 0;
      const leLabel = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(`omytree_rolling_summary_compress_latency_ms_histogram_bucket{${labels},le="${leLabel}"} ${cumulative}`);
    }
    lines.push(
      `omytree_rolling_summary_compress_latency_ms_histogram_sum{${labels}} ${entry.latency_sum}`,
      `omytree_rolling_summary_compress_latency_ms_histogram_count{${labels}} ${entry.latency_count}`,
    );
  }

  lines.push(
    '',
    '# HELP omytree_rolling_summary_summary_length_histogram Distribution of generated rolling summary lengths (characters)',
    '# TYPE omytree_rolling_summary_summary_length_histogram histogram',
  );
  for (const [_key, entry] of compressionStore) {
    const labels = `profile="${entry.profile}",provider="${entry.provider}",model="${entry.model}"`;
    let cumulative = 0;
    for (const bucket of SUMMARY_LENGTH_BUCKETS) {
      cumulative += entry.summary_length_histogram.get(bucket) || 0;
      const leLabel = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(`omytree_rolling_summary_summary_length_histogram_bucket{${labels},le="${leLabel}"} ${cumulative}`);
    }
    lines.push(
      `omytree_rolling_summary_summary_length_histogram_sum{${labels}} ${entry.summary_length_sum}`,
      `omytree_rolling_summary_summary_length_histogram_count{${labels}} ${entry.summary_length_count}`,
    );
  }

  return lines;
}

export default {
  recordRollingSummaryUpdateAttempt,
  recordRollingSummaryUpdateSuccess,
  recordRollingSummaryUpdateSkipped,
  recordRollingSummaryUpdateError,
  recordRollingSummaryCompression,
  recordRollingSummaryCompressionError,
  resetRollingSummaryMetrics,
  getRollingSummaryMetricsSnapshot,
  buildRollingSummaryMetricsLines,
};

