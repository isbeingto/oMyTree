/**
 * T70: Process Event Routes
 * T71: Session calculation (activity windows)
 * 
 * Zero-token process event history and stats API.
 * No LLM calls - only lightweight DB reads.
 */

import express from 'express';
import { validate as uuidValidate } from 'uuid';
import crypto from 'crypto';
import { HttpError, wrapAsync, respondWithError } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { assertTreeOwnership } from '../lib/tree_access.js';
import { VALID_EVENT_TYPES, isValidEventType } from '../lib/process_event.js';

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 168;

// T71: Session configuration
const SESSION_GAP_MINUTES = parseInt(process.env.SESSION_GAP_MINUTES, 10) || 30;
const MAX_SESSION_EVENTS = parseInt(process.env.MAX_SESSION_EVENTS, 10) || 2000;
const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;
const MAX_TOP_NODE_IDS = 20;

/**
 * T71: Compute stable session key from tree_id + start + end
 */
function computeSessionKey(treeId, startAt, endAt) {
    const input = `${treeId}|${new Date(startAt).toISOString()}|${new Date(endAt).toISOString()}`;
    return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
}

/**
 * T71: Group events into sessions based on time gaps
 * @param {Array} events - Events sorted by created_at DESC, id DESC
 * @param {string} treeId - Tree ID for session key computation
 * @param {number} gapMinutes - Gap threshold in minutes
 * @returns {Array} Sessions array
 */
function groupEventsIntoSessions(events, treeId, gapMinutes = SESSION_GAP_MINUTES) {
    if (events.length === 0) return [];

    const gapMs = gapMinutes * 60 * 1000;
    const sessions = [];
    let currentSession = {
        events: [events[0]],
        nodeIds: new Set(),
    };

    // Track node_ids from meta
    const addNodeId = (event) => {
        const nodeId = event.meta?.node_id || event.scope_node_id;
        if (nodeId && uuidValidate(nodeId)) {
            currentSession.nodeIds.add(nodeId);
        }
    };
    addNodeId(events[0]);

    for (let i = 1; i < events.length; i++) {
        const prevTime = new Date(events[i - 1].created_at).getTime();
        const currTime = new Date(events[i].created_at).getTime();
        const gap = prevTime - currTime; // DESC order so prev > curr

        if (gap >= gapMs) {
            // Finalize current session
            const startAt = events[currentSession.events.length - 1 + (i - currentSession.events.length)].created_at;
            const endAt = currentSession.events[0].created_at;
            sessions.push({
                session_key: computeSessionKey(treeId, currentSession.events[currentSession.events.length - 1].created_at, currentSession.events[0].created_at),
                start_at: new Date(currentSession.events[currentSession.events.length - 1].created_at).toISOString(),
                end_at: new Date(currentSession.events[0].created_at).toISOString(),
                events: currentSession.events,
                nodeIds: currentSession.nodeIds,
            });

            // Start new session
            currentSession = {
                events: [events[i]],
                nodeIds: new Set(),
            };
        } else {
            currentSession.events.push(events[i]);
        }
        addNodeId(events[i]);
    }

    // Finalize last session
    if (currentSession.events.length > 0) {
        sessions.push({
            session_key: computeSessionKey(treeId, currentSession.events[currentSession.events.length - 1].created_at, currentSession.events[0].created_at),
            start_at: new Date(currentSession.events[currentSession.events.length - 1].created_at).toISOString(),
            end_at: new Date(currentSession.events[0].created_at).toISOString(),
            events: currentSession.events,
            nodeIds: currentSession.nodeIds,
        });
    }

    return sessions;
}

export default function createProcessRouter(pg) {
    const router = express.Router();

    /**
     * GET /api/process/history
     * 
     * Query params:
     *   tree_id (required)
     *   scope_node_id (optional)
     *   since (optional, ISO8601) - exclusive filter: created_at > since
     *   limit (optional, default=50, max=200)
     *   event_type (optional) - filter by event type (must be in whitelist)
     * 
     * Returns events in created_at DESC order with next_cursor for pagination.
     */
    router.get(
        '/history',
        wrapAsync(async (req, res) => {
            const { tree_id, scope_node_id, since, limit: limitRaw, event_type } = req.query;

            // Validate tree_id
            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }
            const treeId = tree_id.trim();
            if (!uuidValidate(treeId)) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id must be a valid UUID' });
            }

            // Auth check: tree must belong to current user
            const userId = await getAuthUserIdForRequest(req, pg);
            await assertTreeOwnership(pg, treeId, userId);

            // Validate event_type if provided
            if (event_type && !isValidEventType(event_type)) {
                throw new HttpError({
                    status: 400,
                    code: 'invalid_event_type',
                    message: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
                });
            }

            // Parse limit
            const limit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, parseInt(limitRaw, 10) || DEFAULT_HISTORY_LIMIT));

            // Build query
            const values = [treeId];
            const conditions = ['tree_id = $1'];
            let paramIndex = 2;

            if (scope_node_id && uuidValidate(scope_node_id.trim())) {
                values.push(scope_node_id.trim());
                conditions.push(`scope_node_id = $${paramIndex++}`);
            }

            if (event_type) {
                values.push(event_type);
                conditions.push(`event_type = $${paramIndex++}`);
            }

            if (since) {
                const sinceDate = new Date(since);
                if (!isNaN(sinceDate.getTime())) {
                    values.push(sinceDate.toISOString());
                    conditions.push(`created_at > $${paramIndex++}`);
                }
            }

            values.push(limit + 1); // fetch one extra to determine if more pages exist

            const queryText = `
        SELECT id, tree_id, scope_node_id, event_type, meta, created_at
        FROM process_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT $${paramIndex}
      `;

            const { rows } = await pg.query(queryText, values);

            // Determine if there are more pages
            const hasMore = rows.length > limit;
            const events = hasMore ? rows.slice(0, limit) : rows;

            // Build next_cursor (composite: created_at|id)
            let nextCursor = null;
            if (hasMore && events.length > 0) {
                const lastEvent = events[events.length - 1];
                nextCursor = `${new Date(lastEvent.created_at).toISOString()}|${lastEvent.id}`;
            }

            res.status(200).json(withTraceId(res, {
                ok: true,
                events: events.map(e => ({
                    id: e.id,
                    tree_id: e.tree_id,
                    scope_node_id: e.scope_node_id,
                    event_type: e.event_type,
                    meta: e.meta || {},
                    created_at: new Date(e.created_at).toISOString(),
                })),
                next_cursor: nextCursor,
                has_more: hasMore,
            }));
        })
    );

    /**
     * GET /api/process/stats
     * 
     * Query params:
     *   tree_id (required)
     *   scope_node_id (optional)
     *   window_hours (optional, default=24, max=168)
     * 
     * Returns event counts and last_event_at within the time window.
     */
    router.get(
        '/stats',
        wrapAsync(async (req, res) => {
            const { tree_id, scope_node_id, window_hours: windowRaw } = req.query;

            // Validate tree_id
            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }
            const treeId = tree_id.trim();
            if (!uuidValidate(treeId)) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id must be a valid UUID' });
            }

            // Auth check
            const userId = await getAuthUserIdForRequest(req, pg);
            await assertTreeOwnership(pg, treeId, userId);

            // Parse window_hours
            const windowHours = Math.max(1, Math.min(MAX_WINDOW_HOURS, parseInt(windowRaw, 10) || DEFAULT_WINDOW_HOURS));
            const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

            // Build query
            const values = [treeId, windowStart.toISOString()];
            const conditions = ['tree_id = $1', 'created_at >= $2'];
            let paramIndex = 3;

            if (scope_node_id && uuidValidate(scope_node_id.trim())) {
                values.push(scope_node_id.trim());
                conditions.push(`scope_node_id = $${paramIndex++}`);
            }

            // Get counts grouped by event_type
            const countQuery = `
        SELECT event_type, COUNT(*) as count
        FROM process_events
        WHERE ${conditions.join(' AND ')}
        GROUP BY event_type
      `;
            const { rows: countRows } = await pg.query(countQuery, values);

            // Get last_event_at
            const lastEventQuery = `
        SELECT created_at
        FROM process_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const { rows: lastRows } = await pg.query(lastEventQuery, values);

            // Build response
            const eventTypeCounts = {};
            let totalCount = 0;
            for (const row of countRows) {
                eventTypeCounts[row.event_type] = parseInt(row.count, 10);
                totalCount += parseInt(row.count, 10);
            }

            const lastEventAt = lastRows.length > 0 ? new Date(lastRows[0].created_at).toISOString() : null;

            res.status(200).json(withTraceId(res, {
                ok: true,
                stats: {
                    window_hours: windowHours,
                    total_count: totalCount,
                    event_type_counts: eventTypeCounts,
                    last_event_at: lastEventAt,
                },
            }));
        })
    );

    /**
     * T71: GET /api/process/sessions
     * 
     * Query params:
     *   tree_id (required)
     *   scope_node_id (optional) - filter events by scope before grouping
     *   limit (optional, default=20, max=100)
     *   cursor (optional) - end_at|session_key for pagination
     * 
     * Returns sessions computed from process_events with gap >= SESSION_GAP_MINUTES.
     */
    router.get(
        '/sessions',
        wrapAsync(async (req, res) => {
            const { tree_id, scope_node_id, limit: limitRaw, cursor } = req.query;

            // Validate tree_id
            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }
            const treeId = tree_id.trim();
            if (!uuidValidate(treeId)) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id must be a valid UUID' });
            }

            // Auth check
            const userId = await getAuthUserIdForRequest(req, pg);
            await assertTreeOwnership(pg, treeId, userId);

            const limit = Math.max(1, Math.min(MAX_SESSION_LIMIT, parseInt(limitRaw, 10) || DEFAULT_SESSION_LIMIT));

            // Build query to fetch events
            const values = [treeId, MAX_SESSION_EVENTS];
            const conditions = ['tree_id = $1'];
            let paramIndex = 3;

            if (scope_node_id && uuidValidate(scope_node_id.trim())) {
                values.push(scope_node_id.trim());
                conditions.push(`scope_node_id = $${paramIndex++}`);
            }

            // Parse cursor for pagination (end_at|session_key)
            let cursorEndAt = null;
            let cursorSessionKey = null;
            if (cursor && typeof cursor === 'string') {
                const [endAtStr, keyStr] = cursor.split('|');
                if (endAtStr && keyStr) {
                    const parsedDate = new Date(endAtStr);
                    if (!isNaN(parsedDate.getTime())) {
                        cursorEndAt = parsedDate;
                        cursorSessionKey = keyStr;
                    }
                }
            }

            // Fetch events (limited for performance)
            const queryText = `
                SELECT id, tree_id, scope_node_id, event_type, meta, created_at
                FROM process_events
                WHERE ${conditions.join(' AND ')}
                ORDER BY created_at DESC, id DESC
                LIMIT $2
            `;
            const { rows: events } = await pg.query(queryText, values);

            // Group into sessions
            let sessions = groupEventsIntoSessions(events, treeId, SESSION_GAP_MINUTES);

            // Apply cursor filter (skip sessions until we pass the cursor)
            if (cursorEndAt && cursorSessionKey) {
                const cursorIdx = sessions.findIndex(s =>
                    new Date(s.end_at).getTime() < cursorEndAt.getTime() ||
                    (new Date(s.end_at).getTime() === cursorEndAt.getTime() && s.session_key !== cursorSessionKey)
                );
                if (cursorIdx > 0) {
                    sessions = sessions.slice(cursorIdx);
                } else if (cursorIdx === -1) {
                    sessions = [];
                }
            }

            // Paginate
            const hasMore = sessions.length > limit;
            const paginatedSessions = hasMore ? sessions.slice(0, limit) : sessions;

            // Build next cursor
            let nextCursor = null;
            if (hasMore && paginatedSessions.length > 0) {
                const lastSession = paginatedSessions[paginatedSessions.length - 1];
                nextCursor = `${lastSession.end_at}|${lastSession.session_key}`;
            }

            // Format response (summary only, no full node_ids)
            res.status(200).json(withTraceId(res, {
                ok: true,
                sessions: paginatedSessions.map(s => ({
                    session_key: s.session_key,
                    start_at: s.start_at,
                    end_at: s.end_at,
                    event_count: s.events.length,
                    node_count: s.nodeIds.size,
                    top_node_ids: Array.from(s.nodeIds).slice(0, MAX_TOP_NODE_IDS),
                })),
                next_cursor: nextCursor,
                has_more: hasMore,
                config: {
                    gap_minutes: SESSION_GAP_MINUTES,
                },
            }));
        })
    );

    /**
     * T71: GET /api/process/session/:session_key
     * 
     * Query params:
     *   tree_id (required) - must match, prevents enumeration
     * 
     * Returns full session details including all events and node_ids.
     */
    router.get(
        '/session/:session_key',
        wrapAsync(async (req, res) => {
            const { session_key } = req.params;
            const { tree_id } = req.query;

            // Validate tree_id
            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id query param is required' });
            }
            const treeId = tree_id.trim();
            if (!uuidValidate(treeId)) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id must be a valid UUID' });
            }

            // Validate session_key
            if (!session_key || typeof session_key !== 'string' || session_key.length !== 16) {
                throw new HttpError({ status: 400, code: 'invalid_session_key', message: 'session_key must be a 16-char hex string' });
            }

            // Auth check
            const userId = await getAuthUserIdForRequest(req, pg);
            await assertTreeOwnership(pg, treeId, userId);

            // Fetch events and compute sessions to find matching session_key
            const { rows: events } = await pg.query(
                `SELECT id, tree_id, scope_node_id, event_type, meta, created_at
                 FROM process_events
                 WHERE tree_id = $1
                 ORDER BY created_at DESC, id DESC
                 LIMIT $2`,
                [treeId, MAX_SESSION_EVENTS]
            );

            const sessions = groupEventsIntoSessions(events, treeId, SESSION_GAP_MINUTES);
            const matchedSession = sessions.find(s => s.session_key === session_key);

            if (!matchedSession) {
                throw new HttpError({ status: 404, code: 'session_not_found', message: 'Session not found for this tree' });
            }

            res.status(200).json(withTraceId(res, {
                ok: true,
                session: {
                    session_key: matchedSession.session_key,
                    start_at: matchedSession.start_at,
                    end_at: matchedSession.end_at,
                    event_count: matchedSession.events.length,
                    events: matchedSession.events.map(e => ({
                        id: e.id,
                        event_type: e.event_type,
                        meta: e.meta || {},
                        created_at: new Date(e.created_at).toISOString(),
                    })),
                    node_ids: Array.from(matchedSession.nodeIds),
                },
            }));
        })
    );

    // Error handler
    router.use((err, _req, res, _next) => {
        if (err instanceof HttpError) {
            respondWithError(res, err);
            return;
        }
        respondWithError(res, {
            status: 500,
            code: 'process_error',
            message: 'failed to process request',
            detail: err?.message,
        });
    });

    return router;
}
