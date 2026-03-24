const successCounters = new Map();
const failureCounters = new Map();

function makeKey(provider, profile) {
  const p = provider && typeof provider === 'string' ? provider : 'unknown';
  const prof = profile && typeof profile === 'string' ? profile : 'unknown';
  return `${p}|||${prof}`;
}

function parseKey(key) {
  const [provider, profile] = (key || '').split('|||');
  return {
    provider: provider || 'unknown',
    profile: profile || 'unknown',
  };
}

function increment(map, provider, profile) {
  const key = makeKey(provider, profile);
  map.set(key, (map.get(key) || 0) + 1);
}

function formatCounter(name, provider, profile, value) {
  const safeValue = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  return `${name}{provider="${provider}",context_profile="${profile}"} ${safeValue}`;
}

export function markTreeSummarySuccess(provider, profile) {
  increment(successCounters, provider, profile);
}

export function markTreeSummaryFailure(provider, profile) {
  increment(failureCounters, provider, profile);
}

export function buildTreeSummaryMetricsLines() {
  const lines = ['## tree_summary'];
  for (const [key, value] of successCounters.entries()) {
    const { provider, profile } = parseKey(key);
    lines.push(formatCounter('tree_summary_update_success_total', provider, profile, value));
  }
  for (const [key, value] of failureCounters.entries()) {
    const { provider, profile } = parseKey(key);
    lines.push(formatCounter('tree_summary_update_failure_total', provider, profile, value));
  }
  return lines;
}

export function getTreeSummaryMetricsSnapshot() {
  const success = {};
  for (const [key, value] of successCounters.entries()) {
    success[key] = value;
  }
  const failure = {};
  for (const [key, value] of failureCounters.entries()) {
    failure[key] = value;
  }
  return { success, failure };
}

export function resetTreeSummaryMetrics() {
  successCounters.clear();
  failureCounters.clear();
}

export default {
  markTreeSummarySuccess,
  markTreeSummaryFailure,
  buildTreeSummaryMetricsLines,
  getTreeSummaryMetricsSnapshot,
  resetTreeSummaryMetrics,
};
