/**
 * Rate Limits Configuration
 * 
 * - perMinute: 每分钟速率限制（所有计划相同）
 * - perWeek: 每周配额（按计划分级：free / pro）
 * - 每周一 00:00 UTC 自动重置
 * 
 * BYOK 用户：
 * - turn: 无限制（不限速率也不限配额）
 * - summarize: 仍受周配额限制
 */

// 默认速率限制（每分钟）- 所有计划相同
const DEFAULT_RATE_LIMITS = {
  turn: {
    perMinute: 30,
    // 每周配额按计划分级
    perWeek: {
      free: 210,   // 免费版：210次/周
      pro: 700,    // 专业版：700次/周
      team: 2000,  // 团队版：2000次/周（预留）
    },
  },
  summarize: {
    perMinute: 20,
    perWeek: {
      free: 70,    // 免费版：70次/周
      pro: 140,    // 专业版：140次/周
      team: 500,   // 团队版：500次/周（预留）
    },
  },
  // relevance 保持原有限制（内部使用，不面向用户展示）
  relevance: {
    perMinute: 40,
    perWeek: {
      free: 2000,
      pro: 5000,
      team: 10000,
    },
  },

  // Upload is used for weekly upload attempts (official/platform only)
  // BYOK uploads bypass enforcement.
  upload: {
    perMinute: 60,
    perWeek: {
      free: 7,
      pro: 35,
      team: 200,
    },
  },
};

function parseLimit(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

// 构建运行时配置（支持环境变量覆盖）
const rateLimits = {
  turn: {
    perMinute: parseLimit(process.env.LINZHI_RATE_TURN_PER_MINUTE, DEFAULT_RATE_LIMITS.turn.perMinute),
    perWeek: {
      free: parseLimit(process.env.LINZHI_QUOTA_TURN_PER_WEEK_FREE, DEFAULT_RATE_LIMITS.turn.perWeek.free),
      pro: parseLimit(process.env.LINZHI_QUOTA_TURN_PER_WEEK_PRO, DEFAULT_RATE_LIMITS.turn.perWeek.pro),
      team: parseLimit(process.env.LINZHI_QUOTA_TURN_PER_WEEK_TEAM, DEFAULT_RATE_LIMITS.turn.perWeek.team),
    },
  },
  summarize: {
    perMinute: parseLimit(
      process.env.LINZHI_RATE_SUMMARIZE_PER_MINUTE,
      DEFAULT_RATE_LIMITS.summarize.perMinute,
    ),
    perWeek: {
      free: parseLimit(process.env.LINZHI_QUOTA_SUMMARIZE_PER_WEEK_FREE, DEFAULT_RATE_LIMITS.summarize.perWeek.free),
      pro: parseLimit(process.env.LINZHI_QUOTA_SUMMARIZE_PER_WEEK_PRO, DEFAULT_RATE_LIMITS.summarize.perWeek.pro),
      team: parseLimit(process.env.LINZHI_QUOTA_SUMMARIZE_PER_WEEK_TEAM, DEFAULT_RATE_LIMITS.summarize.perWeek.team),
    },
  },
  relevance: {
    perMinute: parseLimit(
      process.env.LINZHI_RATE_RELEVANCE_PER_MINUTE,
      DEFAULT_RATE_LIMITS.relevance.perMinute,
    ),
    perWeek: {
      free: parseLimit(process.env.LINZHI_QUOTA_RELEVANCE_PER_WEEK_FREE, DEFAULT_RATE_LIMITS.relevance.perWeek.free),
      pro: parseLimit(process.env.LINZHI_QUOTA_RELEVANCE_PER_WEEK_PRO, DEFAULT_RATE_LIMITS.relevance.perWeek.pro),
      team: parseLimit(process.env.LINZHI_QUOTA_RELEVANCE_PER_WEEK_TEAM, DEFAULT_RATE_LIMITS.relevance.perWeek.team),
    },
  },

  upload: {
    perMinute: parseLimit(process.env.LINZHI_RATE_UPLOAD_PER_MINUTE, DEFAULT_RATE_LIMITS.upload.perMinute),
    perWeek: {
      free: parseLimit(process.env.LINZHI_QUOTA_UPLOAD_PER_WEEK_FREE, DEFAULT_RATE_LIMITS.upload.perWeek.free),
      pro: parseLimit(process.env.LINZHI_QUOTA_UPLOAD_PER_WEEK_PRO, DEFAULT_RATE_LIMITS.upload.perWeek.pro),
      team: parseLimit(process.env.LINZHI_QUOTA_UPLOAD_PER_WEEK_TEAM, DEFAULT_RATE_LIMITS.upload.perWeek.team),
    },
  },
};

/**
 * 获取下一个周一 00:00 UTC 的时间戳
 */
function getNextMondayMidnightUTC(now = new Date()) {
  const date = new Date(now);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  date.setUTCHours(0, 0, 0, 0);
  
  return date;
}

/**
 * 获取当前周的起始时间（上一个周一 00:00 UTC）
 */
function getCurrentWeekStartUTC(now = new Date()) {
  const date = new Date(now);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : (dayOfWeek - 1);
  
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  date.setUTCHours(0, 0, 0, 0);
  
  return date;
}

export { DEFAULT_RATE_LIMITS, getNextMondayMidnightUTC, getCurrentWeekStartUTC };
export default rateLimits;
