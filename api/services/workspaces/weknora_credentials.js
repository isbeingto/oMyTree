import { validate as uuidValidate } from "uuid";
import { pool } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import { decryptApiKey } from "../../lib/api_key_crypto.js";

async function withClient(client, handler) {
  if (client) {
    return handler(client);
  }
  const pooled = await pool.connect();
  try {
    return await handler(pooled);
  } finally {
    pooled.release();
  }
}

function normalizeWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }
  const trimmed = workspaceId.trim();
  if (!uuidValidate(trimmed)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }
  return trimmed;
}

export async function getWorkspaceWeKnoraApiKey({ client, workspaceId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT weknora_tenant_id, weknora_api_key_encrypted
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [normalizedWorkspaceId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }

    const encrypted = row.weknora_api_key_encrypted;
    if (!encrypted || typeof encrypted !== "string" || !encrypted.trim()) {
      throw new HttpError({
        status: 500,
        code: "workspace_weknora_key_missing",
        message: "workspace WeKnora api key is not configured",
      });
    }

    try {
      return decryptApiKey(encrypted);
    } catch (err) {
      throw new HttpError({
        status: 500,
        code: "workspace_weknora_key_decrypt_failed",
        message: "failed to decrypt workspace WeKnora api key",
        detail: err?.message || null,
      });
    }
  });
}

export async function getWorkspaceWeKnoraTenantId({ client, workspaceId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT weknora_tenant_id
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [normalizedWorkspaceId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }
    return typeof row.weknora_tenant_id === "number" ? row.weknora_tenant_id : row.weknora_tenant_id ?? null;
  });
}

export async function getWorkspaceWeKnoraCredentials({ client, workspaceId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT weknora_tenant_id, weknora_api_key_encrypted
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [normalizedWorkspaceId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }

    const apiKey = await getWorkspaceWeKnoraApiKey({ client: db, workspaceId: normalizedWorkspaceId });
    const tenantId =
      typeof row.weknora_tenant_id === "number" ? row.weknora_tenant_id : row.weknora_tenant_id ?? null;

    return { apiKey, tenantId };
  });
}

export async function resolveWorkspaceWeKnoraApiKey({
  client,
  workspaceId,
  // P0 SECURITY: Global key fallback is DISABLED by default to enforce tenant isolation.
  allowGlobalFallback = process.env.WEKNORA_ALLOW_GLOBAL_KEY_FALLBACK === "DANGER_YES",
}) {
  try {
    return await getWorkspaceWeKnoraApiKey({ client, workspaceId });
  } catch (err) {
    const globalKey =
      allowGlobalFallback && typeof process.env.WEKNORA_API_KEY === "string"
        ? process.env.WEKNORA_API_KEY.trim()
        : "";
    if (globalKey && err instanceof HttpError && err.code === "workspace_weknora_key_missing") {
      console.warn("[weknora] ⚠️ RAG using global WEKNORA_API_KEY fallback", { workspaceId });
      return globalKey;
    }
    throw err;
  }
}

export default {
  getWorkspaceWeKnoraApiKey,
  getWorkspaceWeKnoraTenantId,
  getWorkspaceWeKnoraCredentials,
  resolveWorkspaceWeKnoraApiKey,
};
