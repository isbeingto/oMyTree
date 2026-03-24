import { checkAndConsume } from "../services/rate_quota/checker.js";
import { applyRateQuotaHeaders } from "../lib/rate_quota_headers.js";
import { validate as uuidValidate } from "uuid";

const PROTECTED_ROUTES = [
  { method: "POST", path: "/api/turn", kind: "turn" },
  { method: "POST", path: "/api/turn/stream", kind: "turn" },
  { method: "POST", path: "/api/turn/retry", kind: "turn", match: "prefix" },
  { method: "POST", path: "/api/llm/summarize", kind: "summarize" },
  { method: "POST", path: "/api/llm/relevance", kind: "relevance" },
  { method: "POST", path: "/api/upload", kind: "upload" },
];

function normalizePath(req) {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "";
  const withoutQuery = raw.split("?")[0] ?? "";
  if (withoutQuery.endsWith("/") && withoutQuery.length > 1) {
    return withoutQuery.replace(/\/+$/, "");
  }
  return withoutQuery || "/";
}

function resolveIdentity(req) {
  const authUser = safeString(req?.auth?.user_id);
  const apiKey = headerValue(req, "x-api-key");
  const userHeader = headerValue(req, "x-user-id");
  const omytreeUserHeader = headerValue(req, "x-omytree-user-id");
  const testClient = headerValue(req, "x-test-client");

  const candidate = authUser || apiKey || omytreeUserHeader || userHeader || testClient;
  if (candidate) {
    return candidate;
  }

  const ip = safeString(req?.ip || req?.connection?.remoteAddress);
  return `ip:${ip || "unknown"}`;
}

function resolveUserId(req) {
  const authUser = safeString(req?.auth?.user_id);
  const omytreeUserHeader = headerValue(req, "x-omytree-user-id");
  const userHeader = headerValue(req, "x-user-id");
  const candidate = authUser || omytreeUserHeader || userHeader;
  return candidate || null;
}

async function resolveUserMeta({ pg, redis, userId }) {
  const empty = { plan: 'free', preferred_llm_provider: 'omytree-default', has_byok: false };
  if (!userId || typeof userId !== 'string' || !uuidValidate(userId)) {
    return empty;
  }

  const cacheKey = `user_meta:${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        const plan = ['free', 'pro', 'team'].includes(parsed.plan) ? parsed.plan : 'free';
        const preferred = typeof parsed.preferred_llm_provider === 'string' && parsed.preferred_llm_provider.trim()
          ? parsed.preferred_llm_provider.trim()
          : 'omytree-default';
        const hasByok = typeof parsed.has_byok === 'boolean' ? parsed.has_byok : false;
        return { plan, preferred_llm_provider: preferred, has_byok: hasByok };
      }
    }
  } catch {
    // ignore cache errors
  }

  try {
    const result = await pg.query(
      `SELECT
         u.plan,
         u.preferred_llm_provider,
         (
           EXISTS (
             SELECT 1
               FROM user_llm_providers ulp
              WHERE ulp.user_id = u.id
                AND ulp.enabled = TRUE
              LIMIT 1
           )
           OR EXISTS (
             SELECT 1
               FROM user_api_keys uak
              WHERE uak.user_id = u.id
              LIMIT 1
           )
         ) AS has_byok
       FROM users u
      WHERE u.id = $1
      LIMIT 1`,
      [userId]
    );
    const row = result.rows?.[0] || null;
    const plan = ['free', 'pro', 'team'].includes(row?.plan) ? row.plan : 'free';
    const preferred = typeof row?.preferred_llm_provider === 'string' && row.preferred_llm_provider.trim()
      ? row.preferred_llm_provider.trim()
      : 'omytree-default';
    const hasByok = row?.has_byok === true;
    const payload = JSON.stringify({ plan, preferred_llm_provider: preferred, has_byok: hasByok });
    await redis.set(cacheKey, payload, 'EX', 300);
    return { plan, preferred_llm_provider: preferred, has_byok: hasByok };
  } catch (error) {
    console.warn('[rate_quota_guard] resolveUserMeta failed, falling back to free:', error?.message);
    return empty;
  }
}

/**
 * 检测是否为 BYOK 用户（自带 API Key）
 */
function resolveProviderHint(req) {
  const candidate =
    safeString(req?.query?.provider) ||
    safeString(req?.query?.provider_override) ||
    safeString(req?.body?.provider) ||
    safeString(req?.body?.provider_override);
  return candidate || null;
}

function detectByok(req, { preferredProvider = 'omytree-default', hasByok = false } = {}) {
  const body = req.body || {};

  if (body.provider_key || body.api_key || body.openai_key || body.gemini_key) {
    return true;
  }

  if (req?.userCredentials?.provider && req?.userCredentials?.apiKey) {
    return true;
  }

  const providerHint = resolveProviderHint(req);

  // 如果明确指定使用官方默认模型，则一定不是 BYOK
  if (providerHint === 'omytree-default') {
    return false;
  }

  // 如果明确指定了非默认 provider，只有在用户确实配置并启用过 BYOK 时才认为是 BYOK
  if (providerHint && providerHint !== 'omytree-default') {
    return hasByok;
  }

  // 未显式指定 provider：只有当用户偏好不是默认且确实有 BYOK 配置时才认为是 BYOK
  if (preferredProvider && preferredProvider !== 'omytree-default') {
    return hasByok;
  }

  return false;
}

function headerValue(req, headerName) {
  if (!req || !headerName) {
    return "";
  }

  const value = req.get?.(headerName) ?? req.headers?.[headerName];
  if (Array.isArray(value)) {
    const found = value.find((entry) => typeof entry === "string" && entry.trim());
    return found ? found.trim() : "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function safeString(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value.toString === "function") {
    return value.toString().trim();
  }

  return "";
}

function matchProtectedRoute(req) {
  const method = (req.method || "GET").toUpperCase();
  const path = normalizePath(req);
  for (const route of PROTECTED_ROUTES) {
    if (route.method !== method) {
      continue;
    }
    if (route.match === "prefix") {
      if (path === route.path || path.startsWith(`${route.path}/`)) {
        return route;
      }
      continue;
    }
    if (route.path === path) {
      return route;
    }
  }
  return null;
}

function ensureMetaContainer(res) {
  res.locals = res.locals || {};
  if (!res.locals.rateQuotaMeta) {
    res.locals.rateQuotaMeta = {};
  }
  return res.locals.rateQuotaMeta;
}

/**
 * 构建友好的错误提示信息
 */
function buildQuotaErrorMessage(kind, limitType, isByok) {
  const isRate = limitType === "per_minute";

  const guidance = `\n\n这是一个由个人开发者维护的免费项目，每周提供有限的免费额度。\n\n想要无限使用：在设置中填入自己的 API Key（支持 OpenAI、Gemini 等），即可解除对话速率与对话次数限制。\n\n设置路径：右上角头像 → 设置 → API 密钥`;

  if (isRate) {
    return "请求过于频繁（触发速率上限），请稍后再试。" + guidance;
  }

  // 每周配额超限
  const kindMessages = {
    turn: "本周对话轮次已用尽。",
    summarize: "本周摘要次数已用尽。",
    relevance: "本周相关性检测次数已用尽。",
    upload: "本周上传次数已用尽。",
  };
  
  const baseMessage = kindMessages[kind] || "本周使用次数已达上限。";

  return baseMessage + guidance;
}

export default function createRateQuotaGuard({ redis, pg } = {}) {
  if (!redis) {
    throw new Error("rate_quota_guard requires a Redis client");
  }
  if (!pg || typeof pg.query !== 'function') {
    throw new Error("rate_quota_guard requires a Postgres client/pool");
  }

  return async function rateQuotaGuard(req, res, next) {
    const match = matchProtectedRoute(req);
    if (!match) {
      return next();
    }

    const identity = resolveIdentity(req);
    const userId = resolveUserId(req);
    const userMeta = await resolveUserMeta({ pg, redis, userId });
    const plan = userMeta.plan;
    const isByok = detectByok(req, { preferredProvider: userMeta.preferred_llm_provider, hasByok: userMeta.has_byok });

    try {
      const result = await checkAndConsume(match.kind, identity, { redis, plan, isByok });
      const metaStore = ensureMetaContainer(res);
      metaStore[match.kind] = {
        remaining: result.remaining,
        resetAt: result.resetAt,
        plan: result.plan,
        isByok: result.isByok,
      };

      if (result.ok) {
        return next();
      }

      applyRateQuotaHeaders(res, match.kind);
      const traceId = res.locals?.traceId ?? req.headers?.["x-trace-id"] ?? null;
      
      const errorCode = result.reason === "rate" 
        ? "RATE_LIMIT_EXCEEDED" 
        : "WEEKLY_QUOTA_EXCEEDED";
      
      const errorMessage = buildQuotaErrorMessage(match.kind, result.limitType, isByok);
      
      const payload = {
        ok: false,
        error: {
          code: errorCode,
          message: errorMessage,
          kind: match.kind,
          limit_type: result.limitType,
          identity: result.identity,
          plan: result.plan,
          reset_at: result.limitType === "per_minute" ? result.resetAt.rate : result.resetAt.quota,
          hint: "填入自己的 API Key 可解除对话限制。设置路径：右上角头像 → 设置 → API 密钥",
        },
      };

      if (traceId) {
        payload.trace_id = traceId;
      }

      return res.status(429).json(payload);
    } catch (error) {
      console.error("[rate_quota_guard] failed to enforce limits", error);
      return res.status(503).json({
        ok: false,
        error: {
          code: "RATE_QUOTA_UNAVAILABLE",
          message: "Rate/quota guard is temporarily unavailable",
        },
      });
    }
  };
}
