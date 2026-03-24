/**
 * Admin LLM Usage & Config Routes
 * T27-4: Admin Usage Dashboard & Kill Switch
 * 
 * GET  /api/admin/usage      - Get user usage statistics
 * GET  /api/admin/llm-config - Get LLM configuration (kill switch status)
 * POST /api/admin/llm-config - Update LLM configuration
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { isOfficialLLMEnabled, setOfficialLLMEnabled } from '../services/system_config.js';

const router = express.Router();

/**
 * GET /api/admin/usage
 * Returns user usage statistics with daily/monthly counts
 * Sorted by monthly usage (descending)
 */
router.get('/api/admin/usage', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  
  try {
    // Query: Get all users with their usage stats
    // Join with user_api_keys to check if they have BYOK
    const result = await pool.query(`
      WITH daily_usage AS (
        SELECT 
          user_id,
          COUNT(*) as count
        FROM llm_usage_events
        WHERE is_byok = false
          AND created_at >= CURRENT_DATE
        GROUP BY user_id
      ),
      monthly_usage AS (
        SELECT 
          user_id,
          COUNT(*) as count
        FROM llm_usage_events
        WHERE is_byok = false
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY user_id
      ),
      user_keys AS (
        SELECT DISTINCT user_id
        FROM user_api_keys
      )
      SELECT 
        u.id,
        u.email,
        u.name,
        u.created_at as user_created_at,
        COALESCE(d.count, 0)::int as daily_requests,
        COALESCE(m.count, 0)::int as monthly_requests,
        CASE WHEN k.user_id IS NOT NULL THEN true ELSE false END as has_byok
      FROM users u
      LEFT JOIN daily_usage d ON d.user_id = u.id
      LEFT JOIN monthly_usage m ON m.user_id = u.id
      LEFT JOIN user_keys k ON k.user_id = u.id
      ORDER BY COALESCE(m.count, 0) DESC, COALESCE(d.count, 0) DESC
      LIMIT 100
    `);

    // Get totals
    const totalsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND is_byok = false) as today_total,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND is_byok = false) as month_total,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND is_byok = true) as today_byok,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND is_byok = true) as month_byok
      FROM llm_usage_events
    `);

    const totals = totalsResult.rows[0] || {};

    res.json({
      ok: true,
      users: result.rows.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name,
        created_at: row.user_created_at,
        daily_requests: row.daily_requests,
        monthly_requests: row.monthly_requests,
        has_byok: row.has_byok,
      })),
      totals: {
        today: {
          official: parseInt(totals.today_total) || 0,
          byok: parseInt(totals.today_byok) || 0,
        },
        month: {
          official: parseInt(totals.month_total) || 0,
          byok: parseInt(totals.month_byok) || 0,
        },
      },
      trace_id: traceId,
    });
  } catch (error) {
    console.error('[admin/usage] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: traceId,
    });
  }
});

/**
 * GET /api/admin/llm-config
 * Returns current LLM configuration including kill switch status
 */
router.get('/api/admin/llm-config', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  
  try {
    const officialEnabled = await isOfficialLLMEnabled();
    
    // Get last update info
    const configResult = await pool.query(`
      SELECT value, updated_at, updated_by
      FROM system_config
      WHERE key = 'official_llm_enabled'
    `);
    
    const configRow = configResult.rows[0];
    let updatedBy = null;
    
    if (configRow?.updated_by) {
      const userResult = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [configRow.updated_by]
      );
      updatedBy = userResult.rows[0]?.email || configRow.updated_by;
    }

    res.json({
      ok: true,
      config: {
        official_llm_enabled: officialEnabled,
        updated_at: configRow?.updated_at || null,
        updated_by: updatedBy,
      },
      trace_id: traceId,
    });
  } catch (error) {
    console.error('[admin/llm-config] GET Error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: traceId,
    });
  }
});

/**
 * POST /api/admin/llm-config
 * Update LLM configuration (toggle kill switch)
 * Body: { official_llm_enabled: boolean }
 */
router.post('/api/admin/llm-config', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  const { official_llm_enabled } = req.body;
  
  // Get admin user ID from session (if available)
  const adminUserId = req.user?.id || null;

  if (typeof official_llm_enabled !== 'boolean') {
    return res.status(422).json({
      ok: false,
      error: 'INVALID_PARAMETER',
      message: 'official_llm_enabled must be a boolean',
      trace_id: traceId,
    });
  }

  try {
    const success = await setOfficialLLMEnabled(official_llm_enabled, adminUserId);
    
    if (!success) {
      return res.status(500).json({
        ok: false,
        error: 'CONFIG_UPDATE_FAILED',
        message: 'Failed to update configuration',
        trace_id: traceId,
      });
    }

    console.log(`[admin/llm-config] Kill switch ${official_llm_enabled ? 'ENABLED' : 'DISABLED'} by ${adminUserId || 'unknown'}`);

    res.json({
      ok: true,
      config: {
        official_llm_enabled,
        updated_at: new Date().toISOString(),
      },
      trace_id: traceId,
    });
  } catch (error) {
    console.error('[admin/llm-config] POST Error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: traceId,
    });
  }
});

export default router;
