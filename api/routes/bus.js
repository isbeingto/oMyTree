import express from "express";

import { emitEvent, getMetrics, getStats, peekEvents } from "../bus/event_bus.js";
import { HttpError, wrapAsync } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { appendAudit } from "../lib/audit.js";

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_LIMIT = 128;

function normalizeTopic(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.length > 128) {
    return normalized.slice(0, 128);
  }

  return normalized;
}

function calculatePayloadSize(payload) {
  try {
    const serialized = JSON.stringify(payload ?? null);
    return Buffer.byteLength(serialized, "utf8");
  } catch (err) {
    throw new HttpError({
      status: 400,
      code: "payload_not_serializable",
      message: "payload must be JSON serializable",
      detail: err?.message,
    });
  }
}

function parseLimit(value) {
  if (typeof value === "undefined") {
    return 10;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(parsed, MAX_LIMIT);
}

export default function createBusRouter() {
  const router = express.Router();

  router.post(
    "/emit",
    wrapAsync(async (req, res) => {
      if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
        throw new HttpError({
          status: 400,
          code: "invalid_body",
          message: "request body must be a JSON object",
          hint: "Send an object with topic and payload fields",
        });
      }

      const topic = normalizeTopic(req.body?.topic);
      if (!topic) {
        throw new HttpError({
          status: 400,
          code: "invalid_topic",
          message: "topic is required",
          hint: "Provide a non-empty topic string",
        });
      }

      const payload = req.body?.payload ?? null;
      const payloadSize = calculatePayloadSize(payload);
      if (payloadSize > MAX_PAYLOAD_BYTES) {
        throw new HttpError({
          status: 413,
          code: "payload_too_large",
          message: "payload exceeds 64KB limit",
        });
      }

      const traceId = res.locals?.traceId ?? req.traceId ?? null;
      const { id, ts, traceId: eventTraceId, durationMs } = emitEvent(
        topic,
        payload,
        payloadSize,
        { traceId }
      );

      await appendAudit({
        type: "bus_emit",
        trace_id: eventTraceId,
        topic,
        payload_size: payloadSize,
        event_id: id,
      });

      const response = withTraceId(res, {
        ok: true,
        id,
        ts,
        trace_id: eventTraceId,
        duration_ms: durationMs,
      });
      res.json(response);
    })
  );

  router.get(
    "/stats",
    wrapAsync(async (_req, res) => {
      const stats = getStats();
      const response = withTraceId(res, {
        ok: true,
        topics: stats.topics,
        total: stats.total,
        since: stats.since,
        avg_emit_duration_ms: stats.avgEmitDurationMs,
        trace_active: stats.traceActive,
        duration_ms: stats.durationMs,
      });
      res.json(response);
    })
  );

  router.get(
    "/peek",
    wrapAsync(async (req, res) => {
      const limit = parseLimit(req.query?.limit);
      const { events, durationMs } = peekEvents(limit);
      const response = withTraceId(res, {
        events,
        duration_ms: durationMs,
      });
      res.json(response);
    })
  );

  router.get(
    "/metrics",
    wrapAsync(async (_req, res) => {
      const metrics = getMetrics();
      const response = withTraceId(res, { ok: true, metrics });
      res.json(response);
    })
  );

  return router;
}
