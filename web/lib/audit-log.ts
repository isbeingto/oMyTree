import { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db";

export type AuditActorRole = "user" | "admin" | "system";

export interface AuditLogInput {
  actorUserId?: string | null;
  actorRole?: AuditActorRole | string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
  traceId?: string | null;
}

const VALID_ROLES = new Set<AuditActorRole>(["user", "admin", "system"]);

function normalizeRole(role?: string | null): AuditActorRole {
  if (!role) return "system";
  const normalized = role.trim().toLowerCase();
  return VALID_ROLES.has(normalized as AuditActorRole)
    ? (normalized as AuditActorRole)
    : "system";
}

function sanitizeMetadata(meta?: Record<string, unknown> | null): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const clone = { ...meta } as Record<string, unknown>;
  delete (clone as any).api_key;
  delete (clone as any).apiKey;
  delete (clone as any).api_key_encrypted;
  delete (clone as any).apiKeyEncrypted;
  delete (clone as any).password;
  delete (clone as any).token;
  return clone;
}

/**
 * Non-blocking audit logger. Swallows errors to keep primary flows healthy.
 */
export async function writeAuditLog(
  input: AuditLogInput,
  client?: Pool | PoolClient,
): Promise<void> {
  const { action } = input;
  if (!action || typeof action !== "string") return;

  const runner = client ?? pool;
  const role = normalizeRole(input.actorRole ?? undefined);
  const metadata = sanitizeMetadata(input.metadata ?? undefined);

  try {
    await runner.query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, ip, trace_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.actorUserId ?? null,
        role,
        action.trim(),
        input.targetType ?? null,
        input.targetId ?? null,
        input.ip ?? null,
        input.traceId ?? null,
        metadata,
      ],
    );
  } catch (err) {
    console.error("[audit] failed to persist audit log", err);
  }
}

export default writeAuditLog;
