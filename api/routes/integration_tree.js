import express from "express";

import treeEngine from "../lib/tree_engine.js";

function ensureBridge(bridge) {
  if (!bridge || typeof bridge.getState !== "function") {
    throw new Error("tree integration router requires a bridge with getState()");
  }

  return bridge;
}

function toSafeInteger(raw) {
  const MAX_SAFE = Number.MAX_SAFE_INTEGER;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }

  const truncated = Math.trunc(value);
  if (truncated <= 0) {
    return 0;
  }

  return truncated > MAX_SAFE ? MAX_SAFE : truncated;
}

export default function createTreeIntegrationRouter(bridge) {
  const resolvedBridge = ensureBridge(bridge);
  const router = express.Router();

  router.get("/stats", (_req, res) => {
    const state = resolvedBridge.getState();
    const updatesTotal = toSafeInteger(state?.updates_total ?? 0);
    const forwardedTotal = toSafeInteger(state?.forwarded_total ?? updatesTotal);
    const errorTotal = toSafeInteger(state?.errors_total ?? 0);
    const lastEventTs = toSafeInteger(state?.last_event_ts ?? 0);
    const lastUpdateTsRaw = state?.last_update_ts;
    const lastUpdateTs =
      typeof lastUpdateTsRaw === "number" && Number.isFinite(lastUpdateTsRaw)
        ? toSafeInteger(lastUpdateTsRaw)
        : null;
    const lastTraceId = typeof state?.last_trace_id === "string" && state.last_trace_id.trim()
      ? state.last_trace_id
      : null;
    const lastTopic = typeof state?.last_topic === "string" && state.last_topic.trim()
      ? state.last_topic
      : null;
    const nodesTotal = toSafeInteger(treeEngine.size());
    const edgesTotal = toSafeInteger(treeEngine.edgeSize());

    res.json({
      ok: true,
      updates_total: updatesTotal,
      forwarded_total: forwardedTotal,
      error_total: errorTotal,
      last_event_ts: lastEventTs,
      last_update_ts: lastUpdateTs,
      last_trace_id: lastTraceId,
      last_topic: lastTopic,
      nodes_total: nodesTotal,
      edges_total: edgesTotal,
    });
  });

  return router;
}
