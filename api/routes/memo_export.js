/**
 * T74: Memo Export API
 * 
 * POST /api/memo/export - Export memos and process events as markdown bundle
 * 
 * Features:
 * - Single-md output (default) or zip (future)
 * - Scope alignment with T71: tree|branch|session|since_memo
 * - Limits: 50 memos, 5000 events → 413
 * - Security: tree ownership + scope_node_id validation
 * - Portable jump links: omytree://node/{id}
 */

import express from 'express';
import { validate as uuidValidate } from 'uuid';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { assertTreeOwnership } from '../lib/tree_access.js';

const MAX_MEMOS = 50;
const MAX_EVENTS = 5000;
const DEFAULT_DEPTH = 20;
const MAX_DEPTH = 50;

/**
 * Normalize memo_json (string or object)
 */
function normalizeMemoJson(memoJson) {
    if (!memoJson) return {};
    if (typeof memoJson === 'string') {
        try { return JSON.parse(memoJson); } catch { return {}; }
    }
    return typeof memoJson === 'object' ? memoJson : {};
}

/**
 * Build portable jump link for node
 */
function buildNodeLink(nodeId, treeId) {
    const shortId = nodeId.slice(0, 8);
    const primary = `omytree://node/${nodeId}`;
    const fallback = `/app/workspace?tree_id=${treeId}&node_id=${nodeId}`;
    return `[(node:${shortId})](${primary}) | [open](${fallback})`;
}

/**
 * Format bullet with jump links
 */
function formatBullet(bullet, treeId) {
    const text = bullet.text || '';
    if (!bullet.anchors || bullet.anchors.length === 0) {
        return text;
    }
    const links = bullet.anchors
        .slice(0, 2)
        .map(a => buildNodeLink(a.id, treeId))
        .join(' ');
    return `${text} ${links}`;
}

/**
 * Format keyframes table
 */
function formatKeyframesTable(keyframes) {
    if (!keyframes || keyframes.length === 0) return '';

    const rows = keyframes.map(kf => {
        const nodeId = (kf.node_id || '').slice(0, 8);
        const preview = (kf.title_preview || '—').slice(0, 40);
        const reasons = Array.isArray(kf.reason_codes) ? kf.reason_codes.join(', ') : '';
        return `| ${nodeId} | ${preview} | ${reasons} |`;
    });

    return [
        '',
        '#### Keyframes Used',
        '',
        '| Node | Preview | Signals |',
        '|------|---------|---------|',
        ...rows,
        '',
    ].join('\n');
}

/**
 * Format evidence table (if available)
 */
function formatEvidenceTable(evidenceItems) {
    if (!evidenceItems || evidenceItems.length === 0) return '';

    const rows = evidenceItems.map(ev => {
        const id = ev.id || '';
        const title = (ev.title || '—').slice(0, 50);
        const url = ev.url || '—';
        return `| ${id} | ${title} | ${url} |`;
    });

    return [
        '',
        '#### Evidence',
        '',
        '| ID | Title | URL |',
        '|----|-------|-----|',
        ...rows,
        '',
    ].join('\n');
}

/**
 * Format memo as markdown section
 */
function formatMemoSection(memo, treeId, evidenceItems = []) {
    const lines = [];

    lines.push(`### Memo: ${memo.memo_id}`);
    lines.push('');
    lines.push(`- **Created**: ${new Date(memo.created_at).toISOString()}`);
    lines.push(`- **Language**: ${memo.lang || 'zh'}`);
    lines.push(`- **Based on**: ${memo.based_on_memo_id || 'Standalone'}`);
    lines.push(`- **Coverage**: nodes ${memo.from_node_seq || 0} → ${memo.to_node_seq || 0}`);
    lines.push('');

    // Bullets
    lines.push('#### Bullets');
    lines.push('');
    const bullets = memo.bullets || [];
    bullets.forEach((bullet, idx) => {
        lines.push(`${idx + 1}. ${formatBullet(bullet, treeId)}`);
    });

    // Keyframes
    lines.push(formatKeyframesTable(memo.keyframes));

    // Evidence
    lines.push(formatEvidenceTable(evidenceItems));

    return lines.join('\n');
}

/**
 * Format process events as markdown table
 */
function formatEventsTable(events) {
    if (!events || events.length === 0) return '';

    const rows = events.map(ev => {
        const time = new Date(ev.created_at).toISOString();
        const type = ev.event_type || '';
        const nodeId = (ev.scope_node_id || ev.meta?.node_id || '').slice(0, 8);
        const meta = JSON.stringify(ev.meta || {}).slice(0, 60);
        return `| ${time} | ${type} | ${nodeId} | ${meta} |`;
    });

    return [
        '',
        '## Process Events',
        '',
        '| Time | Type | Node | Meta |',
        '|------|------|------|------|',
        ...rows,
        '',
    ].join('\n');
}

/**
 * Format process events as JSONL
 */
function formatEventsJsonl(events) {
    if (!events || events.length === 0) return '';

    const lines = events.map(ev => JSON.stringify({
        id: ev.id,
        event_type: ev.event_type,
        scope_node_id: ev.scope_node_id,
        meta: ev.meta,
        created_at: ev.created_at,
    }));

    return [
        '',
        '## Process Events (JSONL)',
        '',
        '```jsonl',
        ...lines,
        '```',
        '',
    ].join('\n');
}

export default function createMemoExportRouter(pg) {
    const router = express.Router();

    /**
     * POST /api/memo/export
     * 
     * Request body:
     * {
     *   tree_id: string (required)
     *   scope_node_id?: string
     *   memo_id?: string (defaults to latest)
     *   scope_type?: 'tree'|'branch'|'session'|'since_memo' (default: tree)
     *   session_key?: string (required if scope_type=session)
     *   depth?: number (default: 20, max: 50)
     *   format?: 'md'|'zip' (default: md)
     *   include_events?: boolean (default: true)
     *   events_format?: 'jsonl'|'md' (default: jsonl)
     * }
     */
    router.post(
        '/export',
        wrapAsync(async (req, res) => {
            const {
                tree_id,
                scope_node_id,
                memo_id,
                scope_type = 'tree',
                session_key,
                depth: depthRaw,
                format = 'md',
                include_events = true,
                events_format = 'jsonl',
            } = req.body || {};

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

            // Validate scope_node_id belongs to tree
            let scopeNodeId = null;
            if (scope_node_id && typeof scope_node_id === 'string') {
                scopeNodeId = scope_node_id.trim();
                if (!uuidValidate(scopeNodeId)) {
                    throw new HttpError({ status: 400, code: 'invalid_scope_node_id', message: 'scope_node_id must be a valid UUID' });
                }
                const { rows: nodeCheck } = await pg.query(
                    `SELECT 1 FROM nodes WHERE id = $1 AND tree_id = $2 LIMIT 1`,
                    [scopeNodeId, treeId]
                );
                if (nodeCheck.length === 0) {
                    throw new HttpError({ status: 400, code: 'scope_node_not_found', message: 'scope_node_id does not belong to this tree' });
                }
            }

            // Validate scope_type
            const validScopeTypes = ['tree', 'branch', 'session', 'since_memo'];
            const effectiveScopeType = validScopeTypes.includes(scope_type) ? scope_type : 'tree';
            if (effectiveScopeType === 'session' && (!session_key || typeof session_key !== 'string')) {
                throw new HttpError({ status: 400, code: 'invalid_session_key', message: 'session_key is required when scope_type=session' });
            }

            const depth = Math.max(1, Math.min(MAX_DEPTH, parseInt(depthRaw, 10) || DEFAULT_DEPTH));

            console.log(`[memo:export] tree=${treeId} scope=${effectiveScopeType} depth=${depth} format=${format}`);

            // Step 1: Get memos (chain traversal if memo_id specified, else latest + history)
            let memos = [];
            let startMemoId = memo_id;

            if (!startMemoId) {
                // Get latest memo
                const { rows: latestRows } = await pg.query(
                    `SELECT id FROM memos WHERE tree_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [treeId]
                );
                if (latestRows.length > 0) {
                    startMemoId = latestRows[0].id;
                }
            }

            if (startMemoId) {
                // Traverse chain backward
                const visited = new Set();
                let currentId = startMemoId;

                while (currentId && memos.length < depth) {
                    if (visited.has(currentId)) break; // Cycle protection
                    visited.add(currentId);

                    const { rows } = await pg.query(
                        `SELECT id, tree_id, scope_root_node_id, created_at, 
                                from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang
                         FROM memos WHERE id = $1 LIMIT 1`,
                        [currentId]
                    );

                    if (rows.length === 0) break;

                    const row = rows[0];
                    const memoJson = normalizeMemoJson(row.memo_json);

                    memos.unshift({
                        memo_id: row.id,
                        created_at: row.created_at,
                        from_node_seq: row.from_node_seq,
                        to_node_seq: row.to_node_seq,
                        based_on_memo_id: row.based_on_memo_id,
                        lang: row.lang || memoJson.lang || 'zh',
                        bullets: memoJson.bullets || [],
                        keyframes: memoJson.keyframes || [],
                    });

                    currentId = row.based_on_memo_id;
                }
            }

            // Check memo limit
            if (memos.length > MAX_MEMOS) {
                throw new HttpError({
                    status: 413,
                    code: 'export_too_large',
                    message: `Export exceeds limit: ${memos.length} memos (max ${MAX_MEMOS})`,
                    hint: 'Reduce depth or use more specific scope',
                });
            }

            // Step 2: Get process events (if requested)
            let events = [];
            if (include_events) {
                const values = [treeId, MAX_EVENTS + 1];
                let whereClause = 'tree_id = $1';

                if (scopeNodeId) {
                    values.push(scopeNodeId);
                    whereClause += ` AND scope_node_id = $${values.length}`;
                }

                // Time window from memos
                if (memos.length > 0) {
                    const startTime = memos[0].created_at;
                    const endTime = memos[memos.length - 1].created_at;
                    values.push(new Date(startTime).toISOString());
                    values.push(new Date(endTime).toISOString());
                    whereClause += ` AND created_at >= $${values.length - 1} AND created_at <= $${values.length}`;
                }

                const { rows: eventRows } = await pg.query(
                    `SELECT id, tree_id, scope_node_id, event_type, meta, created_at
                     FROM process_events
                     WHERE ${whereClause}
                     ORDER BY created_at ASC
                     LIMIT $2`,
                    values
                );

                events = eventRows;

                // Check event limit
                if (events.length > MAX_EVENTS) {
                    throw new HttpError({
                        status: 413,
                        code: 'export_too_large',
                        message: `Export exceeds limit: ${events.length} events (max ${MAX_EVENTS})`,
                        hint: 'Use more specific scope or time range',
                    });
                }
            }

            // Step 3: Fetch evidence for memos (if node_evidence_links exists)
            const evidenceByMemo = new Map();
            try {
                // Get all node_ids from keyframes
                const allNodeIds = [];
                for (const memo of memos) {
                    if (memo.keyframes) {
                        for (const kf of memo.keyframes) {
                            if (kf.node_id) allNodeIds.push(kf.node_id);
                        }
                    }
                }

                if (allNodeIds.length > 0) {
                    const { rows: evRows } = await pg.query(
                        `SELECT l.node_id, e.id, e.title, e.url
                         FROM node_evidence_links l
                         JOIN evidence e ON e.id = l.evidence_id
                         WHERE l.node_id = ANY($1)`,
                        [allNodeIds]
                    );

                    // Group by node_id for easy lookup
                    for (const ev of evRows) {
                        // Map to memo that contains this node
                        for (const memo of memos) {
                            const hasNode = memo.keyframes?.some(kf => kf.node_id === ev.node_id);
                            if (hasNode) {
                                if (!evidenceByMemo.has(memo.memo_id)) {
                                    evidenceByMemo.set(memo.memo_id, []);
                                }
                                evidenceByMemo.get(memo.memo_id).push(ev);
                            }
                        }
                    }
                }
            } catch (e) {
                // Non-fatal: evidence table may not exist
                console.warn('[memo:export] Evidence lookup failed:', e.message);
            }

            // Step 4: Build markdown output
            const mdLines = [];

            // Header
            mdLines.push('# Memo Export');
            mdLines.push('');
            mdLines.push(`- **Tree ID**: ${treeId}`);
            mdLines.push(`- **Scope**: ${effectiveScopeType}${scopeNodeId ? ` / ${scopeNodeId}` : ' / Full tree'}`);
            mdLines.push(`- **Exported at**: ${new Date().toISOString()}`);
            mdLines.push(`- **Memo count**: ${memos.length}`);

            if (memos.length > 0) {
                const earliest = new Date(memos[0].created_at).toISOString();
                const latest = new Date(memos[memos.length - 1].created_at).toISOString();
                mdLines.push(`- **Time range**: ${earliest} → ${latest}`);
            }

            mdLines.push('');
            mdLines.push('---');
            mdLines.push('');

            // Memos section
            mdLines.push('## Memos');
            mdLines.push('');

            for (const memo of memos) {
                const evidence = evidenceByMemo.get(memo.memo_id) || [];
                mdLines.push(formatMemoSection(memo, treeId, evidence));
                mdLines.push('');
                mdLines.push('---');
                mdLines.push('');
            }

            // Events section
            if (include_events && events.length > 0) {
                if (events_format === 'md') {
                    mdLines.push(formatEventsTable(events));
                } else {
                    mdLines.push(formatEventsJsonl(events));
                }
            }

            const markdownContent = mdLines.join('\n');

            // Step 5: Send response
            if (format === 'zip') {
                // Zip support deferred - for now, return single md
                console.warn('[memo:export] Zip format requested but not implemented, falling back to md');
            }

            const filename = `memo-export-${treeId.slice(0, 8)}.md`;

            res
                .status(200)
                .set('Content-Type', 'text/markdown; charset=utf-8')
                .set('Content-Disposition', `attachment; filename="${filename}"`)
                .set('Cache-Control', 'no-store')
                .send(markdownContent);

            console.log(`[memo:export] Exported ${memos.length} memos, ${events.length} events for tree=${treeId}`);
        })
    );

    /**
     * POST /api/memo/:memo_id/export
     * 
     * Compatibility route for legacy callers that expect memo_id in URL path.
     * Looks up tree_id from memo, then delegates to main export handler.
     */
    router.post(
        '/:memo_id/export',
        wrapAsync(async (req, res) => {
            const memoId = req.params.memo_id;

            if (!memoId || typeof memoId !== 'string' || !memoId.startsWith('M_')) {
                throw new HttpError({ status: 400, code: 'invalid_memo_id', message: 'memo_id must be a valid memo ID (format: M_xxx)' });
            }

            console.log(`[memo:export:compat] Compatibility route called with memo_id=${memoId}`);

            // Look up tree_id from memo
            const { rows } = await pg.query(
                `SELECT tree_id FROM memos WHERE id = $1 LIMIT 1`,
                [memoId]
            );

            if (rows.length === 0) {
                throw new HttpError({ status: 404, code: 'memo_not_found', message: 'Memo not found' });
            }

            const treeId = rows[0].tree_id;

            // Auth check: tree must belong to current user
            const userId = await getAuthUserIdForRequest(req, pg);
            await assertTreeOwnership(pg, treeId, userId);

            // Merge params and delegate to the same export logic
            // For simplicity, we'll 307 redirect to the main endpoint
            // This preserves method and body
            const redirectUrl = `/api/memo/export`;

            // Instead of redirect, manually invoke the same logic inline
            // Merge body params
            const body = {
                ...(req.body || {}),
                tree_id: treeId,
                memo_id: memoId,
            };

            // Extract params
            const {
                scope_node_id,
                scope_type = 'tree',
                session_key,
                depth: depthRaw,
                format = 'md',
                include_events = true,
                events_format = 'jsonl',
            } = body;

            // Validate scope_node_id belongs to tree
            let scopeNodeId = null;
            if (scope_node_id && typeof scope_node_id === 'string') {
                scopeNodeId = scope_node_id.trim();
                if (!uuidValidate(scopeNodeId)) {
                    throw new HttpError({ status: 400, code: 'invalid_scope_node_id', message: 'scope_node_id must be a valid UUID' });
                }
                const { rows: nodeCheck } = await pg.query(
                    `SELECT 1 FROM nodes WHERE id = $1 AND tree_id = $2 LIMIT 1`,
                    [scopeNodeId, treeId]
                );
                if (nodeCheck.length === 0) {
                    throw new HttpError({ status: 400, code: 'scope_node_not_found', message: 'scope_node_id does not belong to this tree' });
                }
            }

            // Validate scope_type
            const validScopeTypes = ['tree', 'branch', 'session', 'since_memo'];
            const effectiveScopeType = validScopeTypes.includes(scope_type) ? scope_type : 'tree';
            if (effectiveScopeType === 'session' && (!session_key || typeof session_key !== 'string')) {
                throw new HttpError({ status: 400, code: 'invalid_session_key', message: 'session_key is required when scope_type=session' });
            }

            const depth = Math.max(1, Math.min(MAX_DEPTH, parseInt(depthRaw, 10) || DEFAULT_DEPTH));

            console.log(`[memo:export:compat] tree=${treeId} memo=${memoId} scope=${effectiveScopeType} depth=${depth}`);

            // Get memos (chain traversal)
            let memos = [];
            const visited = new Set();
            let currentId = memoId;

            while (currentId && memos.length < depth) {
                if (visited.has(currentId)) break;
                visited.add(currentId);

                const { rows: memoRows } = await pg.query(
                    `SELECT id, tree_id, scope_root_node_id, created_at, 
                            from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang
                     FROM memos WHERE id = $1 LIMIT 1`,
                    [currentId]
                );

                if (memoRows.length === 0) break;

                const row = memoRows[0];
                const memoJson = normalizeMemoJson(row.memo_json);

                memos.unshift({
                    memo_id: row.id,
                    created_at: row.created_at,
                    from_node_seq: row.from_node_seq,
                    to_node_seq: row.to_node_seq,
                    based_on_memo_id: row.based_on_memo_id,
                    lang: row.lang || memoJson.lang || 'zh',
                    bullets: memoJson.bullets || [],
                    keyframes: memoJson.keyframes || [],
                });

                currentId = row.based_on_memo_id;
            }

            // Check memo limit
            if (memos.length > MAX_MEMOS) {
                throw new HttpError({
                    status: 413,
                    code: 'export_too_large',
                    message: `Export exceeds limit: ${memos.length} memos (max ${MAX_MEMOS})`,
                    hint: 'Reduce depth or use more specific scope',
                });
            }

            // Get process events (if requested)
            let events = [];
            if (include_events) {
                const values = [treeId, MAX_EVENTS + 1];
                let whereClause = 'tree_id = $1';

                if (scopeNodeId) {
                    values.push(scopeNodeId);
                    whereClause += ` AND scope_node_id = $${values.length}`;
                }

                if (memos.length > 0) {
                    const startTime = memos[0].created_at;
                    const endTime = memos[memos.length - 1].created_at;
                    values.push(new Date(startTime).toISOString());
                    values.push(new Date(endTime).toISOString());
                    whereClause += ` AND created_at >= $${values.length - 1} AND created_at <= $${values.length}`;
                }

                const { rows: eventRows } = await pg.query(
                    `SELECT id, tree_id, scope_node_id, event_type, meta, created_at
                     FROM process_events
                     WHERE ${whereClause}
                     ORDER BY created_at ASC
                     LIMIT $2`,
                    values
                );

                events = eventRows;

                if (events.length > MAX_EVENTS) {
                    throw new HttpError({
                        status: 413,
                        code: 'export_too_large',
                        message: `Export exceeds limit: ${events.length} events (max ${MAX_EVENTS})`,
                        hint: 'Use more specific scope or time range',
                    });
                }
            }

            // Fetch evidence for memos
            const evidenceByMemo = new Map();
            try {
                const allNodeIds = [];
                for (const memo of memos) {
                    if (memo.keyframes) {
                        for (const kf of memo.keyframes) {
                            if (kf.node_id) allNodeIds.push(kf.node_id);
                        }
                    }
                }

                if (allNodeIds.length > 0) {
                    const { rows: evRows } = await pg.query(
                        `SELECT l.node_id, e.id, e.title, e.url
                         FROM node_evidence_links l
                         JOIN evidence e ON e.id = l.evidence_id
                         WHERE l.node_id = ANY($1)`,
                        [allNodeIds]
                    );

                    for (const ev of evRows) {
                        for (const memo of memos) {
                            const hasNode = memo.keyframes?.some(kf => kf.node_id === ev.node_id);
                            if (hasNode) {
                                if (!evidenceByMemo.has(memo.memo_id)) {
                                    evidenceByMemo.set(memo.memo_id, []);
                                }
                                evidenceByMemo.get(memo.memo_id).push(ev);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[memo:export:compat] Evidence lookup failed:', e.message);
            }

            // Build markdown output
            const mdLines = [];

            mdLines.push('# Memo Export');
            mdLines.push('');
            mdLines.push(`- **Tree ID**: ${treeId}`);
            mdLines.push(`- **Scope**: ${effectiveScopeType}${scopeNodeId ? ` / ${scopeNodeId}` : ' / Full tree'}`);
            mdLines.push(`- **Exported at**: ${new Date().toISOString()}`);
            mdLines.push(`- **Memo count**: ${memos.length}`);

            if (memos.length > 0) {
                const earliest = new Date(memos[0].created_at).toISOString();
                const latest = new Date(memos[memos.length - 1].created_at).toISOString();
                mdLines.push(`- **Time range**: ${earliest} → ${latest}`);
            }

            mdLines.push('');
            mdLines.push('---');
            mdLines.push('');

            mdLines.push('## Memos');
            mdLines.push('');

            for (const memo of memos) {
                const evidence = evidenceByMemo.get(memo.memo_id) || [];
                mdLines.push(formatMemoSection(memo, treeId, evidence));
                mdLines.push('');
                mdLines.push('---');
                mdLines.push('');
            }

            if (include_events && events.length > 0) {
                if (events_format === 'md') {
                    mdLines.push(formatEventsTable(events));
                } else {
                    mdLines.push(formatEventsJsonl(events));
                }
            }

            const markdownContent = mdLines.join('\n');
            const filename = `memo-export-${treeId.slice(0, 8)}.md`;

            res
                .status(200)
                .set('Content-Type', 'text/markdown; charset=utf-8')
                .set('Content-Disposition', `attachment; filename="${filename}"`)
                .set('Cache-Control', 'no-store')
                .send(markdownContent);

            console.log(`[memo:export:compat] Exported ${memos.length} memos, ${events.length} events for tree=${treeId} via compat route`);
        })
    );

    return router;
}
