/**
 * Account Quota Status API
 *
 * GET /api/account/quota-status
 * - Returns weekly quota usage/remaining for official (platform) requests.
 * - Resets every Monday 00:00 UTC.
 *
 * Notes:
 * - BYOK requests bypass turn limits entirely.
 * - BYOK requests still count against summarize weekly quota.
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getAuthUserIdForRequest, isDemoUserId } from '../lib/auth_user.js';
import { withTraceId } from '../lib/trace.js';
import rateLimits, { getCurrentWeekStartUTC, getNextMondayMidnightUTC } from '../config/rate_limits.js';
import { hasActiveUserProviders } from '../services/user_llm_providers.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'string') return 'free';
  const normalized = raw.toLowerCase().trim();
  if (normalized === 'free' || normalized === 'pro' || normalized === 'team') {
    return normalized;
  }
  return 'free';
}

function buildWeekBucket(now) {
  const weekStart = getCurrentWeekStartUTC(now);
  const year = weekStart.getUTCFullYear();
  const month = weekStart.getUTCMonth();
  const day = weekStart.getUTCDate();
  return `W${year}${pad(month + 1)}${pad(day)}`;
}

async function getWeeklyCount(redis, key) {
  const raw = await redis.get(key);
  const parsed = Number.parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function createAccountQuotaStatusRouter({ redis }) {
  const router = express.Router();

  router.get('/api/account/quota-status', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);

      if (isDemoUserId(userId)) {
        const now = new Date();
        const resetAt = getNextMondayMidnightUTC(now).toISOString();
        return res.json(
          withTraceId(res, {
            ok: true,
            plan: 'free',
            has_byok: false,
            reset_at: resetAt,
            weekly: {
              turn: {
                used: 0,
                limit: rateLimits.turn.perWeek.free,
                remaining: rateLimits.turn.perWeek.free,
                byok_unlimited: true,
              },
              summarize: {
                used: 0,
                limit: rateLimits.summarize.perWeek.free,
                remaining: rateLimits.summarize.perWeek.free,
                byok_unlimited: false,
              },
              upload: {
                used: 0,
                limit: rateLimits.upload?.perWeek?.free ?? 0,
                remaining: rateLimits.upload?.perWeek?.free ?? 0,
                byok_unlimited: true,
              },
            },
          })
        );
      }

      const planRow = await client.query(`SELECT plan FROM users WHERE id = $1 LIMIT 1`, [userId]);
      const plan = normalizePlan(planRow.rows[0]?.plan);
      const hasByok = await hasActiveUserProviders(userId);

      const now = new Date();
      const bucket = buildWeekBucket(now);
      const resetAt = getNextMondayMidnightUTC(now).toISOString();

      const weeklyTurnLimit = rateLimits.turn?.perWeek?.[plan] ?? rateLimits.turn.perWeek.free;
      const weeklySummarizeLimit =
        rateLimits.summarize?.perWeek?.[plan] ?? rateLimits.summarize.perWeek.free;
      const weeklyUploadLimit = rateLimits.upload?.perWeek?.[plan] ?? rateLimits.upload?.perWeek?.free ?? 0;

      const turnKey = `quota:turn:${userId}:${bucket}`;
      const summarizeKey = `quota:summarize:${userId}:${bucket}`;
      const uploadKey = `quota:upload:${userId}:${bucket}`;

      const [turnUsed, summarizeUsed, uploadUsed] = await Promise.all([
        // Turn is tracked even for BYOK users, but enforcement bypasses it.
        getWeeklyCount(redis, turnKey),
        getWeeklyCount(redis, summarizeKey),
        getWeeklyCount(redis, uploadKey),
      ]);

      const weeklyTurnRemaining = Math.max(weeklyTurnLimit - turnUsed, 0);
      const weeklySummarizeRemaining = Math.max(weeklySummarizeLimit - summarizeUsed, 0);
      const weeklyUploadRemaining = Math.max(weeklyUploadLimit - uploadUsed, 0);

      return res.json(
        withTraceId(res, {
          ok: true,
          plan,
          has_byok: hasByok,
          reset_at: resetAt,
          weekly: {
            turn: {
              used: turnUsed,
              limit: weeklyTurnLimit,
              remaining: weeklyTurnRemaining,
              byok_unlimited: true,
            },
            summarize: {
              used: summarizeUsed,
              limit: weeklySummarizeLimit,
              remaining: weeklySummarizeRemaining,
              byok_unlimited: false,
            },
            upload: {
              used: uploadUsed,
              limit: weeklyUploadLimit,
              remaining: weeklyUploadRemaining,
              byok_unlimited: true,
            },
          },
        })
      );
    } catch (error) {
      console.error('[account/quota-status] GET error:', error);
      return res.status(500).json(
        withTraceId(res, {
          ok: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to get quota status',
        })
      );
    } finally {
      client.release();
    }
  });

  return router;
}
