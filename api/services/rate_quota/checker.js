import rateLimits, { getNextMondayMidnightUTC, getCurrentWeekStartUTC } from "../../config/rate_limits.js";

const SUPPORTED_KINDS = new Set(["turn", "summarize", "relevance", "upload"]);
const RATE_WINDOW_TTL_SECONDS = 90;

function pad(value) {
  return String(value).padStart(2, "0");
}

function ensureRedis(redis) {
  if (!redis || typeof redis.multi !== "function") {
    throw new Error("rate/quota checker requires a Redis client");
  }
  return redis;
}

function normalizeIdentity(identity) {
  if (typeof identity === "string") {
    const trimmed = identity.trim();
    if (trimmed) {
      return trimmed.slice(0, 256);
    }
  } else if (identity && typeof identity.toString === "function") {
    const converted = identity.toString().trim();
    if (converted) {
      return converted.slice(0, 256);
    }
  }

  return "anonymous";
}

function buildMinuteWindow(now) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  const bucket = `${year}${pad(month + 1)}${pad(day)}${pad(hour)}${pad(minute)}`;
  const resetAt = new Date(Date.UTC(year, month, day, hour, minute + 1, 0, 0));

  return { bucket, resetAt };
}

/**
 * 构建周窗口（周一 00:00 UTC 重置）
 */
function buildWeekWindow(now) {
  const weekStart = getCurrentWeekStartUTC(now);
  const year = weekStart.getUTCFullYear();
  const month = weekStart.getUTCMonth();
  const day = weekStart.getUTCDate();

  // 使用周起始日期作为 bucket 标识
  const bucket = `W${year}${pad(month + 1)}${pad(day)}`;
  const resetAt = getNextMondayMidnightUTC(now);
  const expireAtSeconds = Math.ceil(resetAt.getTime() / 1000);

  return { bucket, resetAt, expireAtSeconds };
}

async function incrementWithExpiry(redis, key, { ttlSeconds = null, expireAtSeconds = null } = {}) {
  const client = ensureRedis(redis);
  const pipeline = client.multi();
  pipeline.incr(key);

  if (typeof expireAtSeconds === "number" && Number.isFinite(expireAtSeconds)) {
    pipeline.expireat(key, expireAtSeconds);
  } else if (typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds)) {
    pipeline.expire(key, ttlSeconds);
  }

  const results = await pipeline.exec();
  const incrResult = results?.[0]?.[1];
  return typeof incrResult === "number" ? incrResult : Number.parseInt(incrResult, 10) || 0;
}

/**
 * 检查并消费配额
 * 
 * @param {string} kind - 类型：turn, summarize, relevance
 * @param {string} identity - 用户标识
 * @param {object} options
 * @param {object} options.redis - Redis 客户端
 * @param {string} [options.plan='free'] - 用户计划：free, pro, team
 * @param {boolean} [options.isByok=false] - 是否为 BYOK 用户
 */
export async function checkAndConsume(kind, identity, { redis, plan = 'free', isByok = false } = {}) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported rate/quota kind: ${kind}`);
  }

  const normalizedIdentity = normalizeIdentity(identity);
  const limits = rateLimits[kind];
  const now = new Date();

  // 规范化计划名称
  const normalizedPlan = ['free', 'pro', 'team'].includes(plan) ? plan : 'free';

  const remaining = {
    rate: Number.MAX_SAFE_INTEGER,
    quota: Number.MAX_SAFE_INTEGER,
  };
  const resetAt = {
    rate: null,
    quota: null,
  };

  // BYOK 用户对 turn/upload 类型完全不限制（不限速率也不限配额）
  if (isByok && (kind === 'turn' || kind === 'upload')) {
    return {
      ok: true,
      reason: null,
      limitType: null,
      identity: normalizedIdentity,
      remaining,
      resetAt,
      isByok: true,
      plan: normalizedPlan,
    };
  }

  // 检查每分钟速率限制
  if (limits?.perMinute > 0) {
    const minuteWindow = buildMinuteWindow(now);
    const rateKey = `rl:${kind}:${normalizedIdentity}:${minuteWindow.bucket}`;
    const rateCount = await incrementWithExpiry(redis, rateKey, {
      ttlSeconds: RATE_WINDOW_TTL_SECONDS,
    });
    remaining.rate = Math.max(limits.perMinute - rateCount, 0);
    resetAt.rate = minuteWindow.resetAt.toISOString();

    if (rateCount > limits.perMinute) {
      return {
        ok: false,
        reason: "rate",
        limitType: "per_minute",
        identity: normalizedIdentity,
        remaining,
        resetAt,
        isByok,
        plan: normalizedPlan,
      };
    }
  } else {
    remaining.rate = Number.MAX_SAFE_INTEGER;
    resetAt.rate = null;
  }

  // 检查每周配额限制
  const weeklyLimit = limits?.perWeek?.[normalizedPlan];
  if (weeklyLimit && weeklyLimit > 0) {
    const weekWindow = buildWeekWindow(now);
    const quotaKey = `quota:${kind}:${normalizedIdentity}:${weekWindow.bucket}`;
    const quotaCount = await incrementWithExpiry(redis, quotaKey, {
      expireAtSeconds: weekWindow.expireAtSeconds,
    });
    remaining.quota = Math.max(weeklyLimit - quotaCount, 0);
    resetAt.quota = weekWindow.resetAt.toISOString();

    if (quotaCount > weeklyLimit) {
      return {
        ok: false,
        reason: "quota",
        limitType: "per_week",
        identity: normalizedIdentity,
        remaining,
        resetAt,
        isByok,
        plan: normalizedPlan,
      };
    }
  } else {
    remaining.quota = Number.MAX_SAFE_INTEGER;
    resetAt.quota = null;
  }

  return {
    ok: true,
    reason: null,
    limitType: null,
    identity: normalizedIdentity,
    remaining,
    resetAt,
    isByok,
    plan: normalizedPlan,
  };
}
