import { validate as uuidValidate } from "uuid";
import { getStrictAuthUserId } from "../lib/auth_user.js";
import { HttpError } from "../lib/errors.js";
import { verifyPayload } from "../lib/signed_token.js";
import {
  assertWorkspaceMember,
  getActiveWorkspaceId,
  getOrCreatePersonalWorkspace,
  setActiveWorkspaceId,
} from "../services/workspaces/store.js";

function getKnowledgeDownloadTokenSecret() {
  return (
    process.env.KNOWLEDGE_DOWNLOAD_TOKEN_SECRET ||
    process.env.OMYTREE_DOWNLOAD_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  );
}

function getPathname(req) {
  const raw = typeof req?.path === "string" && req.path ? req.path : String(req?.url || "");
  const q = raw.indexOf("?");
  return q >= 0 ? raw.slice(0, q) : raw;
}

function parseKnowledgeDownloadDocId(req) {
  // Mounted under /api/knowledge, pathname will look like /documents/:docId/download
  const pathname = getPathname(req);
  const match = pathname.match(/^\/documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/download$/i);
  return match ? match[1] : null;
}

function getQueryToken(req) {
  const token = req?.query?.token;
  if (Array.isArray(token)) {
    const first = token.find((v) => typeof v === "string" && v.trim());
    return first ? first.trim() : "";
  }
  return typeof token === "string" ? token.trim() : "";
}

async function maybeGetKnowledgeDownloadAuthContext(req, pg) {
  // Only allow signed-token auth for the knowledge download iframe URL.
  if (String(req?.method || "").toUpperCase() !== "GET") {
    return null;
  }

  const baseUrl = typeof req?.baseUrl === "string" ? req.baseUrl : "";
  if (!baseUrl.endsWith("/knowledge")) {
    return null;
  }

  const docId = parseKnowledgeDownloadDocId(req);
  if (!docId) {
    return null;
  }

  const token = getQueryToken(req);
  if (!token) {
    return null;
  }

  const secret = getKnowledgeDownloadTokenSecret();
  if (!secret) {
    return null;
  }

  const payload = verifyPayload(token, secret);
  if (!payload) {
    return null;
  }

  if (payload?.scope !== "knowledge_document_download") {
    return null;
  }

  if (typeof payload?.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return null;
  }

  const userId = typeof payload?.user_id === "string" ? payload.user_id.trim() : "";
  const workspaceId = typeof payload?.workspace_id === "string" ? payload.workspace_id.trim() : "";
  const payloadDocId = typeof payload?.doc_id === "string" ? payload.doc_id.trim() : "";

  if (!uuidValidate(userId) || !uuidValidate(workspaceId) || !uuidValidate(payloadDocId)) {
    return null;
  }
  if (payloadDocId.toLowerCase() !== docId.toLowerCase()) {
    return null;
  }

  // Ensure the user is actually a member of this workspace.
  const membership = await assertWorkspaceMember({ client: pg, workspaceId, userId });
  return {
    userId,
    workspaceId,
    workspaceRole: membership?.role ?? null,
  };
}

function headerValue(req, headerName) {
  if (!req || !headerName) {
    return "";
  }
  const getter = typeof req.get === "function" ? req.get(headerName) : null;
  const direct = getter || req.headers?.[headerName];
  if (Array.isArray(direct)) {
    const found = direct.find((entry) => typeof entry === "string" && entry.trim());
    return found ? found.trim() : "";
  }
  if (typeof direct === "string") {
    return direct.trim();
  }
  return "";
}

function normalizeWorkspaceId(value) {
  if (!value || typeof value !== "string") {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }
  const trimmed = value.trim();
  if (!uuidValidate(trimmed)) {
    throw new HttpError({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
      message: "workspaceId must be a valid uuid",
    });
  }
  return trimmed;
}

export function requireWorkspaceContext(pg, { allowPersonalFallback } = {}) {
  return async (req, res, next) => {
    try {
      const fallbackEnabled =
        typeof allowPersonalFallback === "boolean"
          ? allowPersonalFallback
          : process.env.WORKSPACE_ALLOW_FALLBACK !== "false";

      const tokenContext = await maybeGetKnowledgeDownloadAuthContext(req, pg);
      if (tokenContext) {
        res.locals.authUserId = tokenContext.userId;
        res.locals.workspaceId = tokenContext.workspaceId;
        res.locals.workspaceRole = tokenContext.workspaceRole;
        return next();
      }

      const userId = await getStrictAuthUserId(req, pg);
      res.locals.authUserId = userId;

      const headerWorkspaceId = headerValue(req, "x-omytree-workspace-id");
      if (headerWorkspaceId) {
        const workspaceId = normalizeWorkspaceId(headerWorkspaceId);
        const membership = await assertWorkspaceMember({ client: pg, workspaceId, userId });
        res.locals.workspaceId = workspaceId;
        res.locals.workspaceRole = membership?.role ?? null;
        return next();
      }

      let activeWorkspaceId = null;
      try {
        activeWorkspaceId = await getActiveWorkspaceId({ client: pg, userId });
      } catch (err) {
        if (err instanceof HttpError && err.code === "USER_NOT_FOUND") {
          throw err;
        }
        throw err;
      }

      if (activeWorkspaceId) {
        try {
          const membership = await assertWorkspaceMember({
            client: pg,
            workspaceId: activeWorkspaceId,
            userId,
          });
          res.locals.workspaceId = activeWorkspaceId;
          res.locals.workspaceRole = membership?.role ?? null;
          return next();
        } catch (err) {
          if (err instanceof HttpError && (err.status === 403 || err.status === 404)) {
            // Fall through to personal workspace if active workspace is stale.
          } else {
            throw err;
          }
        }
      }

      if (!fallbackEnabled) {
        throw new HttpError({
          status: 403,
          code: "WORKSPACE_REQUIRED",
          message: "workspace is required",
        });
      }

      const personalWorkspace = await getOrCreatePersonalWorkspace({ client: pg, userId });
      await setActiveWorkspaceId({
        client: pg,
        userId,
        workspaceId: personalWorkspace.id,
      });
      res.locals.workspaceId = personalWorkspace.id;
      res.locals.workspaceRole = "owner";
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export default requireWorkspaceContext;
