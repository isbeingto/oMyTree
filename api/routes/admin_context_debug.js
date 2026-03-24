/**
 * T53-3: Admin API for Context Debug Logs
 * Query and manage context debug snapshots
 */

import express from 'express';
import { wrapAsync, HttpError } from '../lib/errors.js';
import { queryContextDebugLogs, cleanupOldDebugLogs } from '../services/context_debug.js';
import { pool } from '../db/pool.js';

const router = express.Router();

/**
 * GET /api/admin/context-debug
 * Query context debug logs
 * Query params:
 *   - tree_id: Filter by tree UUID
 *   - turn_id: Filter by turn UUID
 *   - user_id: Filter by user UUID
 *   - limit: Max results (default 50, max 200)
 */
router.get(
  '/',
  wrapAsync(async (req, res) => {
    const { tree_id, turn_id, user_id, limit } = req.query;

    const parsedLimit = Math.min(
      parseInt(limit, 10) || 50,
      200 // Max limit
    );

    const logs = await queryContextDebugLogs({
      treeId: tree_id || null,
      turnId: turn_id || null,
      userId: user_id || null,
      limit: parsedLimit,
    });

    res.json({
      ok: true,
      count: logs.length,
      logs: logs.map((log) => ({
        id: log.id,
        created_at: log.created_at,
        tree_id: log.tree_id,
        node_id: log.node_id,
        turn_id: log.turn_id,
        provider: log.provider,
        model: log.model,
        context_profile: log.context_profile,
        memory_scope: log.memory_scope,
        message_count: log.message_count,
        total_tokens: log.total_tokens,
        debug_enabled_by: log.debug_enabled_by,
        context_build_ms: log.context_build_ms,
        notes: log.notes,
        // Messages included in full response
        messages: log.messages,
      })),
    });
  })
);

/**
 * GET /api/admin/context-debug/:logId
 * Get single debug log by ID
 */
router.get(
  '/:logId',
  wrapAsync(async (req, res) => {
    const { logId } = req.params;

    const result = await pool.query(
      `SELECT * FROM context_debug_logs WHERE id = $1`,
      [logId]
    );

    if (result.rows.length === 0) {
      throw new HttpError({
        status: 404,
        code: 'debug_log_not_found',
        message: 'Debug log not found',
      });
    }

    const log = result.rows[0];

    res.json({
      ok: true,
      log: {
        id: log.id,
        created_at: log.created_at,
        tree_id: log.tree_id,
        node_id: log.node_id,
        turn_id: log.turn_id,
        user_id: log.user_id,
        provider: log.provider,
        model: log.model,
        context_profile: log.context_profile,
        memory_scope: log.memory_scope,
        messages: log.messages,
        message_count: log.message_count,
        total_tokens: log.total_tokens,
        debug_enabled_by: log.debug_enabled_by,
        context_build_ms: log.context_build_ms,
        notes: log.notes,
      },
    });
  })
);

/**
 * POST /api/admin/context-debug/cleanup
 * Delete old debug logs
 * Body: { days: 7 }
 */
router.post(
  '/cleanup',
  wrapAsync(async (req, res) => {
    const { days } = req.body;
    const daysOld = parseInt(days, 10) || 7;

    if (daysOld < 1) {
      throw new HttpError({
        status: 422,
        code: 'invalid_days',
        message: 'Days must be >= 1',
      });
    }

    const deleted = await cleanupOldDebugLogs(daysOld);

    res.json({
      ok: true,
      deleted,
      message: `Deleted ${deleted} logs older than ${daysOld} days`,
    });
  })
);

/**
 * PATCH /api/admin/context-debug/tree/:treeId
 * Toggle debug mode for a specific tree
 * Body: { enabled: true/false }
 */
router.patch(
  '/tree/:treeId',
  wrapAsync(async (req, res) => {
    const { treeId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      throw new HttpError({
        status: 422,
        code: 'invalid_enabled',
        message: 'enabled must be boolean',
      });
    }

    const result = await pool.query(
      `UPDATE trees 
       SET context_debug_enabled = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, context_debug_enabled`,
      [enabled, treeId]
    );

    if (result.rows.length === 0) {
      throw new HttpError({
        status: 404,
        code: 'tree_not_found',
        message: 'Tree not found',
      });
    }

    res.json({
      ok: true,
      tree_id: treeId,
      context_debug_enabled: result.rows[0].context_debug_enabled,
    });
  })
);

/**
 * GET /api/admin/context-debug/stats
 * Get debug log statistics
 */
router.get(
  '/stats',
  wrapAsync(async (req, res) => {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_logs,
        COUNT(DISTINCT tree_id) as unique_trees,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(message_count) as total_messages,
        AVG(message_count) as avg_messages_per_log,
        AVG(total_tokens) as avg_tokens_per_log,
        MAX(created_at) as latest_log,
        MIN(created_at) as earliest_log
      FROM context_debug_logs
    `);

    const profileBreakdown = await pool.query(`
      SELECT 
        context_profile,
        memory_scope,
        COUNT(*) as count
      FROM context_debug_logs
      GROUP BY context_profile, memory_scope
      ORDER BY count DESC
    `);

    res.json({
      ok: true,
      stats: stats.rows[0],
      profile_breakdown: profileBreakdown.rows,
    });
  })
);

export default router;
