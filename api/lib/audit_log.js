import { pool } from "../db/pool.js";

const VALID_ACTOR_ROLES = new Set(["user", "admin", "system"]);

function normalizeRole(value) {
  if (typeof value !== "string") {
    return "system";
  }
  const normalized = value.trim().toLowerCase();
  return VALID_ACTOR_ROLES.has(normalized) ? normalized : "system";
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const clone = { ...metadata };
  // Never persist secrets
  delete clone.api_key;
  delete clone.apiKey;
  delete clone.api_key_encrypted;
  delete clone.apiKeyEncrypted;
  delete clone.password;
  delete clone.token;
  return clone;
}

/**
 * Lightweight helper to persist audit events without blocking the main flow.
 * Errors are swallowed after logging so core requests still succeed.
 */
export async function writeAuditLog({
  actorUserId = null,
  actorRole = "system",
  action,
  targetType = null,
  targetId = null,
  ip = null,
  metadata = null,
  traceId = null,
} = {}, client = null) {
  if (!action || typeof action !== "string") {
    return;
  }

  const role = normalizeRole(actorRole);
  const cleanedMetadata = sanitizeMetadata(metadata);
  const runner = client ?? pool;

  try {
    await runner.query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, ip, trace_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorUserId || null,
        role,
        action.trim(),
        targetType || null,
        targetId || null,
        ip || null,
        traceId || null,
        cleanedMetadata,
      ]
    );
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}

export default writeAuditLog;
