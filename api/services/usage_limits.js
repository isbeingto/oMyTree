/**
 * T48-2: Usage Limits & Soft Warnings Service
 * 
 * Checks user usage against soft limits and returns warnings when thresholds are approached/reached.
 * Does NOT block requests - only provides informational warnings.
 */

import { pool } from '../db/pool.js';

// Daily limits by profile and provider type
const DAILY_LIMITS = {
  lite: {
    platform: 100,
    byok: 200,
  },
  standard: {
    platform: 50,
    byok: 100,
  },
  max: {
    platform: 0, // Max not supported on platform
    byok: 30,
  },
};

// Per-tree turn count limits (only for standard/max)
const TREE_LIMITS = {
  standard: 200,
  max: 100,
};

// Warning thresholds (percentage of limit)
const WARNING_THRESHOLDS = {
  approaching: 80, // 80% triggers "approaching" warning
  reached: 100,    // 100% triggers "reached" warning
};

/**
 * Get daily usage count for a user and profile
 * @param {string} userId 
 * @param {string} contextProfile 
 * @returns {Promise<number>}
 */
async function getDailyUsageCount(userId, contextProfile) {
  if (!userId || !contextProfile) {
    return 0;
  }

  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(requests), 0)::INTEGER AS daily_count
       FROM llm_usage_daily
       WHERE user_id = $1
         AND context_profile = $2
         AND usage_date = CURRENT_DATE`,
      [userId, contextProfile]
    );
    return rows[0]?.daily_count || 0;
  } catch (error) {
    console.error('[usage-limits] Failed to get daily usage count:', error?.message || error);
    return 0;
  }
}

/**
 * Get turn count for a specific tree
 * @param {string} treeId 
 * @returns {Promise<number>}
 */
async function getTreeTurnCount(treeId) {
  if (!treeId) {
    return 0;
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INTEGER AS turn_count
       FROM turns t
       INNER JOIN nodes n ON t.node_id = n.id
       WHERE n.tree_id = $1
         AND t.status = 'completed'
         AND t.soft_deleted_at IS NULL
         AND n.soft_deleted_at IS NULL`,
      [treeId]
    );
    return rows[0]?.turn_count || 0;
  } catch (error) {
    console.error('[usage-limits] Failed to get tree turn count:', error?.message || error);
    return 0;
  }
}

/**
 * Get daily limit for a profile and provider type
 * @param {string} contextProfile 
 * @param {boolean} isByok 
 * @returns {number}
 */
function getDailyLimit(contextProfile, isByok) {
  const normalized = typeof contextProfile === 'string' ? contextProfile.toLowerCase() : 'lite';
  const providerType = isByok ? 'byok' : 'platform';
  return DAILY_LIMITS[normalized]?.[providerType] || DAILY_LIMITS.lite.platform;
}

/**
 * Get tree limit for a profile
 * @param {string} contextProfile 
 * @returns {number|null}
 */
function getTreeLimit(contextProfile) {
  const normalized = typeof contextProfile === 'string' ? contextProfile.toLowerCase() : '';
  return TREE_LIMITS[normalized] || null;
}

/**
 * Generate warning message
 * @param {string} type - 'daily_approaching' | 'daily_reached' | 'tree_approaching'
 * @param {string} contextProfile 
 * @param {boolean} isByok 
 * @param {number} current 
 * @param {number} limit 
 * @returns {string}
 */
function getWarningMessage(type, contextProfile, isByok, current, limit) {
  const profileLabel = contextProfile === 'lite' ? 'Lite' : contextProfile === 'standard' ? 'Standard' : 'Max';

  switch (type) {
    case 'daily_approaching':
      if (contextProfile === 'lite' && !isByok) {
        return `您今天已使用 ${current} 次 ${profileLabel} 档位对话（上限 ${limit} 次）。如需大量对话，可考虑配置 BYOK 提升额度。`;
      } else if (contextProfile === 'standard' && !isByok) {
        return `您今天已使用 ${current} 次 ${profileLabel} 档位对话（上限 ${limit} 次）。Standard 档位消耗较多 token，建议合理安排使用或配置 BYOK。`;
      } else if (contextProfile === 'max' && isByok) {
        return `您今天已使用 ${current} 次 ${profileLabel} 档位对话（建议上限 ${limit} 次）。Max 档位消耗约 6-8k tokens/次，请留意 API 账户余额。`;
      } else {
        return `您今天已使用 ${current} 次 ${profileLabel} 档位对话（上限 ${limit} 次）。`;
      }

    case 'daily_reached':
      if (isByok) {
        return `您今天的 ${profileLabel} 档位对话已达建议上限（${limit} 次）。请检查您的 API 账户余额，确保有足够额度继续使用。`;
      } else {
        return `您今天的 ${profileLabel} 档位对话已达建议上限（${limit} 次）。继续使用可能影响其他用户的服务质量。建议明天再继续，或配置 BYOK 自主管理额度。`;
      }

    case 'tree_approaching':
      if (contextProfile === 'standard') {
        return `当前树已进行 ${current} 轮对话（建议上限 ${limit} 轮）。长对话树可能影响上下文质量，建议新开一棵树聚焦新话题，或使用树摘要功能整理关键信息。`;
      } else if (contextProfile === 'max') {
        return `当前树已进行 ${current} 轮对话（建议上限 ${limit} 轮）。Max 档位长对话会消耗大量 token，建议回顾树摘要提炼核心内容，或新开一棵树避免单树过长。`;
      } else {
        return `当前树已进行 ${current} 轮对话（建议上限 ${limit} 轮）。`;
      }

    default:
      return `使用量接近建议上限，请注意合理使用。`;
  }
}

/**
 * Check usage limits and return warnings
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.treeId - Tree ID (optional, for per-tree checks)
 * @param {string} params.contextProfile - Context profile (lite/standard/max)
 * @param {boolean} params.isByok - Whether using BYOK provider
 * @returns {Promise<Array>} Array of warning objects
 */
export async function checkUsageLimits({ userId, treeId, contextProfile, isByok }) {
  const warnings = [];

  if (!userId || !contextProfile) {
    return warnings;
  }

  const normalized = typeof contextProfile === 'string' ? contextProfile.toLowerCase() : 'lite';

  // Check daily limit
  const dailyCount = await getDailyUsageCount(userId, normalized);
  const dailyLimit = getDailyLimit(normalized, isByok);
  
  if (dailyLimit > 0) {
    const dailyPercentage = (dailyCount / dailyLimit) * 100;

    if (dailyPercentage >= WARNING_THRESHOLDS.reached) {
      warnings.push({
        type: 'usage_limit_reached',
        severity: 'warning',
        message: getWarningMessage('daily_reached', normalized, isByok, dailyCount, dailyLimit),
        details: {
          profile: normalized,
          period: 'daily',
          current: dailyCount,
          limit: dailyLimit,
          percentage: Math.round(dailyPercentage),
        },
      });
    } else if (dailyPercentage >= WARNING_THRESHOLDS.approaching) {
      warnings.push({
        type: 'usage_limit_approaching',
        severity: 'info',
        message: getWarningMessage('daily_approaching', normalized, isByok, dailyCount, dailyLimit),
        details: {
          profile: normalized,
          period: 'daily',
          current: dailyCount,
          limit: dailyLimit,
          percentage: Math.round(dailyPercentage),
        },
      });
    }
  }

  // Check per-tree limit (only for standard/max)
  if (['standard', 'max'].includes(normalized) && treeId) {
    const treeCount = await getTreeTurnCount(treeId);
    const treeLimit = getTreeLimit(normalized);

    if (treeLimit && treeCount > 0) {
      const treePercentage = (treeCount / treeLimit) * 100;

      if (treePercentage >= WARNING_THRESHOLDS.approaching) {
        warnings.push({
          type: 'usage_limit_approaching',
          severity: 'info',
          message: getWarningMessage('tree_approaching', normalized, isByok, treeCount, treeLimit),
          details: {
            profile: normalized,
            period: 'per_tree',
            current: treeCount,
            limit: treeLimit,
            percentage: Math.round(treePercentage),
          },
          suggestion: normalized === 'max' 
            ? '建议回顾树摘要提炼核心内容，或新开一棵树'
            : '建议新开一棵树聚焦新话题',
        });
      }
    }
  }

  return warnings;
}

export default {
  checkUsageLimits,
  getDailyUsageCount,
  getTreeTurnCount,
  getDailyLimit,
  getTreeLimit,
};
