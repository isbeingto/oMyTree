import { randomUUID } from "crypto";
import { appendFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, "../var/log");
const LOG_PATH = resolve(LOG_DIR, "tree_sync.log");

// Ensure log directory exists
let logDirReady = false;
async function ensureLogDir() {
  if (!logDirReady) {
    try {
      await mkdir(LOG_DIR, { recursive: true });
      logDirReady = true;
    } catch (err) {
      console.error("[tree_sync] failed to create log directory:", err);
    }
  }
}

// Event types for tree synchronization
export const EVENT_TYPES = {
  NODE_CREATED: "node_created",
  NODE_UPDATED: "node_updated",
  NODE_DELETED: "node_deleted",
  EDGE_CREATED: "edge_created",
  EDGE_DELETED: "edge_deleted",
  TREE_RESET: "tree_reset",
  TREE_IMPORTED: "tree_imported",
  TREE_GROWN: "tree_grown",
  TREE_SNAPSHOT_CREATED: "tree_snapshot_created",
  TREE_REPLAYED: "tree_replayed",
};

// In-memory event counters for metrics
const eventCounters = new Map();
for (const type of Object.values(EVENT_TYPES)) {
  eventCounters.set(type, 0);
}

// Event handlers registry
const handlers = new Map();

/**
 * Emit a tree sync event
 * @param {string} type - Event type from EVENT_TYPES
 * @param {object} payload - Event payload
 * @param {string} traceId - Optional trace ID for observability
 * @returns {object} Event metadata
 */
export function emit(type, payload = {}, traceId = null) {
  const ts = new Date().toISOString();
  const eventId = `evt_${randomUUID()}`;
  const resolvedTraceId = traceId || `trace_${randomUUID()}`;

  // Increment counter
  const currentCount = eventCounters.get(type) || 0;
  eventCounters.set(type, currentCount + 1);

  const event = {
    id: eventId,
    type,
    payload,
    ts,
    trace_id: resolvedTraceId,
  };

  // Log to file (non-blocking)
  const logLine = JSON.stringify(event) + "\n";
  ensureLogDir().then(() => {
    return appendFile(LOG_PATH, logLine);
  }).catch((err) => {
    console.error("[tree_sync] failed to write log:", err);
  });

  // Call registered handlers
  const typeHandlers = handlers.get(type) || [];
  for (const handler of typeHandlers) {
    try {
      handler(event);
    } catch (err) {
      console.error(`[tree_sync] handler error for ${type}:`, err);
    }
  }

  return { id: eventId, ts, trace_id: resolvedTraceId };
}

/**
 * Register an event handler
 * @param {string} type - Event type to listen for
 * @param {function} handler - Handler function
 * @returns {function} Unsubscribe function
 */
export function on(type, handler) {
  if (typeof handler !== "function") {
    throw new TypeError("handler must be a function");
  }

  if (!handlers.has(type)) {
    handlers.set(type, []);
  }

  handlers.get(type).push(handler);

  // Return unsubscribe function
  return () => {
    const typeHandlers = handlers.get(type);
    if (typeHandlers) {
      const index = typeHandlers.indexOf(handler);
      if (index !== -1) {
        typeHandlers.splice(index, 1);
      }
    }
  };
}

/**
 * Get event counters for metrics
 * @returns {Map} Event type to count mapping
 */
export function getEventCounters() {
  return new Map(eventCounters);
}

/**
 * Reset all event counters (for testing)
 */
export function resetCounters() {
  for (const type of eventCounters.keys()) {
    eventCounters.set(type, 0);
  }
}

const TreeSyncBus = {
  emit,
  on,
  getEventCounters,
  resetCounters,
  EVENT_TYPES,
};

export default TreeSyncBus;
