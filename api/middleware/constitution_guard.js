const FORBIDDEN_PATHS = new Set([
  "/api/node/reparent",
  "/api/node/promote",
  "/api/node/demote",
]);

function normalizePath(req) {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "";
  const withoutQuery = raw.split("?")[0] ?? "";
  if (withoutQuery.endsWith("/") && withoutQuery.length > 1) {
    return withoutQuery.replace(/\/+$/, "");
  }
  return withoutQuery || "/";
}

/**
 * Blocks any attempt to trigger Reparent / Promote / Demote APIs.
 * The API must never reach business logic and always return 405 with fixed payload.
 */
export default function constitutionGuard(req, res, next) {
  const path = normalizePath(req);
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "POST" && FORBIDDEN_PATHS.has(path)) {
    return res.status(405).json({
      ok: false,
      error_code: "OPERATION_FORBIDDEN_BY_CONSTITUTION",
      message: "Reparent / Promote / Demote are forbidden by constitution (T8-1).",
    });
  }

  return next();
}
