import { HttpError } from "../../lib/errors.js";
import {
  assertWorkspaceMember,
  getActiveWorkspaceId,
  getOrCreatePersonalWorkspace,
  setActiveWorkspaceId,
} from "./store.js";

function headerValue(req, headerName) {
  if (!req || !headerName) return "";
  const getter = typeof req.get === "function" ? req.get(headerName) : null;
  const direct = getter || req.headers?.[headerName];
  if (Array.isArray(direct)) {
    const found = direct.find((entry) => typeof entry === "string" && entry.trim());
    return found ? found.trim() : "";
  }
  if (typeof direct === "string") return direct.trim();
  return "";
}

export async function resolveWorkspaceIdForUser({ db, req, userId }) {
  const fallbackEnabled = process.env.WORKSPACE_ALLOW_FALLBACK !== "false";

  const explicitWorkspaceId = headerValue(req, "x-omytree-workspace-id");
  if (explicitWorkspaceId) {
    await assertWorkspaceMember({ client: db, workspaceId: explicitWorkspaceId, userId });
    return explicitWorkspaceId;
  }

  const activeWorkspaceId = await getActiveWorkspaceId({ client: db, userId });
  if (activeWorkspaceId) {
    try {
      await assertWorkspaceMember({ client: db, workspaceId: activeWorkspaceId, userId });
      return activeWorkspaceId;
    } catch {
      // stale active workspace -> fall through
    }
  }

  if (!fallbackEnabled) {
    throw new HttpError({
      status: 403,
      code: "WORKSPACE_REQUIRED",
      message: "workspace is required",
    });
  }

  const personal = await getOrCreatePersonalWorkspace({ client: db, userId });
  await setActiveWorkspaceId({ client: db, userId, workspaceId: personal.id });
  return personal.id;
}

export default {
  resolveWorkspaceIdForUser,
};

