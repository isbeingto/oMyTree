import { Router } from 'express';
import { pool } from '../db/pool.js';
import { abortStream, hasActiveStream } from '../lib/stream_abort_registry.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';

const router = Router();

// Helper to wait for turn to complete (poll with backoff)
async function waitForTurnCompletion(turnId, maxWaitMs = 5000) {
  const startTime = Date.now();
  const pollIntervalMs = 100;
  
  while (Date.now() - startTime < maxWaitMs) {
    const { rows } = await pool.query(
      `SELECT t.id, t.status, t.node_id,
              n_user.id as user_node_id, n_user.tree_id, n_user.text as user_text,
              n_ai.id as ai_node_id, n_ai.text as ai_text
       FROM turns t
       JOIN nodes n_user ON n_user.id = t.node_id
       LEFT JOIN nodes n_ai ON n_ai.parent_id = n_user.id AND n_ai.role = 'ai'
       WHERE t.id = $1
       LIMIT 1`,
      [turnId]
    );
    
    if (rows.length > 0) {
      const row = rows[0];
      // Turn is complete if status is 'completed' or 'aborted'
      if (row.status === 'completed' || row.status === 'aborted') {
        return {
          turn: {
            id: row.id,
            status: row.status,
            node_id: row.node_id,
          },
          user_node: row.user_node_id ? {
            id: row.user_node_id,
            tree_id: row.tree_id,
            text: row.user_text,
          } : null,
          ai_node: row.ai_node_id ? {
            id: row.ai_node_id,
            tree_id: row.tree_id,
            text: row.ai_text,
          } : null,
        };
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  return null; // Timed out
}

router.post('/api/turn/:id/abort', async (req, res) => {
  const turnId = req.params.id;
  if (!turnId) {
    return res.status(400).json({ ok: false, error: 'TURN_ID_REQUIRED' });
  }
  try {
    // T-REFRESH-FIX: Support uid from query params for navigator.sendBeacon() calls
    // which cannot set custom headers. The beforeunload handler uses sendBeacon
    // to notify the server to save partial content during page refresh.
    if (req.query?.uid && !req.headers['x-omytree-user-id']) {
      req.headers['x-omytree-user-id'] = req.query.uid;
    }
    const userId = await getAuthUserIdForRequest(req, pool);
    
    // BUG FIX: Turn record may not be visible in DB during streaming because
    // the transaction hasn't committed yet. Check the in-memory stream registry first.
    // The stream is registered with turnId in onStart callback before LLM response completes.
    const hasStream = hasActiveStream(turnId);
    
    // Try to find turn in DB (may not exist yet if transaction is still in progress)
    const { rows } = await pool.query(
      `SELECT t.id, tr.user_id, tr.id as tree_id
       FROM turns t
       JOIN nodes n ON n.id = t.node_id
       JOIN trees tr ON tr.id = n.tree_id
      WHERE t.id = $1 AND tr.user_id = $2
      LIMIT 1`,
      [turnId, userId]
    );
    
    // If turn not found in DB but we have an active stream, still allow abort
    // This handles the case where the turn exists but is in an uncommitted transaction
    if (rows.length === 0 && !hasStream) {
      console.log(`[turn.abort] Turn ${turnId} not found in DB and no active stream`);
      return res.status(404).json({ ok: false, error: 'TURN_NOT_FOUND' });
    }
    
    const treeId = rows.length > 0 ? rows[0].tree_id : null;

    // Signal abort to the stream
    const aborted = abortStream(turnId);
    console.log(`[turn.abort] Abort signal sent for turn ${turnId}: aborted=${aborted}, hadStream=${hasStream}`);
    
    if (!aborted && !hasStream) {
      // No active stream to abort - maybe it already completed
      console.log(`[turn.abort] No active stream for turn ${turnId}`);
      return res.status(200).json({ ok: true, aborted: false, already_completed: true });
    }
    
    // Wait for turn to complete (with timeout)
    const result = await waitForTurnCompletion(turnId, 5000);
    
    if (result) {
      return res.status(200).json({
        ok: true,
        aborted,
        tree_id: treeId || result.turn?.tree_id,
        turn: result.turn,
        user_node: result.user_node,
        ai_node: result.ai_node,
      });
    }
    
    // Timed out - return without node info (frontend should refresh)
    return res.status(200).json({ ok: true, aborted, tree_id: treeId, timeout: true });
  } catch (err) {
    console.error('[turn.abort] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: err?.message || 'failed to abort stream' });
  }
});

export default router;
