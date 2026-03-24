import { validate as uuidValidate } from "uuid";

const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "demo@omytree.local";
const DEMO_USER_NAME = process.env.DEMO_USER_NAME || "Demo User";

let cachedDemoUserId = null;
let lastDemoLookup = 0;

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

function buildError(code, status, message) {
  const error = new Error(message || code);
  error.code = code;
  error.status = status;
  return error;
}

async function ensureDemoUser(db) {
  const now = Date.now();
  if (cachedDemoUserId && now - lastDemoLookup < 60_000) {
    return cachedDemoUserId;
  }

  const result = await db.query(
    `INSERT INTO users (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           updated_at = NOW()
     RETURNING id`,
    [DEMO_USER_NAME, DEMO_USER_EMAIL]
  );

  cachedDemoUserId = result.rows[0]?.id || cachedDemoUserId;
  lastDemoLookup = now;
  return cachedDemoUserId;
}

async function findUserId(db, userId) {
  if (!uuidValidate(userId)) {
    throw buildError("INVALID_USER_ID", 400, "user id must be a valid uuid");
  }
  const { rows } = await db.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [userId]);
  const row = rows[0];
  if (!row) {
    throw buildError("USER_NOT_FOUND", 401, "user not found");
  }
  return row.id;
}

export async function findOrCreateDemoUser(db) {
  const id = await ensureDemoUser(db);
  return { id };
}

export async function getDemoUserId(db) {
  return ensureDemoUser(db);
}

export function isDemoUserId(userId) {
  if (!userId || typeof userId !== "string") {
    return false;
  }
  return cachedDemoUserId ? cachedDemoUserId === userId : false;
}

export async function getAuthUserIdForRequest(req, db) {
  const headerUserId =
    headerValue(req, "x-omytree-user-id") ||
    headerValue(req, "x-user-id") ||
    (typeof req?.auth?.user_id === "string" ? req.auth.user_id.trim() : "");

  if (headerUserId) {
    return findUserId(db, headerUserId);
  }

  const demo = await findOrCreateDemoUser(db);
  return demo.id;
}

/**
 * 获取已认证用户 ID（严格模式，不 fallback 到 demo user）
 * 如果没有认证 header，抛出 401 错误
 * 
 * @param {Object} req - Express request
 * @param {Object} db - Database client
 * @returns {Promise<string>} - User ID
 * @throws {Error} - 401 if not authenticated
 */
export async function getStrictAuthUserId(req, db) {
  const headerUserId =
    headerValue(req, "x-omytree-user-id") ||
    headerValue(req, "x-user-id") ||
    (typeof req?.auth?.user_id === "string" ? req.auth.user_id.trim() : "");

  if (!headerUserId) {
    throw buildError("UNAUTHORIZED", 401, "Authentication required");
  }

  return findUserId(db, headerUserId);
}
