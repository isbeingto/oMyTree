import treeEngine from "../lib/tree_engine.js";

const HANDLED_TOPICS = new Set(["branch.confirm", "tree.update"]);
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const DEFAULT_PARENT_ID = "root";

function normalizeTopic(topic) {
  if (typeof topic !== "string") {
    return "";
  }

  return topic.trim().toLowerCase();
}

function clampSafeNonNegativeInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const truncated = Math.trunc(value);
    if (truncated <= 0) {
      return 0;
    }
    return truncated > MAX_SAFE ? MAX_SAFE : truncated;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed > MAX_SAFE ? MAX_SAFE : parsed;
    }
  }

  return 0;
}

function incrementCounter(state, key) {
  const current = clampSafeNonNegativeInteger(state[key] ?? 0);
  if (current >= MAX_SAFE) {
    state[key] = MAX_SAFE;
    return MAX_SAFE;
  }

  const next = current + 1;
  state[key] = next > MAX_SAFE ? MAX_SAFE : next;
  return state[key];
}

function resolveEventTimestamp(rawTs) {
  if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
    const truncated = Math.trunc(rawTs);
    if (truncated <= 0) {
      return 0;
    }
    return truncated > MAX_SAFE ? MAX_SAFE : truncated;
  }

  return clampSafeNonNegativeInteger(Math.trunc(Date.now()));
}

function sanitizeTraceId(rawTraceId) {
  if (typeof rawTraceId !== "string") {
    return null;
  }

  const trimmed = rawTraceId.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function sanitizePayload(raw) {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  return raw;
}

function resolveParentId(eventPayload) {
  const payload = sanitizePayload(eventPayload);
  const candidate = payload.parent_id ?? payload.parentId ?? null;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  return DEFAULT_PARENT_ID;
}

function normalizeForLabel(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "";
}

function buildNodeLabel(topic, nodeId) {
  const normalizedTopic = normalizeForLabel(topic);
  const suffix = nodeId.slice(-6);
  if (normalizedTopic === "branch.confirm") {
    return `confirm:#${suffix}`;
  }

  if (normalizedTopic === "tree.update") {
    return `update:#${suffix}`;
  }

  return `event:#${suffix}`;
}

function sanitizeIdCandidate(raw) {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return null;
}

export function initTreeBridge({ bus }) {
  if (!bus || typeof bus.subscribe !== "function") {
    throw new Error("tree bridge requires a bus with subscribe(handler)");
  }

  const state = {
    updates_total: 0,
    forwarded_total: 0,
    errors_total: 0,
    last_update_ts: null,
    last_event_ts: 0,
    last_trace_id: null,
    last_topic: null,
  };
  let syntheticIdCounter = 0;

  bus.subscribe((event) => {
    if (!event || typeof event !== "object") {
      incrementCounter(state, "errors_total");
      return;
    }

    try {
      const normalizedTopic = normalizeTopic(event.topic);
      if (!HANDLED_TOPICS.has(normalizedTopic)) {
        return;
      }

      const ts = resolveEventTimestamp(event.ts);
      state.last_update_ts = ts;
      state.last_event_ts = ts;
      state.last_trace_id = sanitizeTraceId(event.traceId);
      state.last_topic = typeof event.topic === "string" ? event.topic : normalizedTopic;

      incrementCounter(state, "updates_total");
      incrementCounter(state, "forwarded_total");

      if (normalizedTopic === "branch.confirm") {
        const nodeIdCandidate =
          sanitizeIdCandidate(event.id ?? event.event_id ?? event.payload?.event_id) ??
          (() => {
            syntheticIdCounter += 1;
            const traceSegment =
              typeof state.last_trace_id === "string" && state.last_trace_id
                ? state.last_trace_id.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "trace"
                : "trace";
            const counterSegment = String(syntheticIdCounter).padStart(4, "0");
            return `bridge_${traceSegment}_${counterSegment}`;
          })();

        const parentId = resolveParentId(event.payload);
        const label = buildNodeLabel(event.topic, nodeIdCandidate);
        treeEngine.addNode({
          id: nodeIdCandidate,
          label,
          parentId,
          meta: {
            topic: normalizedTopic,
            trace_id: state.last_trace_id,
            event_ts: ts,
          },
          edgeLabel: normalizedTopic,
        });
      }
    } catch (err) {
      incrementCounter(state, "errors_total");
      console.error("tree bridge handler error", err);
    }
  });

  return {
    getState() {
      const updatesTotal = clampSafeNonNegativeInteger(state.updates_total);
      const forwardedTotal = clampSafeNonNegativeInteger(state.forwarded_total);
      const errorsTotal = clampSafeNonNegativeInteger(state.errors_total);
      const lastUpdateTs =
        typeof state.last_update_ts === "number" && Number.isFinite(state.last_update_ts)
          ? clampSafeNonNegativeInteger(state.last_update_ts)
          : null;
      const lastEventTs = clampSafeNonNegativeInteger(state.last_event_ts);

      return {
        updates_total: updatesTotal,
        forwarded_total: forwardedTotal,
        errors_total: errorsTotal,
        last_update_ts: lastUpdateTs,
        last_event_ts: lastEventTs,
        last_trace_id: state.last_trace_id,
        last_topic: state.last_topic,
      };
    },
  };
}

export default initTreeBridge;
