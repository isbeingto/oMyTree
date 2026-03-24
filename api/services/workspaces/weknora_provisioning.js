/**
 * WeKnora 租户自动配置服务
 * 
 * 每个工作区（workspace）需要独立的 WeKnora 租户，以确保数据隔离。
 * 此服务负责：
 * 1. 创建新租户
 * 2. 存储租户凭据到工作区
 * 3. 验证租户状态
 */

import { pool } from "../../db/pool.js";
import { encryptApiKey } from "../../lib/api_key_crypto.js";
import { HttpError } from "../../lib/errors.js";
import http from "node:http";
import https from "node:https";

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function getWeKnoraBaseUrl() {
  const raw = typeof process.env.WEKNORA_BASE_URL === "string" ? process.env.WEKNORA_BASE_URL.trim() : "";
  return raw || "http://127.0.0.1:8081";
}

function getWeKnoraAdminApiKey() {
  // Admin key for creating tenants. This should be a super-admin key.
  return typeof process.env.WEKNORA_ADMIN_API_KEY === "string"
    ? process.env.WEKNORA_ADMIN_API_KEY.trim()
    : (process.env.WEKNORA_API_KEY || "").trim();
}

function getWeKnoraDefaultEmbeddingConfig() {
  const provider = (process.env.WEKNORA_DEFAULT_EMBEDDING_PROVIDER || "openai").trim();
  const modelName = (process.env.WEKNORA_DEFAULT_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "text-embedding-3-small").trim();
  const apiKey = (process.env.WEKNORA_DEFAULT_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (process.env.WEKNORA_DEFAULT_EMBEDDING_BASE_URL || process.env.OPENAI_API_BASE || "").trim();

  // Default dims are provider/model specific. Use a sensible default; can be overridden.
  const guessedDim = modelName.includes("text-embedding-3-large") ? 3072 : 1536;
  const dimension = clampInt(process.env.WEKNORA_DEFAULT_EMBEDDING_DIM, { min: 8, max: 8192, fallback: guessedDim });

  if (!modelName) {
    throw new HttpError({
      status: 500,
      code: "WEKNORA_DEFAULT_EMBEDDING_MODEL_MISSING",
      message: "WeKnora default embedding model is not configured",
    });
  }

  // We still allow creating KBs without embedding key only if WeKnora supports unauthenticated embedding.
  // In practice, for OpenAI-compatible providers this must be set.
  if (!apiKey) {
    throw new HttpError({
      status: 500,
      code: "WEKNORA_DEFAULT_EMBEDDING_KEY_MISSING",
      message: "WeKnora default embedding API key is not configured",
    });
  }

  return { provider, modelName, apiKey, baseUrl, dimension };
}

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

/**
 * 调用 WeKnora API 创建新租户
 */
async function createWeKnoraTenant({ name, description = "" }) {
  const baseUrl = getWeKnoraBaseUrl();
  const adminKey = getWeKnoraAdminApiKey();

  if (!adminKey) {
    throw new HttpError({
      status: 500,
      code: "WEKNORA_ADMIN_KEY_MISSING",
      message: "WeKnora admin API key is not configured",
    });
  }

  const url = new URL(`${baseUrl}/api/v1/tenants`);
  const body = JSON.stringify({
    name: name || "oMyTree Workspace",
    description: description || "",
  });

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const req = httpModule.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-API-Key": adminKey,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300 && json.data) {
              resolve(json.data);
            } else {
              reject(
                new HttpError({
                  status: res.statusCode || 500,
                  code: "WEKNORA_TENANT_CREATE_FAILED",
                  message: json?.message || json?.error?.message || "Failed to create WeKnora tenant",
                  detail: json,
                })
              );
            }
          } catch (err) {
            reject(
              new HttpError({
                status: 500,
                code: "WEKNORA_RESPONSE_PARSE_FAILED",
                message: "Failed to parse WeKnora response",
                detail: err?.message,
              })
            );
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(
        new HttpError({
          status: 500,
          code: "WEKNORA_CONNECTION_FAILED",
          message: "Failed to connect to WeKnora",
          detail: err?.message,
        })
      );
    });

    req.write(body);
    req.end();
  });
}

async function requestWeKnoraJsonWithKey({ apiKey, method, path, body }) {
  const baseUrl = getWeKnoraBaseUrl();
  const url = new URL(`${baseUrl}/api/v1${path}`);
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const req = httpModule.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          "X-API-Key": apiKey,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = data ? JSON.parse(data) : null;
            if (res.statusCode >= 200 && res.statusCode < 300 && json && json.success === true) {
              resolve(json.data);
              return;
            }
            reject(
              new HttpError({
                status: res.statusCode || 500,
                code: "WEKNORA_REQUEST_FAILED",
                message: json?.message || json?.error?.message || `WeKnora request failed: ${method} ${path}`,
                detail: json,
              })
            );
          } catch (err) {
            reject(
              new HttpError({
                status: 500,
                code: "WEKNORA_RESPONSE_PARSE_FAILED",
                message: "Failed to parse WeKnora response",
                detail: err?.message,
              })
            );
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(
        new HttpError({
          status: 500,
          code: "WEKNORA_CONNECTION_FAILED",
          message: "Failed to connect to WeKnora",
          detail: err?.message,
        })
      );
    });

    if (payload) req.write(payload);
    req.end();
  });
}

export async function ensureWeKnoraTenantEmbeddingModel({ tenantApiKey, tenantId, workspaceId } = {}) {
  if (!tenantApiKey) {
    throw new HttpError({
      status: 500,
      code: "WEKNORA_TENANT_KEY_MISSING",
      message: "WeKnora tenant API key is missing",
    });
  }

  const models = await requestWeKnoraJsonWithKey({ apiKey: tenantApiKey, method: "GET", path: "/models" });
  const hasActiveEmbedding = Array.isArray(models)
    ? models.some((m) => m && m.type === "Embedding" && m.status === "active")
    : false;

  if (hasActiveEmbedding) {
    return { ok: true, created: false };
  }

  const cfg = getWeKnoraDefaultEmbeddingConfig();
  console.log(
    `[weknora-provision] No active embedding model for tenant ${tenantId || "?"} (workspace ${workspaceId || "?"}); creating default (${cfg.provider}/${cfg.modelName})`
  );

  await requestWeKnoraJsonWithKey({
    apiKey: tenantApiKey,
    method: "POST",
    path: "/models",
    body: {
      name: cfg.modelName,
      type: "Embedding",
      source: "remote",
      description: "oMyTree default embedding (auto-provisioned)",
      parameters: {
        provider: cfg.provider,
        base_url: cfg.baseUrl,
        api_key: cfg.apiKey,
        embedding_parameters: {
          dimension: cfg.dimension,
        },
      },
    },
  });

  return { ok: true, created: true };
}

export async function syncWorkspaceWeKnoraApiKeyFromWeKnora({ client, workspaceId, tenantId } = {}) {
  if (!workspaceId || typeof workspaceId !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId is required",
    });
  }

  return withClient(client, async (db) => {
    let resolvedTenantId = tenantId;
    if (typeof resolvedTenantId === "undefined" || resolvedTenantId === null || resolvedTenantId === "") {
      const { rows } = await db.query(
        `SELECT weknora_tenant_id
           FROM workspaces
          WHERE id = $1
          LIMIT 1`,
        [workspaceId]
      );
      const row = rows[0];
      resolvedTenantId = row?.weknora_tenant_id ?? null;
    }

    if (resolvedTenantId === null || typeof resolvedTenantId === "undefined" || resolvedTenantId === "") {
      throw new HttpError({
        status: 500,
        code: "WEKNORA_TENANT_ID_MISSING",
        message: "workspace WeKnora tenant id is missing",
        detail: { workspaceId },
      });
    }

    const adminKey = getWeKnoraAdminApiKey();
    if (!adminKey) {
      throw new HttpError({
        status: 500,
        code: "WEKNORA_ADMIN_KEY_MISSING",
        message: "WeKnora admin api key is not configured",
      });
    }

    const tenant = await requestWeKnoraJsonWithKey({
      apiKey: adminKey,
      method: "GET",
      path: `/tenants/${resolvedTenantId}`,
    });

    const apiKey = typeof tenant?.api_key === "string" ? tenant.api_key.trim() : "";
    if (!apiKey) {
      throw new HttpError({
        status: 500,
        code: "WEKNORA_TENANT_KEY_MISSING",
        message: "WeKnora tenant api key is missing",
        detail: { tenantId: resolvedTenantId },
      });
    }

    // Make sure this tenant is usable for KB creation.
    await ensureWeKnoraTenantEmbeddingModel({ tenantApiKey: apiKey, tenantId: resolvedTenantId, workspaceId });

    const encrypted = encryptApiKey(apiKey);
    await db.query(
      `UPDATE workspaces
          SET weknora_api_key_encrypted = $1,
              weknora_tenant_id = COALESCE(weknora_tenant_id, $2),
              updated_at = NOW()
        WHERE id = $3`,
      [encrypted, resolvedTenantId, workspaceId]
    );

    console.warn("[weknora-provision] Synced workspace WeKnora api key from tenant", {
      workspaceId,
      tenantId: resolvedTenantId,
    });

    return apiKey;
  });
}

/**
 * 为工作区配置 WeKnora 租户
 * 如果工作区已有租户配置，则跳过
 */
export async function provisionWorkspaceWeKnora({ client, workspaceId, workspaceName }) {
  return withClient(client, async (db) => {
    // 检查工作区是否已有租户配置
    const { rows } = await db.query(
      `SELECT id, name, weknora_tenant_id, weknora_api_key_encrypted
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [workspaceId]
    );

    const workspace = rows[0];
    if (!workspace) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }

    // 如果已有配置，跳过
    if (workspace.weknora_api_key_encrypted && workspace.weknora_tenant_id) {
      console.log(`[weknora-provision] Workspace ${workspaceId} already has WeKnora tenant ${workspace.weknora_tenant_id}`);
      return {
        workspaceId,
        tenantId: workspace.weknora_tenant_id,
        alreadyProvisioned: true,
      };
    }

    // 创建新租户
    const tenantName = workspaceName || workspace.name || `oMyTree Workspace ${workspaceId.substring(0, 8)}`;
    console.log(`[weknora-provision] Creating WeKnora tenant for workspace ${workspaceId}: "${tenantName}"`);

    const tenant = await createWeKnoraTenant({
      name: tenantName,
      description: `Auto-provisioned for oMyTree workspace ${workspaceId}`,
    });

    if (!tenant.id || !tenant.api_key) {
      throw new HttpError({
        status: 500,
        code: "WEKNORA_TENANT_INVALID",
        message: "WeKnora returned invalid tenant data",
        detail: tenant,
      });
    }

    // Ensure embedding model exists for this tenant; otherwise KB create will fail with code 1007.
    await ensureWeKnoraTenantEmbeddingModel({ tenantApiKey: tenant.api_key, tenantId: tenant.id, workspaceId });

    // 加密并存储凭据
    const encryptedApiKey = encryptApiKey(tenant.api_key);

    await db.query(
      `UPDATE workspaces
          SET weknora_tenant_id = $1,
              weknora_api_key_encrypted = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [tenant.id, encryptedApiKey, workspaceId]
    );

    console.log(`[weknora-provision] ✓ Workspace ${workspaceId} provisioned with WeKnora tenant ${tenant.id}`);

    return {
      workspaceId,
      tenantId: tenant.id,
      alreadyProvisioned: false,
    };
  });
}

/**
 * 批量配置所有缺少 WeKnora 租户的工作区
 * 用于迁移现有数据
 */
export async function provisionAllMissingWorkspaces({ client } = {}) {
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT id, name
         FROM workspaces
        WHERE weknora_api_key_encrypted IS NULL
           OR weknora_tenant_id IS NULL
        ORDER BY created_at ASC`
    );

    console.log(`[weknora-provision] Found ${rows.length} workspaces without WeKnora tenants`);

    const results = [];
    for (const workspace of rows) {
      try {
        const result = await provisionWorkspaceWeKnora({
          client: db,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        });
        results.push({ ...result, success: true });
      } catch (err) {
        console.error(`[weknora-provision] Failed to provision workspace ${workspace.id}:`, err?.message || err);
        results.push({
          workspaceId: workspace.id,
          success: false,
          error: err?.message || "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    console.log(`[weknora-provision] Completed: ${successCount} success, ${failCount} failed`);

    return results;
  });
}

export default {
  provisionWorkspaceWeKnora,
  provisionAllMissingWorkspaces,
};
