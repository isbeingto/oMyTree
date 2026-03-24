import { randomUUID } from "crypto";

const TRACE_HEADER = "x-trace-id";

export function traceMiddleware(req, res, next) {
  const incoming = normalizeTraceId(req.get?.(TRACE_HEADER) ?? req.headers?.[TRACE_HEADER]);
  const traceId = incoming || randomUUID();

  req.traceId = traceId;
  res.locals = res.locals || {};
  res.locals.traceId = traceId;
  res.setHeader(TRACE_HEADER, traceId);

  // Event bus handlers (and any other component) can now rely on res.locals.traceId
  // to correlate their own telemetry. This middleware therefore represents the
  // single source of truth for request-scoped trace identifiers.
  next();
}

function normalizeTraceId(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length > 128) {
    return normalized.slice(0, 128);
  }

  return normalized;
}

export function withTraceId(res, body = {}) {
  const traceId = res.locals?.traceId;
  if (traceId && typeof body === "object" && body !== null && !body.trace_id) {
    return { ...body, trace_id: traceId };
  }

  return body;
}

export function getTraceId(res) {
  return res?.locals?.traceId || null;
}
