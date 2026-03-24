/**
 * Mobile Auth Routes
 * 
 * iOS / Android 原生 App 专用认证端点。
 * Web 端使用 NextAuth cookie-based session，移动端无法使用 cookie，
 * 因此这里提供直接的 JSON API 认证方式。
 * 
 * 端点：
 * - POST /api/mobile/login          — 邮箱+密码登录，返回 userId + 用户信息
 * - POST /api/mobile/google-login   — 验证 Google ID Token，查找/创建用户
 * - GET  /api/mobile/me             — 获取当前用户信息（需要 x-omytree-user-id）
 * - POST /api/mobile/refresh-profile — 与 /me 相同，便于 App 主动刷新
 */

import express from "express";
import bcrypt from "bcrypt";
import { validate as uuidValidate } from "uuid";
import { respondWithError } from "../lib/errors.js";

// Google ID Token 验证使用 google-auth-library（如果安装了的话）。
// 如果没安装，我们提供一个基于 Google tokeninfo 端点的 fallback 验证方式。
let OAuth2Client;
try {
  const gauth = await import("google-auth-library");
  OAuth2Client = gauth.OAuth2Client;
} catch {
  OAuth2Client = null;
}

export default function createMobileAuthRouter(pg) {
  const router = express.Router();

  // ─── POST /api/mobile/login ────────────────────────────────
  router.post("/login", async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return respondWithError(res, {
        status: 400,
        code: "missing_credentials",
        message: "Email and password are required",
      });
    }

    let client;
    try {
      client = await pg.connect();

      const { rows } = await client.query(
        `SELECT id, email, name, password_hash, role, plan, is_active,
                preferred_language, "emailVerified", created_at,
                enable_advanced_context
         FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email.trim()]
      );
      const user = rows[0];

      if (!user) {
        return respondWithError(res, {
          status: 401,
          code: "invalid_credentials",
          message: "Invalid email or password",
        });
      }

      // OAuth-only 用户没有 password_hash
      if (!user.password_hash) {
        return respondWithError(res, {
          status: 401,
          code: "no_password",
          message:
            "This account was created via Google. Please use Google Sign-In.",
        });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return respondWithError(res, {
          status: 401,
          code: "invalid_credentials",
          message: "Invalid email or password",
        });
      }

      if (user.is_active === false) {
        return respondWithError(res, {
          status: 403,
          code: "account_disabled",
          message: "Your account has been disabled",
        });
      }

      return res.json({
        ok: true,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        plan: user.plan || "free",
        preferred_language: user.preferred_language || "en",
        email_verified: !!user.emailVerified,
        enable_advanced_context: user.enable_advanced_context === true,
        created_at: user.created_at ? user.created_at.toISOString() : null,
      });
    } catch (err) {
      console.error("[mobile-auth] login error:", err);
      return respondWithError(res, {
        status: 500,
        code: "internal_error",
        message: "Internal server error",
      });
    } finally {
      if (client) client.release();
    }
  });

  // ─── POST /api/mobile/google-login ─────────────────────────
  router.post("/google-login", async (req, res) => {
    const { idToken, email, name } = req.body || {};

    if (!idToken) {
      return respondWithError(res, {
        status: 400,
        code: "missing_token",
        message: "Google ID token is required",
      });
    }

    // Verify the Google ID Token
    let verifiedEmail;
    try {
      verifiedEmail = await verifyGoogleIdToken(idToken, email);
    } catch (err) {
      console.error("[mobile-auth] Google token verification failed:", err);
      return respondWithError(res, {
        status: 401,
        code: "invalid_google_token",
        message: "Google token verification failed",
      });
    }

    if (!verifiedEmail) {
      return respondWithError(res, {
        status: 401,
        code: "invalid_google_token",
        message: "Could not verify Google account email",
      });
    }

    let client;
    try {
      client = await pg.connect();

      // 查找用户
      const { rows } = await client.query(
        `SELECT id, email, name, role, plan, is_active,
                preferred_language, "emailVerified", created_at,
                enable_advanced_context
         FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [verifiedEmail]
      );

      let user = rows[0];

      if (user && user.is_active === false) {
        return respondWithError(res, {
          status: 403,
          code: "account_disabled",
          message: "Your account has been disabled",
        });
      }

      if (!user) {
        // 自动注册 Google 用户
        const result = await client.query(
          `INSERT INTO users (email, name, "emailVerified", created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW(), NOW())
           RETURNING id, email, name, role, plan, preferred_language,
                     "emailVerified", created_at, enable_advanced_context`,
          [verifiedEmail, name || verifiedEmail.split("@")[0]]
        );
        user = result.rows[0];
        console.log(
          "[mobile-auth] Auto-registered Google user:",
          user.id,
          user.email
        );
      }

      return res.json({
        ok: true,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        plan: user.plan || "free",
        preferred_language: user.preferred_language || "en",
        email_verified: !!user.emailVerified,
        enable_advanced_context: user.enable_advanced_context === true,
        created_at: user.created_at
          ? user.created_at.toISOString
            ? user.created_at.toISOString()
            : user.created_at
          : null,
      });
    } catch (err) {
      console.error("[mobile-auth] google-login error:", err);
      return respondWithError(res, {
        status: 500,
        code: "internal_error",
        message: "Internal server error",
      });
    } finally {
      if (client) client.release();
    }
  });

  // ─── GET /api/mobile/me ────────────────────────────────────
  router.get("/me", async (req, res) => {
    const userId = extractUserId(req);

    if (!userId) {
      return respondWithError(res, {
        status: 401,
        code: "unauthorized",
        message: "x-omytree-user-id header is required",
      });
    }

    let client;
    try {
      client = await pg.connect();
      const { rows } = await client.query(
        `SELECT id, email, name, role, plan, is_active,
                preferred_language, "emailVerified", created_at,
                enable_advanced_context
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      const user = rows[0];
      if (!user) {
        return respondWithError(res, {
          status: 404,
          code: "user_not_found",
          message: "User not found",
        });
      }

      if (user.is_active === false) {
        return respondWithError(res, {
          status: 403,
          code: "account_disabled",
          message: "Your account has been disabled",
        });
      }

      return res.json({
        ok: true,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        plan: user.plan || "free",
        preferred_language: user.preferred_language || "en",
        email_verified: !!user.emailVerified,
        enable_advanced_context: user.enable_advanced_context === true,
        created_at: user.created_at
          ? user.created_at.toISOString
            ? user.created_at.toISOString()
            : user.created_at
          : null,
      });
    } catch (err) {
      console.error("[mobile-auth] /me error:", err);
      return respondWithError(res, {
        status: 500,
        code: "internal_error",
        message: "Internal server error",
      });
    } finally {
      if (client) client.release();
    }
  });

  // ─── POST /api/mobile/refresh-profile ──────────────────────
  // 与 /me 相同功能，POST 方便 App 主动调用
  router.post("/refresh-profile", async (req, res) => {
    // 复用 /me 的逻辑
    req.method = "GET";
    return router.handle(req, res, () => {
      // fallback — 不应走到这里
      res.status(500).json({ error: "Internal routing error" });
    });
  });

  return router;
}

// ─── Helper: Extract user ID from request ────────────────────
function extractUserId(req) {
  const headerUserId =
    (req.get?.("x-omytree-user-id") || req.headers?.["x-omytree-user-id"] || "").trim();
  if (headerUserId && uuidValidate(headerUserId)) {
    return headerUserId;
  }
  return null;
}

// ─── Helper: Verify Google ID Token ──────────────────────────
async function verifyGoogleIdToken(idToken, expectedEmail) {
  const webClientId = process.env.GOOGLE_CLIENT_ID;
  const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID;

  // Method 1: Use google-auth-library (preferred, if installed)
  if (OAuth2Client && webClientId) {
    const client = new OAuth2Client(webClientId);
    const audiences = [webClientId];
    if (iosClientId) audiences.push(iosClientId);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: audiences,
    });

    const payload = ticket.getPayload();
    if (!payload?.email_verified) {
      throw new Error("Google email not verified");
    }

    return payload.email;
  }

  // Method 2: Fallback — use Google tokeninfo endpoint
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    throw new Error(`Google tokeninfo returned ${response.status}`);
  }

  const payload = await response.json();

  // Verify audience
  if (webClientId && payload.aud !== webClientId && payload.aud !== iosClientId) {
    throw new Error("Token audience mismatch");
  }

  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Google email not verified");
  }

  return payload.email;
}
