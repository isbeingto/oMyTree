import { Router } from "express";
import { wrapAsync, HttpError } from "../lib/errors.js";
import { withTraceId } from "../lib/trace.js";
import { getAuthUserIdForRequest } from "../lib/auth_user.js";
import { writeAuditLog } from "../lib/audit_log.js";
import {
  assertWorkspaceMember,
  createTeamWorkspace,
  deleteWorkspaceMember,
  findUserByEmail,
  getActiveWorkspaceId,
  getOrCreatePersonalWorkspace,
  listWorkspacesForUser,
  listWorkspaceMembers,
  setActiveWorkspaceId,
  updateWorkspaceMemberRole,
  upsertWorkspaceMember,
} from "../services/workspaces/store.js";
import { validate as uuidValidate } from "uuid";

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res?.locals?.traceId ?? req?.headers?.["x-trace-id"] ?? null;
}

function normalizeName(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeRole(value, { allowOwner = false } = {}) {
  if (typeof value !== "string") return "member";
  const normalized = value.trim().toLowerCase();
  const allowed = allowOwner ? new Set(["owner", "admin", "member"]) : new Set(["admin", "member"]);
  if (!allowed.has(normalized)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ROLE",
      message: "workspace role is invalid",
    });
  }
  return normalized;
}

function normalizeWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspace id is invalid",
    });
  }
  const trimmed = workspaceId.trim();
  if (!uuidValidate(trimmed)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspace id is invalid",
    });
  }
  return trimmed;
}

function normalizeMemberUserId(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!uuidValidate(trimmed)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_USER_ID",
      message: "user id is invalid",
    });
  }
  return trimmed;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (!normalized.includes("@") || normalized.length < 5) {
    throw new HttpError({
      status: 422,
      code: "INVALID_EMAIL",
      message: "email is invalid",
    });
  }
  return normalized;
}

function mapWorkspaceRow(row, { activeWorkspaceId = null } = {}) {
  if (!row) return null;
  const id = String(row.id);
  return {
    id,
    kind: row.kind,
    name: row.name,
    owner_user_id: row.owner_user_id,
    role: row.role,
    is_active: activeWorkspaceId ? id === activeWorkspaceId : false,
    weknora_configured: Boolean(row.weknora_api_key_encrypted && String(row.weknora_api_key_encrypted).trim()),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMemberRow(row) {
  if (!row) return null;
  return {
    workspace_id: String(row.workspace_id),
    user_id: String(row.user_id),
    role: row.role,
    created_at: row.created_at,
  };
}

function mapMemberRowWithUser(row) {
  if (!row) return null;
  return {
    workspace_id: String(row.workspace_id),
    user_id: String(row.user_id),
    role: row.role,
    created_at: row.created_at,
    user: {
      id: String(row.user_id),
      email: row.email,
      name: row.name,
    },
  };
}

function assertCanManageMembers(actorMembership) {
  if (!actorMembership) {
    throw new HttpError({
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "workspace access denied",
    });
  }
  if (actorMembership.kind !== "team") {
    throw new HttpError({
      status: 422,
      code: "WORKSPACE_NOT_TEAM",
      message: "member management is only supported for team workspaces",
    });
  }
  if (actorMembership.role !== "owner" && actorMembership.role !== "admin") {
    throw new HttpError({
      status: 403,
      code: "WORKSPACE_ROLE_FORBIDDEN",
      message: "only owner/admin can manage members",
    });
  }
}

function assertCanViewAuditLogs(actorMembership, { actorUserId } = {}) {
  if (!actorMembership) {
    throw new HttpError({
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "workspace access denied",
    });
  }
  if (actorMembership.kind === "personal") {
    if (!actorUserId || String(actorMembership.owner_user_id) !== String(actorUserId)) {
      throw new HttpError({
        status: 403,
        code: "WORKSPACE_ROLE_FORBIDDEN",
        message: "only owner can view audit logs",
      });
    }
    return;
  }
  if (actorMembership.role !== "owner" && actorMembership.role !== "admin") {
    throw new HttpError({
      status: 403,
      code: "WORKSPACE_ROLE_FORBIDDEN",
      message: "only owner/admin can view audit logs",
    });
  }
}

export default function createWorkspacesRouter(pg) {
  const router = Router();

  // GET /api/workspaces
  router.get(
    "/api/workspaces",
    wrapAsync(async (req, res) => {
      const client = await pg.connect();
      try {
        const userId = await getAuthUserIdForRequest(req, client);

        const personal = await getOrCreatePersonalWorkspace({ client, userId });
        let activeWorkspaceId = await getActiveWorkspaceId({ client, userId });
        if (!activeWorkspaceId) {
          await setActiveWorkspaceId({ client, userId, workspaceId: personal.id });
          activeWorkspaceId = String(personal.id);
        }

        const rows = await listWorkspacesForUser({ client, userId });
        const data = rows.map((row) => mapWorkspaceRow(row, { activeWorkspaceId })).filter(Boolean);
        res.json(withTraceId(res, { ok: true, data, active_workspace_id: activeWorkspaceId }));
      } finally {
        client.release();
      }
    })
  );

  // POST /api/workspaces
  router.post(
    "/api/workspaces",
    wrapAsync(async (req, res) => {
      const name = normalizeName(req.body?.name);
      if (!name) {
        throw new HttpError({
          status: 422,
          code: "INVALID_WORKSPACE_NAME",
          message: "workspace name is required",
        });
      }

      const client = await pg.connect();
      try {
        const userId = await getAuthUserIdForRequest(req, client);
        const created = await createTeamWorkspace({ client, ownerUserId: userId, name });

        await writeAuditLog(
          {
            actorUserId: userId,
            actorRole: "user",
            action: "workspace.create",
            targetType: "workspace",
            targetId: String(created.id),
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: {
              workspace_id: String(created.id),
              kind: "team",
              name: created.name,
            },
          },
          client
        );

        res.status(201).json(withTraceId(res, { ok: true, data: mapWorkspaceRow(created) }));
      } finally {
        client.release();
      }
    })
  );

  // POST /api/workspaces/:id/activate
  router.post(
    "/api/workspaces/:id/activate",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const client = await pg.connect();
      try {
        const userId = await getAuthUserIdForRequest(req, client);
        await assertWorkspaceMember({ client, workspaceId, userId });
        await setActiveWorkspaceId({ client, userId, workspaceId });

        await writeAuditLog(
          {
            actorUserId: userId,
            actorRole: "user",
            action: "workspace.activate",
            targetType: "workspace",
            targetId: workspaceId,
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: {
              workspace_id: workspaceId,
            },
          },
          client
        );

        res.json(withTraceId(res, { ok: true, active_workspace_id: workspaceId }));
      } finally {
        client.release();
      }
    })
  );

  // GET /api/workspaces/:id/members
  router.get(
    "/api/workspaces/:id/members",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const client = await pg.connect();
      try {
        const userId = await getAuthUserIdForRequest(req, client);
        await assertWorkspaceMember({ client, workspaceId, userId });

        const rows = await listWorkspaceMembers({ client, workspaceId });
        const data = rows.map(mapMemberRowWithUser).filter(Boolean);
        res.json(withTraceId(res, { ok: true, data }));
      } finally {
        client.release();
      }
    })
  );

  // POST /api/workspaces/:id/members
  router.post(
    "/api/workspaces/:id/members",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const role = normalizeRole(req.body?.role);
      const memberUserId = normalizeMemberUserId(req.body?.user_id || req.body?.userId || "");
      const email = normalizeEmail(req.body?.email || "");

      if (!memberUserId && !email) {
        throw new HttpError({
          status: 422,
          code: "INVALID_MEMBER_INPUT",
          message: "user_id or email is required",
        });
      }

      const client = await pg.connect();
      try {
        const actorUserId = await getAuthUserIdForRequest(req, client);
        const actorMembership = await assertWorkspaceMember({ client, workspaceId, userId: actorUserId });
        assertCanManageMembers(actorMembership);

        let targetUserId = memberUserId;
        if (!targetUserId) {
          const user = await findUserByEmail({ client, email });
          if (!user) {
            throw new HttpError({
              status: 404,
              code: "USER_NOT_FOUND",
              message: "user not found",
            });
          }
          targetUserId = String(user.id);
        }

        if (String(actorMembership.owner_user_id) === String(targetUserId)) {
          // Owner is always a member; keep owner role.
          const upserted = await upsertWorkspaceMember({
            client,
            workspaceId,
            userId: targetUserId,
            role: "owner",
          });

          await writeAuditLog(
            {
              actorUserId: actorUserId,
              actorRole: "user",
              action: "workspace.member.add",
              targetType: "workspace_member",
              targetId: String(targetUserId),
              ip: getClientIp(req),
              traceId: getTraceId(res, req),
              metadata: {
                workspace_id: workspaceId,
                user_id: String(targetUserId),
                role: "owner",
              },
            },
            client
          );

          res.status(201).json(withTraceId(res, { ok: true, data: mapMemberRow(upserted) }));
          return;
        }

        const existing = await client.query(
          `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
          [workspaceId, targetUserId]
        );

        const upserted = await upsertWorkspaceMember({ client, workspaceId, userId: targetUserId, role });

        const existingRole = existing.rows?.[0]?.role ? String(existing.rows[0].role) : null;
        const action = !existingRole
          ? "workspace.member.add"
          : existingRole !== upserted.role
            ? "workspace.member.role.update"
            : null;

        if (action) {
          await writeAuditLog(
            {
              actorUserId: actorUserId,
              actorRole: "user",
              action,
              targetType: "workspace_member",
              targetId: String(targetUserId),
              ip: getClientIp(req),
              traceId: getTraceId(res, req),
              metadata: {
                workspace_id: workspaceId,
                user_id: String(targetUserId),
                role: upserted.role,
                from_role: existingRole,
              },
            },
            client
          );
        }

        res.status(201).json(withTraceId(res, { ok: true, data: mapMemberRow(upserted) }));
      } finally {
        client.release();
      }
    })
  );

  // PATCH /api/workspaces/:id/members/:userId
  router.patch(
    "/api/workspaces/:id/members/:userId",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const targetUserId = normalizeMemberUserId(req.params?.userId || "");
      const role = normalizeRole(req.body?.role);

      const client = await pg.connect();
      try {
        const actorUserId = await getAuthUserIdForRequest(req, client);
        const actorMembership = await assertWorkspaceMember({ client, workspaceId, userId: actorUserId });
        assertCanManageMembers(actorMembership);

        if (String(actorMembership.owner_user_id) === String(targetUserId)) {
          throw new HttpError({
            status: 403,
            code: "WORKSPACE_OWNER_IMMUTABLE",
            message: "cannot modify workspace owner role",
          });
        }

        const updated = await updateWorkspaceMemberRole({ client, workspaceId, userId: targetUserId, role });
        if (!updated) {
          throw new HttpError({
            status: 404,
            code: "WORKSPACE_MEMBER_NOT_FOUND",
            message: "workspace member not found",
          });
        }

        await writeAuditLog(
          {
            actorUserId: actorUserId,
            actorRole: "user",
            action: "workspace.member.role.update",
            targetType: "workspace_member",
            targetId: String(targetUserId),
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: {
              workspace_id: workspaceId,
              user_id: String(targetUserId),
              role: updated.role,
            },
          },
          client
        );

        res.json(withTraceId(res, { ok: true, data: mapMemberRow(updated) }));
      } finally {
        client.release();
      }
    })
  );

  // DELETE /api/workspaces/:id/members/:userId
  router.delete(
    "/api/workspaces/:id/members/:userId",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const targetUserId = normalizeMemberUserId(req.params?.userId || "");

      const client = await pg.connect();
      try {
        const actorUserId = await getAuthUserIdForRequest(req, client);
        const actorMembership = await assertWorkspaceMember({ client, workspaceId, userId: actorUserId });
        assertCanManageMembers(actorMembership);

        if (String(actorMembership.owner_user_id) === String(targetUserId)) {
          throw new HttpError({
            status: 403,
            code: "WORKSPACE_OWNER_IMMUTABLE",
            message: "cannot remove workspace owner",
          });
        }

        const deleted = await deleteWorkspaceMember({ client, workspaceId, userId: targetUserId });
        if (!deleted) {
          throw new HttpError({
            status: 404,
            code: "WORKSPACE_MEMBER_NOT_FOUND",
            message: "workspace member not found",
          });
        }

        await writeAuditLog(
          {
            actorUserId: actorUserId,
            actorRole: "user",
            action: "workspace.member.remove",
            targetType: "workspace_member",
            targetId: String(targetUserId),
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: {
              workspace_id: workspaceId,
              user_id: String(targetUserId),
            },
          },
          client
        );

        res.json(withTraceId(res, { ok: true }));
      } finally {
        client.release();
      }
    })
  );

  // GET /api/workspaces/:id/audit-logs
  router.get(
    "/api/workspaces/:id/audit-logs",
    wrapAsync(async (req, res) => {
      const workspaceId = normalizeWorkspaceId(req.params?.id);
      const limitRaw = Number.parseInt(String(req.query?.limit ?? "100"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

      const client = await pg.connect();
      try {
        const actorUserId = await getAuthUserIdForRequest(req, client);
        const actorMembership = await assertWorkspaceMember({ client, workspaceId, userId: actorUserId });
        assertCanViewAuditLogs(actorMembership, { actorUserId });

        const { rows } = await client.query(
          `SELECT id, created_at, actor_user_id, actor_role, action, target_type, target_id, ip, trace_id, metadata
           FROM audit_logs
           WHERE (metadata->>'workspace_id' = $1 OR (target_type = 'workspace' AND target_id = $1))
           ORDER BY created_at DESC
           LIMIT $2`,
          [workspaceId, limit]
        );

        res.json(withTraceId(res, { ok: true, data: rows, workspace_id: workspaceId }));
      } finally {
        client.release();
      }
    })
  );

  return router;
}
