/**
 * ME Usage Routes
 * 
 * GET /api/me/usage/month - Get current month usage statistics
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { getUserPlan } from '../services/plan_limits.js';

const monthStartSQL = "DATE_TRUNC('month', CURRENT_DATE)";

const parseIntSafe = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  return 0;
};

const getPeriod = () => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return { from, to };
};

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'string') return 'free';
  const normalized = plan.toLowerCase().trim();
  if (normalized === 'free' || normalized === 'pro' || normalized === 'team') {
    return normalized;
  }
  return 'free';
}

export default function createMeUsageRouter() {
  const router = express.Router();

  /**
   * GET /api/me/usage/month
   * Get current month usage statistics
   */
  router.get('/api/me/usage/month', wrapAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);

      const planName = normalizePlan(await getUserPlan({ userId, client }));

      // Get usage summary
      const summaryResult = await client.query(
        `
          SELECT
            COALESCE(SUM(requests), 0) AS requests,
            COALESCE(SUM(tokens_total), 0) AS tokens_total,
            COALESCE(SUM(tokens_total) FILTER (WHERE is_byok = FALSE), 0) AS tokens_platform,
            COALESCE(SUM(tokens_total) FILTER (WHERE is_byok = TRUE), 0) AS tokens_byok
          FROM llm_usage_daily
          WHERE user_id = $1
            AND usage_date >= ${monthStartSQL}
        `,
        [userId]
      );

      // Get usage by provider
      const byProviderResult = await client.query(
        `
          SELECT
            provider,
            is_byok,
            COALESCE(SUM(requests), 0) AS requests,
            COALESCE(SUM(tokens_total), 0) AS tokens_total
          FROM llm_usage_daily
          WHERE user_id = $1
            AND usage_date >= ${monthStartSQL}
          GROUP BY provider, is_byok
          ORDER BY tokens_total DESC, provider ASC
        `,
        [userId]
      );


      const summaryRow = summaryResult.rows[0] || {};
      const summary = {
        requests: parseIntSafe(summaryRow.requests),
        tokens_total: parseIntSafe(summaryRow.tokens_total),
        tokens_platform: parseIntSafe(summaryRow.tokens_platform),
        tokens_byok: parseIntSafe(summaryRow.tokens_byok),
      };

      const byProvider = byProviderResult.rows.map((row) => ({
        provider: row.provider,
        is_byok: row.is_byok,
        requests: parseIntSafe(row.requests),
        tokens_total: parseIntSafe(row.tokens_total),
      }));

      res.json(withTraceId(res, {
        ok: true,
        period: getPeriod(),
        summary,
        by_provider: byProvider,
        plan: {
          name: planName,
        },
      }));
    } catch (err) {
      console.error('[me/usage/month] Failed to load usage', err);
      throw new HttpError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Failed to load usage',
      });
    } finally {
      client.release();
    }
  }));

  return router;
}
