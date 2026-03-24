import { randomUUID } from "crypto";

function hrtimeMs() {
  const hr = process.hrtime.bigint();
  return Number(hr) / 1_000_000;
}

const DEFAULT_CAPACITY = 1024;
const MAX_CAPACITY = 65536;
const MIN_CAPACITY = 16;

function resolveCapacity() {
  const raw = process.env.BUS_CAP ?? "";
  if (!raw) {
    return DEFAULT_CAPACITY;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_CAPACITY;
  }

  return Math.min(Math.max(parsed, MIN_CAPACITY), MAX_CAPACITY);
}

// The in-memory bus intentionally keeps a bounded footprint. When the ring buffer
// fills up, the oldest entry is overwritten so that emitters never block and
// stats continue to reflect the total number of events emitted during the
// process lifetime.
//
// Trace-aware observability piggybacks on the existing HTTP trace middleware:
// handlers pass the `res.locals.traceId` they received from `traceMiddleware`
// into `emit`. If no trace is available (for example, when the bus is used from
// a background task) the bus fabricates a fresh trace identifier so that audit
// trails and metrics never emit empty values. Each ring-buffer slot stores the
// topic, payload size, trace id, and the measured emit duration so that peek
// calls can surface per-trace diagnostics without additional lookups.
class InMemoryEventBus {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.start = 0;
    this.size = 0;
    this.totalEmitted = 0;
    this.totalEmitDurationMs = 0;
    this.firstEventTs = null;
    this.topicTotals = new Map();
    this.traceCounts = new Map();
    this.operationMetrics = {
      stats: { count: 0, durationMs: 0 },
      peek: { count: 0, durationMs: 0 },
    };
    this.subscribers = new Set();
  }

  addTrace(traceId) {
    if (!traceId) {
      return;
    }

    const current = this.traceCounts.get(traceId) ?? 0;
    this.traceCounts.set(traceId, current + 1);
  }

  removeTrace(traceId) {
    if (!traceId || !this.traceCounts.has(traceId)) {
      return;
    }

    const current = this.traceCounts.get(traceId) - 1;
    if (current <= 0) {
      this.traceCounts.delete(traceId);
    } else {
      this.traceCounts.set(traceId, current);
    }
  }

  emit(topic, payload, payloadSize, traceId = null) {
    const startHr = hrtimeMs();
    const ts = Date.now();
    const id = `evt_${randomUUID()}`;
    const resolvedTraceId =
      typeof traceId === "string" && traceId.trim().length > 0 ? traceId : `trace_${randomUUID()}`;
    const entry = {
      id,
      topic,
      payload,
      ts,
      size: payloadSize,
      traceId: resolvedTraceId,
      durationMs: 0,
    };

    let evicted = null;
    if (this.size === this.capacity) {
      const index = this.start;
      evicted = this.buffer[index] ?? null;
      this.buffer[index] = entry;
      this.start = (this.start + 1) % this.capacity;
    } else {
      const index = (this.start + this.size) % this.capacity;
      this.buffer[index] = entry;
      this.size += 1;
    }

    this.totalEmitted += 1;
    if (!this.topicTotals.has(topic)) {
      this.topicTotals.set(topic, 0);
    }
    this.topicTotals.set(topic, this.topicTotals.get(topic) + 1);
    if (this.firstEventTs === null) {
      this.firstEventTs = ts;
    }

    if (evicted?.traceId) {
      this.removeTrace(evicted.traceId);
    }
    this.addTrace(resolvedTraceId);

    const durationMs = Math.max(0, hrtimeMs() - startHr);
    entry.durationMs = durationMs;
    this.totalEmitDurationMs += durationMs;

    if (this.subscribers.size > 0) {
      const snapshot = Array.from(this.subscribers);
      for (const handler of snapshot) {
        try {
          handler({
            id: entry.id,
            topic: entry.topic,
            payload: entry.payload,
            ts: entry.ts,
            traceId: entry.traceId,
            size: entry.size,
            durationMs: entry.durationMs,
          });
        } catch (err) {
          // Bridge subscribers are observability helpers; they must never break emitters.
          console.error("event_bus subscriber error", err);
        }
      }
    }

    return { id, ts, traceId: resolvedTraceId, durationMs };
  }

  subscribe(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }

    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  getStats() {
    const startHr = hrtimeMs();
    const topics = Object.create(null);
    for (const [topic, count] of this.topicTotals.entries()) {
      topics[topic] = count;
    }

    const stats = {
      total: this.totalEmitted,
      topics,
      since: this.firstEventTs,
      avgEmitDurationMs:
        this.totalEmitted > 0 ? this.totalEmitDurationMs / this.totalEmitted : 0,
      traceActive: this.traceCounts.size,
    };

    const durationMs = Math.max(0, hrtimeMs() - startHr);
    this.operationMetrics.stats.count += 1;
    this.operationMetrics.stats.durationMs += durationMs;

    return { ...stats, durationMs };
  }

  peek(limit = 10) {
    const startHr = hrtimeMs();
    if (this.size === 0) {
      this.operationMetrics.peek.count += 1;
      const durationMs = Math.max(0, hrtimeMs() - startHr);
      this.operationMetrics.peek.durationMs += durationMs;
      return { events: [], durationMs };
    }

    const boundedLimit = Math.max(1, Math.min(Number(limit) || 0, this.size));
    const events = [];

    for (let i = 0; i < boundedLimit; i += 1) {
      const index = (this.start + this.size - 1 - i + this.capacity) % this.capacity;
      const entry = this.buffer[index];
      if (!entry) {
        continue;
      }
      events.push({
        id: entry.id,
        topic: entry.topic,
        ts: entry.ts,
        size: entry.size,
        trace_id: entry.traceId ?? null,
        duration_ms: entry.durationMs ?? 0,
      });
    }

    const durationMs = Math.max(0, hrtimeMs() - startHr);
    this.operationMetrics.peek.count += 1;
    this.operationMetrics.peek.durationMs += durationMs;

    return { events, durationMs };
  }

  getMetrics() {
    return {
      eventsTotal: this.totalEmitted,
      emitDurationMs: this.totalEmitDurationMs,
      traceActive: this.traceCounts.size,
      statsCount: this.operationMetrics.stats.count,
      statsDurationMs: this.operationMetrics.stats.durationMs,
      peekCount: this.operationMetrics.peek.count,
      peekDurationMs: this.operationMetrics.peek.durationMs,
    };
  }
}

const capacity = resolveCapacity();
const bus = new InMemoryEventBus(capacity);

export function emitEvent(topic, payload, payloadSize, options = {}) {
  const { traceId = null } = options;
  return bus.emit(topic, payload, payloadSize, traceId);
}

export function getStats() {
  return bus.getStats();
}

export function peekEvents(limit) {
  return bus.peek(limit);
}

export function getMetrics() {
  return bus.getMetrics();
}

export function subscribe(handler) {
  return bus.subscribe(handler);
}

export default bus;
