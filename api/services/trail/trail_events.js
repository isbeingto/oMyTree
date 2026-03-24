/**
 * Trail Events Service
 * 
 * Records events in tree_trail_events table for TreeTrail history.
 */

import { pool } from '../../db/pool.js';

/**
 * Record a trail event
 * 
 * @param {Object} params
 * @param {string} params.treeId - Tree ID
 * @param {string} params.type - Event type (EVIDENCE_ATTACHED, EVIDENCE_CREATED, etc.)
 * @param {string} params.actor - Actor type: 'user', 'assistant', or 'system'
 * @param {string} [params.nodeId] - Optional node ID
 * @param {string} [params.turnId] - Optional turn ID
 * @param {Object} [params.payload] - Optional JSON payload
 */
export async function recordTrailEvent({
  treeId,
  type,
  actor,
  nodeId = null,
  turnId = null,
  payload = {},
}) {
  await pool.query(
    `INSERT INTO tree_trail_events (tree_id, type, actor, node_id, turn_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [treeId, type, actor, nodeId, turnId, JSON.stringify(payload)]
  );
}
