import { HttpError } from "../lib/errors.js";
import { getWorkspaceWeKnoraCredentials } from "../services/workspaces/weknora_credentials.js";

export function attachWorkspaceWeKnoraCredentials(pg, { required = false } = {}) {
  return async (_req, res, next) => {
    try {
      const workspaceId = res.locals?.workspaceId;
      if (!workspaceId || typeof workspaceId !== "string") {
        if (!required) return next();
        throw new HttpError({
          status: 403,
          code: "WORKSPACE_REQUIRED",
          message: "workspace is required",
        });
      }

      try {
        const { apiKey, tenantId } = await getWorkspaceWeKnoraCredentials({
          client: pg,
          workspaceId,
        });
        res.locals.weknoraApiKey = apiKey;
        if (tenantId !== null && typeof tenantId !== "undefined") {
          res.locals.weknoraTenantId = tenantId;
        }
        return next();
      } catch (err) {
        if (!required) {
          return next();
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  };
}

export default attachWorkspaceWeKnoraCredentials;

