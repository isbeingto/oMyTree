/**
 * Admin Stats API
 * T27-5: Telemetry & Future Monetization Hooks
 * 
 * GET /api/admin/stats - Get platform-wide statistics
 */

import express from 'express';
import { getStats } from '../services/telemetry.js';

const router = express.Router();

/**
 * GET /api/admin/stats
 * Returns aggregated platform statistics for admin dashboard
 */
router.get('/api/admin/stats', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  
  try {
    const stats = await getStats();
    
    res.json({
      ok: true,
      stats,
      generated_at: new Date().toISOString(),
      trace_id: traceId,
    });
  } catch (error) {
    console.error('[admin/stats] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: traceId,
    });
  }
});

export default router;
