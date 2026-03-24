/**
 * T58-7-2: Admin Ledger Debug Endpoint
 * 
 * GET /api/admin/debug/ledger-atoms
 * 
 * Returns recent ledger atoms for debugging purposes.
 * Only available when ACCEPT_DEV_ENDPOINTS=1
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { respondWithError } from '../lib/errors.js';

const router = express.Router();

/**
 * GET /api/admin/debug/ledger-atoms
 * 
 * Query params:
 *   tree_id: UUID (required) - The tree to query atoms for
 *   limit: number (optional, default 20, max 100) - Number of atoms to return
 * 
 * Returns:
 *   { ok: true, atoms: [...], count: number }
 */
router.get('/ledger-atoms', async (req, res) => {
    // Dev mode check
    if (process.env.ACCEPT_DEV_ENDPOINTS !== '1') {
        return respondWithError(res, {
            status: 403,
            code: 'debug_disabled',
            message: 'Debug endpoints are disabled in production'
        });
    }

    const { tree_id, limit: limitParam } = req.query;

    if (!tree_id) {
        return respondWithError(res, {
            status: 400,
            code: 'missing_tree_id',
            message: 'tree_id query parameter is required'
        });
    }

    const limit = Math.min(Math.max(1, parseInt(limitParam || '20', 10)), 100);

    try {
        const { rows } = await pool.query(
            `SELECT id, tree_id, ts, kind, subkind, text, sources, confidence, payload
       FROM semantic_ledger_atoms
       WHERE tree_id = $1
       ORDER BY ts DESC
       LIMIT $2`,
            [tree_id, limit]
        );

        res.json({
            ok: true,
            atoms: rows,
            count: rows.length,
            tree_id,
        });
    } catch (err) {
        console.error('[admin_ledger_debug] Query failed:', err?.message || err);
        return respondWithError(res, {
            status: 500,
            code: 'query_failed',
            message: 'Failed to query ledger atoms'
        });
    }
});

export default router;
