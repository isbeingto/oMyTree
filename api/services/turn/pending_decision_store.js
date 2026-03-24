import { randomUUID } from 'crypto';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ttlMs = Math.max(
  30_000,
  parseInt(process.env.IRRELEVANCE_DECISION_TTL_MS || `${DEFAULT_TTL_MS}`, 10) || DEFAULT_TTL_MS
);
const MAX_PENDING = 2048;

const pendingDecisions = new Map();

function cleanup(now = Date.now()) {
  if (pendingDecisions.size === 0) {
    return;
  }

  for (const [token, entry] of pendingDecisions.entries()) {
    if (now - entry.createdAt > ttlMs) {
      pendingDecisions.delete(token);
    }
  }

  if (pendingDecisions.size <= MAX_PENDING) {
    return;
  }

  const keys = Array.from(pendingDecisions.keys());
  const overflow = pendingDecisions.size - MAX_PENDING;
  for (let i = 0; i < overflow; i += 1) {
    const key = keys[i];
    pendingDecisions.delete(key);
  }
}

export function createDecision(payload) {
  cleanup();
  const token = `rd_${randomUUID()}`;
  pendingDecisions.set(token, {
    ...payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  return token;
}

export function getDecision(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  cleanup();
  const entry = pendingDecisions.get(token);
  if (!entry) {
    return null;
  }
  entry.attempts += 1;
  return entry;
}

export function completeDecision(token) {
  if (!token) {
    return;
  }
  pendingDecisions.delete(token);
}

export const PENDING_DECISION_TTL_MS = ttlMs;
