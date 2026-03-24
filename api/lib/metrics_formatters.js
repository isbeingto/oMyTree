import { getMetrics, getStats } from "../bus/event_bus.js";
import TreeSyncBus from "../events/tree_sync.js";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export const UNIFIED_METRICS_HEADER = "# omytree unified metrics";

function coerceMetricNumber(name, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new TypeError(`metric ${name} must be numeric`);
  }
  return value;
}

function formatIntegerCounter(name, raw) {
  const value = coerceMetricNumber(name, raw);
  const truncated = Math.trunc(value);
  const normalized = truncated <= 0 ? 0 : truncated > MAX_SAFE ? MAX_SAFE : truncated;
  return `${name} ${normalized}`;
}

function formatNonNegativeNumber(name, raw) {
  const value = coerceMetricNumber(name, raw);
  const normalized = value < 0 ? 0 : value;
  return `${name} ${Object.is(normalized, -0) ? 0 : normalized}`;
}

export function buildExtMetricsLines() {
  return ["# omytree v0.4-lite metrics", formatIntegerCounter("plugins_total", 0)];
}

export function buildBusMetricsLines() {
  const stats = getStats();
  const metrics = getMetrics();
  const totalEvents = metrics.eventsTotal ?? stats.total ?? 0;
  const emitDurationMs = metrics.emitDurationMs ?? 0;
  const traceActive = metrics.traceActive ?? stats.traceActive ?? 0;
  const topicCount = Object.keys(stats.topics ?? {}).length;

  return [
    "# omytree bus metrics v0.4-lite",
    formatIntegerCounter("omytree_bus_events_total", totalEvents),
    formatNonNegativeNumber("omytree_bus_emit_duration_ms", emitDurationMs),
    formatIntegerCounter("omytree_bus_trace_active", traceActive),
    formatIntegerCounter("omytree_bus_topics", topicCount),
  ];
}

function ensureBridge(bridge) {
  if (!bridge || typeof bridge.getState !== "function") {
    throw new Error("tree metrics router requires a bridge with getState()");
  }

  return bridge;
}

export function buildTreeMetricsLines(bridge) {
  const resolvedBridge = ensureBridge(bridge);
  const state = resolvedBridge.getState();
  const updatesRaw = state?.updates_total ?? 0;
  const lastUpdateRaw = state?.last_update_ts ?? 0;
  const tracePresent = state?.last_trace_id ? 1 : 0;

  return [
    "# omytree tree metrics v0.4-lite",
    formatIntegerCounter("omytree_tree_updates_total", updatesRaw),
    formatIntegerCounter("omytree_tree_last_update_ts", lastUpdateRaw),
    formatIntegerCounter("omytree_tree_last_trace_present", tracePresent),
  ];
}

function toSafeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  const truncated = Math.trunc(number);
  return truncated < 0 ? 0 : truncated;
}

export function buildTreePersistenceMetricsLines(state = {}) {
  const dbUp = state?.dbUp ? 1 : 0;
  const nodesTotal = toSafeInteger(state?.nodesTotal ?? state?.total_nodes);
  const edgesTotal = toSafeInteger(state?.edgesTotal ?? state?.total_edges);
  const persistTotal = toSafeInteger(state?.persistTotal ?? state?.persist_total);

  // Get event counters from TreeSyncBus
  const eventCounters = TreeSyncBus.getEventCounters();
  const eventLines = [];
  
  // Add specific counters for snapshot and replay
  const snapshotCount = eventCounters.get("tree_snapshot_created") || 0;
  const replayCount = eventCounters.get("tree_replayed") || 0;
  
  // Add all event type counters
  for (const [eventType, count] of eventCounters) {
    eventLines.push(formatIntegerCounter(`tree_events_total{type="${eventType}"}`, count));
  }

  return [
    "## tree_persistence",
    formatIntegerCounter("omytree_tree_db_up", dbUp),
    formatIntegerCounter("omytree_tree_nodes_total", nodesTotal),
    formatIntegerCounter("omytree_tree_edges_total", edgesTotal),
    formatIntegerCounter("omytree_tree_persist_total", persistTotal),
    formatIntegerCounter('tree_snapshots_total{tree="demo"}', snapshotCount),
    formatIntegerCounter('tree_replay_total{tree="demo"}', replayCount),
    ...eventLines,
  ];
}

export function buildBridgeMetricsLines(bridge) {
  const resolvedBridge = ensureBridge(bridge);
  const state = resolvedBridge.getState();
  const forwardedRaw = state?.forwarded_total ?? 0;
  const errorsRaw = state?.errors_total ?? 0;
  const lastEventRaw = state?.last_event_ts ?? 0;
  const tracePresent = state?.last_trace_id ? 1 : 0;

  return [
    "## bridge",
    formatIntegerCounter("omytree_bridge_events_forwarded_total", forwardedRaw),
    formatIntegerCounter("omytree_bridge_errors_total", errorsRaw),
    formatIntegerCounter("omytree_bridge_last_event_ts", lastEventRaw),
    formatIntegerCounter("omytree_bridge_last_trace_present", tracePresent),
  ];
}
