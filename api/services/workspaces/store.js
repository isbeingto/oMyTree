import { validate as uuidValidate } from "uuid";
import { pool } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import { provisionWorkspaceWeKnora } from "./weknora_provisioning.js";

function normalizeUuid(value, { code, message }) {
  if (typeof value !== "string") {
    throw new HttpError({ status: 422, code, message });
  }
  const trimmed = value.trim();
  if (!uuidValidate(trimmed)) {
    throw new HttpError({ status: 422, code, message });
  }
  return trimmed;
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

function normalizeUserId(userId) {
  return normalizeUuid(userId, {
    code: "INVALID_USER_ID",
    message: "userId must be a valid uuid",
  });
}

function normalizeWorkspaceId(workspaceId) {
  return normalizeUuid(workspaceId, {
    code: "INVALID_WORKSPACE_ID",
    message: "workspaceId must be a valid uuid",
  });
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_EMAIL",
      message: "email is invalid",
    });
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || normalized.length < 5) {
    throw new HttpError({
      status: 422,
      code: "INVALID_EMAIL",
      message: "email is invalid",
    });
  }
  return normalized;
}

function normalizeWorkspaceRole(role) {
  if (typeof role !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ROLE",
      message: "workspace role is invalid",
    });
  }
  const normalized = role.trim().toLowerCase();
  if (!["owner", "admin", "member"].includes(normalized)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ROLE",
      message: "workspace role is invalid",
    });
  }
  return normalized;
}

export async function getWorkspaceById({ client, workspaceId }) {
  const normalizedId = normalizeWorkspaceId(workspaceId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at
         FROM workspaces
        WHERE id = $1
        LIMIT 1`,
      [normalizedId]
    );
    return rows[0] || null;
  });
}

export async function listWorkspacesForUser({ client, userId }) {
  const normalizedUserId = normalizeUserId(userId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT w.id,
              w.kind,
              w.name,
              w.owner_user_id,
              w.weknora_tenant_id,
              w.weknora_api_key_encrypted,
              w.created_at,
              w.updated_at,
              wm.role
         FROM workspace_members wm
         JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = $1
        ORDER BY w.created_at DESC, w.name ASC`,
      [normalizedUserId]
    );
    return rows;
  });
}

export async function getActiveWorkspaceId({ client, userId }) {
  const normalizedUserId = normalizeUserId(userId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT active_workspace_id
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [normalizedUserId]
    );
    if (!rows[0]) {
      throw new HttpError({
        status: 404,
        code: "USER_NOT_FOUND",
        message: "user not found",
      });
    }
    return rows[0].active_workspace_id ? String(rows[0].active_workspace_id) : null;
  });
}

export async function setActiveWorkspaceId({ client, userId, workspaceId }) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : null;
  return withClient(client, async (db) => {
    const result = await db.query(
      `UPDATE users
          SET active_workspace_id = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [normalizedWorkspaceId, normalizedUserId]
    );
    if (result.rowCount === 0) {
      throw new HttpError({
        status: 404,
        code: "USER_NOT_FOUND",
        message: "user not found",
      });
    }
    return normalizedWorkspaceId;
  });
}

export async function assertWorkspaceMember({ client, workspaceId, userId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedUserId = normalizeUserId(userId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT w.id,
              w.kind,
              w.name,
              w.owner_user_id,
              w.weknora_tenant_id,
              w.weknora_api_key_encrypted,
              w.created_at,
              w.updated_at,
              wm.role
         FROM workspaces w
         LEFT JOIN workspace_members wm
                ON wm.workspace_id = w.id AND wm.user_id = $2
        WHERE w.id = $1
        LIMIT 1`,
      [normalizedWorkspaceId, normalizedUserId]
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError({
        status: 404,
        code: "WORKSPACE_NOT_FOUND",
        message: "workspace not found",
      });
    }
    if (!row.role) {
      throw new HttpError({
        status: 403,
        code: "WORKSPACE_FORBIDDEN",
        message: "workspace access denied",
      });
    }
    return row;
  });
}

export async function getOrCreatePersonalWorkspace({ client, userId, name = "Personal" }) {
  const normalizedUserId = normalizeUserId(userId);
  return withClient(client, async (db) => {
    const insertResult = await db.query(
      `INSERT INTO workspaces (kind, name, owner_user_id)
       VALUES ('personal', $1, $2)
       ON CONFLICT (owner_user_id) WHERE kind = 'personal'
       DO NOTHING
       RETURNING id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at`,
      [name, normalizedUserId]
    );
    let workspace = insertResult.rows[0];
    let isNewlyCreated = !!workspace;

    if (!workspace) {
      const { rows } = await db.query(
        `SELECT id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at
           FROM workspaces
          WHERE owner_user_id = $1 AND kind = 'personal'
          LIMIT 1`,
        [normalizedUserId]
      );
      workspace = rows[0] || null;
    }
    if (!workspace) {
      throw new HttpError({
        status: 500,
        code: "WORKSPACE_CREATE_FAILED",
        message: "failed to create personal workspace",
      });
    }

    await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspace.id, normalizedUserId]
    );

    // Auto-provision WeKnora tenant if missing (P0 tenant isolation)
    if (!workspace.weknora_api_key_encrypted || !workspace.weknora_tenant_id) {
      try {
        await provisionWorkspaceWeKnora({
          client: db,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        });
        // Re-fetch to get updated credentials
        const { rows: updated } = await db.query(
          `SELECT id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at
             FROM workspaces
            WHERE id = $1
            LIMIT 1`,
          [workspace.id]
        );
        workspace = updated[0] || workspace;
      } catch (err) {
        // Log but don't fail workspace creation - user can still use other features
        console.error(`[workspace] Failed to provision WeKnora for personal workspace ${workspace.id}:`, err?.message || err);
      }
    }

    return workspace;
  });
}

export async function createTeamWorkspace({ client, ownerUserId, name }) {
  const normalizedOwnerId = normalizeUserId(ownerUserId);
  if (typeof name !== "string" || !name.trim()) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_NAME",
      message: "workspace name is required",
    });
  }
  const normalizedName = name.trim();

  return withClient(client, async (db) => {
    // Use explicit transaction when possible (PoolClient), otherwise best-effort with sequential queries.
    const canTx = typeof db.release === "function";
    if (canTx) {
      await db.query("BEGIN");
    }
    try {
      const { rows } = await db.query(
        `INSERT INTO workspaces (kind, name, owner_user_id)
         VALUES ('team', $1, $2)
         RETURNING id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at`,
        [normalizedName, normalizedOwnerId]
      );
      let workspace = rows[0];
      if (!workspace) {
        throw new HttpError({
          status: 500,
          code: "WORKSPACE_CREATE_FAILED",
          message: "failed to create team workspace",
        });
      }

      await db.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [workspace.id, normalizedOwnerId]
      );

      // Auto-provision WeKnora tenant (P0 tenant isolation)
      try {
        await provisionWorkspaceWeKnora({
          client: db,
          workspaceId: workspace.id,
          workspaceName: normalizedName,
        });
        // Re-fetch to get updated credentials
        const { rows: updated } = await db.query(
          `SELECT id, kind, name, owner_user_id, weknora_tenant_id, weknora_api_key_encrypted, created_at, updated_at
             FROM workspaces
            WHERE id = $1
            LIMIT 1`,
          [workspace.id]
        );
        workspace = updated[0] || workspace;
      } catch (err) {
        console.error(`[workspace] Failed to provision WeKnora for team workspace ${workspace.id}:`, err?.message || err);
      }

      if (canTx) {
        await db.query("COMMIT");
      }

      return { ...workspace, role: "owner" };
    } catch (err) {
      if (canTx) {
        await db.query("ROLLBACK").catch(() => {});
      }
      throw err;
    }
  });
}

export async function findUserByEmail({ client, email }) {
  const normalizedEmail = normalizeEmail(email);
  return withClient(client, async (db) => {
    const { rows } = await db.query(`SELECT id, email, name FROM users WHERE email = $1 LIMIT 1`, [normalizedEmail]);
    return rows[0] || null;
  });
}

export async function upsertWorkspaceMember({ client, workspaceId, userId, role }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedUserId = normalizeUserId(userId);
  const normalizedRole = normalizeWorkspaceRole(role);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET role = EXCLUDED.role
       RETURNING workspace_id, user_id, role, created_at`,
      [normalizedWorkspaceId, normalizedUserId, normalizedRole]
    );
    return rows[0] || null;
  });
}

export async function updateWorkspaceMemberRole({ client, workspaceId, userId, role }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedUserId = normalizeUserId(userId);
  const normalizedRole = normalizeWorkspaceRole(role);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `UPDATE workspace_members
          SET role = $3
        WHERE workspace_id = $1
          AND user_id = $2
        RETURNING workspace_id, user_id, role, created_at`,
      [normalizedWorkspaceId, normalizedUserId, normalizedRole]
    );
    return rows[0] || null;
  });
}

export async function deleteWorkspaceMember({ client, workspaceId, userId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedUserId = normalizeUserId(userId);
  return withClient(client, async (db) => {
    const result = await db.query(
      `DELETE FROM workspace_members
        WHERE workspace_id = $1
          AND user_id = $2`,
      [normalizedWorkspaceId, normalizedUserId]
    );
    return result.rowCount > 0;
  });
}

export async function listWorkspaceMembers({ client, workspaceId }) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return withClient(client, async (db) => {
    const { rows } = await db.query(
      `SELECT wm.workspace_id,
              wm.user_id,
              wm.role,
              wm.created_at,
              u.email,
              u.name
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                 u.email ASC`,
      [normalizedWorkspaceId]
    );
    return rows;
  });
}

export default {
  getWorkspaceById,
  listWorkspacesForUser,
  listWorkspaceMembers,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  assertWorkspaceMember,
  getOrCreatePersonalWorkspace,
  createTeamWorkspace,
  findUserByEmail,
  upsertWorkspaceMember,
  updateWorkspaceMemberRole,
  deleteWorkspaceMember,
};
