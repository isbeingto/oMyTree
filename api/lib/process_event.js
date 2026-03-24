/**
 * T70: Process Event Logging Helper
 * 
 * Zero-token event logging for user behavior and system actions.
 * Fail-open: errors are logged but never thrown to avoid blocking main flows.
 * 
 * P0-6: Extended to support second-layer asset actions (trail, keyframe, snapshot, diff).
 */

export const VALID_EVENT_TYPES = Object.freeze([
    // Core dialogue events
    'turn_created',
    'branch_created',
    'node_focused',
    'model_switched',
    'attachment_added',

    // Memo events
    'memo_generated',
    'memo_updated',
    'memo_regenerated',

    // P0-6: Trail (Thinking Trail) events
    'trail.generated',
    'trail.version_viewed',

    // P0-6: Keyframe events
    'keyframe.pinned',
    'keyframe.unpinned',
    'keyframe.annotation_updated',

    // P1-1/P1-2: Reserved for future second-layer assets
    'snapshot.created',
    'branch.diff_generated',
]);

/**
 * Check if event type is valid
 * @param {string} eventType 
 * @returns {boolean}
 */
export function isValidEventType(eventType) {
    return VALID_EVENT_TYPES.includes(eventType);
}

/**
 * Log a process event (fail-open)
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {Object} params
 * @param {string} params.tree_id - Required tree ID
 * @param {string|null} params.scope_node_id - Scope node (context-dependent)
 * @param {string} params.event_type - Must be in VALID_EVENT_TYPES
 * @param {Object} params.meta - Event metadata
 * @param {string} [params.meta.actor] - 'user' or 'system'
 * @param {string} [params.meta.source] - 'web' or 'api'
 * @param {string} [params.meta.node_id] - Related node ID
 * @param {string} [params.meta.turn_id] - Related turn ID
 * @param {string} [params.meta.memo_id] - Related memo ID
 * @param {string} [params.meta.model] - LLM model name
 * @param {string} [params.meta.conversation_id] - Optional conversation ID
 */
export async function logProcessEvent(pool, { tree_id, scope_node_id, event_type, meta }) {
    // Validate event type (fail-open)
    if (!isValidEventType(event_type)) {
        console.warn(`[process_event] invalid event_type rejected: ${event_type}`);
        return;
    }

    // Validate tree_id
    if (!tree_id) {
        console.warn('[process_event] missing tree_id, skipping');
        return;
    }

    try {
        await pool.query(
            `INSERT INTO process_events (tree_id, scope_node_id, event_type, meta)
       VALUES ($1, $2, $3, $4)`,
            [tree_id, scope_node_id || null, event_type, meta || {}]
        );
    } catch (err) {
        // Fail-open: log warning but never throw
        console.warn('[process_event] write failed, continuing:', err.message);
    }
}

export default { VALID_EVENT_TYPES, isValidEventType, logProcessEvent };
