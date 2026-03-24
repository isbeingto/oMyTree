/**
 * T61/T62: Session Memo Generation API
 * T71: Session scope support for activity-window-based memo generation
 * 
 * POST /api/memo/generate - Generate memo (supports incremental relay)
 * GET /api/memo/latest - Get latest memo with expiry status
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId, getTraceId } from '../lib/trace.js';
import {
    buildMemoMessages,
    buildIncrementalMemoMessages,
    parseMemoResponse,
    detectLanguage,
    verifyMemoIntegrity
} from '../services/memo/memo_prompt.js';
import { pickKeyframes, buildKeyframesFromPicked } from '../services/memo/keyframe_picker.js';
import { selectKeyframesV2, buildKeyframesFromV2, checkAnchorDrift, KEYFRAME_PICKER_VERSION, computeWeightsHash } from '../services/memo/keyframe_picker_v2.js';
import { resolveProviderForRequest } from '../services/llm/providers/index.js';
import { logProcessEvent } from '../lib/process_event.js';
import { writeMemoArtifact } from '../services/artifact_audit.js';

// T71: Session configuration (must match process.js)
const SESSION_GAP_MINUTES = parseInt(process.env.SESSION_GAP_MINUTES, 10) || 30;
const MAX_SESSION_EVENTS = parseInt(process.env.MAX_SESSION_EVENTS, 10) || 2000;

const DEFAULT_LIMIT_N = 20;
const MAX_LIMIT_N = 50;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const HISTORY_PREVIEW_MAX_LEN = 96;
let memoLangColumnCache = null;
let memoDeltaColumnCache = null;

/**
 * T71: Compute stable session key from tree_id + start + end
 */
function computeSessionKey(treeId, startAt, endAt) {
    const input = `${treeId}|${new Date(startAt).toISOString()}|${new Date(endAt).toISOString()}`;
    return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
}

/**
 * T71: Get session time window by session_key
 * Returns { start_at, end_at } or null if not found
 */
async function getSessionTimeWindow(pool, treeId, sessionKey, scopeNodeId = null) {
    // Fetch events and group into sessions (same logic as process.js)
    const values = [treeId, MAX_SESSION_EVENTS];
    let whereClause = 'tree_id = $1';
    if (scopeNodeId) {
        values.push(scopeNodeId);
        whereClause += ` AND scope_node_id = $${values.length}`;
    }

    const { rows: events } = await pool.query(
        `SELECT id, tree_id, scope_node_id, event_type, meta, created_at
         FROM process_events
         WHERE ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        values
    );

    if (events.length === 0) return null;

    const gapMs = SESSION_GAP_MINUTES * 60 * 1000;
    const sessions = [];
    let currentEvents = [events[0]];

    for (let i = 1; i < events.length; i++) {
        const prevTime = new Date(events[i - 1].created_at).getTime();
        const currTime = new Date(events[i].created_at).getTime();
        const gap = prevTime - currTime;

        if (gap >= gapMs) {
            // Finalize session
            const startAt = currentEvents[currentEvents.length - 1].created_at;
            const endAt = currentEvents[0].created_at;
            sessions.push({
                session_key: computeSessionKey(treeId, startAt, endAt),
                start_at: new Date(startAt).toISOString(),
                end_at: new Date(endAt).toISOString(),
            });
            currentEvents = [events[i]];
        } else {
            currentEvents.push(events[i]);
        }
    }

    // Finalize last session
    if (currentEvents.length > 0) {
        const startAt = currentEvents[currentEvents.length - 1].created_at;
        const endAt = currentEvents[0].created_at;
        sessions.push({
            session_key: computeSessionKey(treeId, startAt, endAt),
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
        });
    }

    // Find matching session
    if (sessionKey === 'last') {
        return sessions.length > 0 ? sessions[0] : null;
    }
    return sessions.find(s => s.session_key === sessionKey) || null;
}

async function ensureMemosSchema(pool) {
    const { rows: existsRows } = await pool.query(
        `SELECT to_regclass('public.memos') AS memos_regclass;`
    );
    const exists = Boolean(existsRows?.[0]?.memos_regclass);
    if (!exists) {
        throw new HttpError({
            status: 500,
            code: 'memos_table_missing',
            message: 'Memo persistence is not initialized',
            hint: 'Run api/db/migrations/20251220_t62_memos.sql with a privileged DB role to create the memos table and grant access.'
        });
    }

    const { rows: privRows } = await pool.query(
        `SELECT
  has_table_privilege(current_user, 'public.memos', 'SELECT') AS can_select,
  has_table_privilege(current_user, 'public.memos', 'INSERT') AS can_insert;`
    );
    const canSelect = Boolean(privRows?.[0]?.can_select);
    const canInsert = Boolean(privRows?.[0]?.can_insert);
    if (!canSelect || !canInsert) {
        throw new HttpError({
            status: 500,
            code: 'memos_permission_denied',
            message: 'Memo persistence is not accessible',
            hint: 'Grant SELECT/INSERT on public.memos to the API DB user (see api/db/migrations/20251220_t62_memos.sql).'
        });
    }
}

async function hasMemoLangColumn(pool) {
    if (memoLangColumnCache !== null) {
        return memoLangColumnCache;
    }

    const { rows } = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'memos'
           AND column_name = 'lang'
         LIMIT 1`
    );

    memoLangColumnCache = rows.length > 0;
    return memoLangColumnCache;
}

async function hasMemoDeltaColumn(pool) {
    if (memoDeltaColumnCache !== null) {
        return memoDeltaColumnCache;
    }

    const { rows } = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'memos'
           AND column_name = 'delta_nodes_count'
         LIMIT 1`
    );

    memoDeltaColumnCache = rows.length > 0;
    return memoDeltaColumnCache;
}

function normalizeMemoJson(memoJson) {
    if (!memoJson) return {};
    if (typeof memoJson === 'string') {
        try {
            return JSON.parse(memoJson);
        } catch (err) {
            return {};
        }
    }
    if (typeof memoJson === 'object') {
        return memoJson;
    }
    return {};
}

function buildBulletPreview(memoJson) {
    const normalized = normalizeMemoJson(memoJson);
    const bullets = Array.isArray(normalized?.bullets) ? normalized.bullets : [];
    const firstText = typeof bullets[0]?.text === 'string' ? bullets[0].text.trim() : '';
    if (!firstText) return '';
    if (firstText.length <= HISTORY_PREVIEW_MAX_LEN) return firstText;
    return `${firstText.slice(0, HISTORY_PREVIEW_MAX_LEN - 3)}...`;
}

export default function createMemoGenerateRouter() {
    const router = express.Router();

    /**
     * GET /api/memo/latest
     * Get latest memo for a tree with expiry status
     */
    router.get(
        '/api/memo/latest',
        wrapAsync(async (req, res) => {
            const { tree_id } = req.query;

            if (!tree_id) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }

            const { pool } = await import('../db/pool.js');

            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);
            const langSelect = hasLangColumn ? 'lang' : 'NULL::text AS lang';

            // Get latest memo (T67: include lang column)
            const { rows: memoRows } = await pool.query(
                `SELECT id, tree_id, scope_root_node_id, created_at, 
                from_node_seq, to_node_seq, memo_json, based_on_memo_id, ${langSelect}
         FROM memos 
         WHERE tree_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
                [tree_id]
            );

            // Get current tree state (strict scope: total user nodes)
            const { rows: treeState } = await pool.query(
                `SELECT COUNT(*) as count FROM nodes 
         WHERE tree_id = $1 
         AND role = 'user'`,
                [tree_id]
            );
            const currentMaxNodeSeq = parseInt(treeState[0]?.count || '0', 10);

            if (memoRows.length === 0) {
                return res.status(200).json(withTraceId(res, {
                    ok: true,
                    latest_memo: null,
                    meta: {
                        current_max_node_seq: currentMaxNodeSeq,
                        memo_to_node_seq: 0,
                        is_outdated: currentMaxNodeSeq > 0
                    }
                }));
            }

            const latestMemo = memoRows[0];
            const memoToNodeSeq = latestMemo.to_node_seq;

            // Strict outdate check: memo coverage differs from current tree state
            // Logic: T83 - flag both growth and shrink scenarios
            const isOutdated = currentMaxNodeSeq !== memoToNodeSeq;

            res.status(200).json(withTraceId(res, {
                ok: true,
                latest_memo: {
                    memo_id: latestMemo.id,
                    created_at: latestMemo.created_at,
                    scope: {
                        type: 'branch', // Legacy fallback, but we are enforcing tree-wide seq
                        root_node_id: latestMemo.scope_root_node_id,
                    },
                    bullets: latestMemo.memo_json?.bullets || [],
                    coverage: latestMemo.memo_json?.coverage || { node_count: 0 },
                    lang: latestMemo.lang || 'zh', // T67: Expose language
                },
                meta: {
                    current_max_node_seq: currentMaxNodeSeq,
                    memo_to_node_seq: memoToNodeSeq,
                    is_outdated: isOutdated
                },
                // Deprecated top-level fields for backward compat (shim) if needed,
                // but T66 plan implies moving to meta. We'll keep them for safety but client uses meta.
                delta_count: currentMaxNodeSeq - memoToNodeSeq,
                is_expired: isOutdated,
            }));
        })
    );

    /**
     * GET /api/memo/history
     * List recent memo checkpoints
     */
    router.get(
        '/api/memo/history',
        wrapAsync(async (req, res) => {
            const { tree_id: treeIdRaw, scope_node_id: scopeNodeIdRaw, limit: limitRaw } = req.query;
            const treeId = typeof treeIdRaw === 'string' ? treeIdRaw.trim() : '';
            const scopeNodeId = typeof scopeNodeIdRaw === 'string' ? scopeNodeIdRaw.trim() : '';

            if (!treeId) {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }

            const limit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, parseInt(limitRaw, 10) || DEFAULT_HISTORY_LIMIT));
            const { pool } = await import('../db/pool.js');

            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);
            const langSelect = hasLangColumn ? 'lang' : 'NULL::text AS lang';

            const values = [treeId];
            let whereClause = 'tree_id = $1';
            if (scopeNodeId) {
                values.push(scopeNodeId);
                whereClause += ` AND scope_root_node_id = $${values.length}`;
            }
            values.push(limit);

            const { rows: memoRows } = await pool.query(
                `SELECT id, created_at, to_node_seq, memo_json, ${langSelect}
                 FROM memos
                 WHERE ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT $${values.length}`,
                values
            );

            const { rows: treeState } = await pool.query(
                `SELECT COUNT(*) as count FROM nodes 
                 WHERE tree_id = $1 
                 AND role = 'user'`,
                [treeId]
            );
            const currentMaxNodeSeq = parseInt(treeState[0]?.count || '0', 10);

            const history = memoRows.map((row) => {
                const preview = buildBulletPreview(row.memo_json);
                const memoJson = normalizeMemoJson(row.memo_json);
                const resolvedLang = row.lang || memoJson.lang || 'zh';
                return {
                    memo_id: row.id,
                    created_at: row.created_at,
                    lang: resolvedLang,
                    to_node_seq: row.to_node_seq,
                    title: preview,
                    first_bullet_preview: preview,
                };
            });

            res.status(200).json(withTraceId(res, {
                ok: true,
                history,
                meta: {
                    current_max_node_seq: currentMaxNodeSeq,
                },
            }));
        })
    );

    /**
     * POST /api/memo/generate
     * 
     * Request body:
     * {
     *   tree_id: string (required)
     *   focus_node_id?: string (optional, defaults to most recent node)
     *   limit_n?: number (optional, defaults to 20)
     *   based_on_memo_id?: string (optional, for incremental relay)
     *   provider?: string (optional, LLM provider hint)
     *   model?: string (optional, LLM model)
     *   lang?: 'auto' | 'en' | 'zh' (optional)
     *   scope_type?: 'since_memo' | 'last_session' | 'session' (T71, optional)
     *   session_key?: string (T71, required when scope_type='session')
     * }
     */
    router.post(
        '/api/memo/generate',
        wrapAsync(async (req, res) => {
            const {
                tree_id,
                focus_node_id,
                limit_n: limitNRaw,
                based_on_memo_id,
                provider: providerHint,
                model,
                lang: langParam, // T67: 'auto' | 'en' | 'zh'
                scope_type: scopeType, // T71: 'since_memo' | 'last_session' | 'session'
                session_key: sessionKey, // T71: required when scope_type='session'
                dry_run: dryRunParam, // T72: Return keyframes without DB write
                link_to_previous: linkToPreviousParam, // T73: Only link to previous memo if explicitly true
            } = req.body || {};
            const userId = req.session?.user?.id || req.user?.id || null;
            const isDryRun = dryRunParam === true || dryRunParam === 1 || dryRunParam === '1';
            // T73: Generate is standalone by default; only link if explicitly requested
            const linkToPrevious = linkToPreviousParam === true || linkToPreviousParam === 1 || linkToPreviousParam === '1';

            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }

            const limitN = Math.min(Math.max(parseInt(limitNRaw, 10) || DEFAULT_LIMIT_N, 3), MAX_LIMIT_N);
            const traceId = getTraceId(req);
            const isIncremental = Boolean(based_on_memo_id);

            // T75/T79: Debug injection for grounding guardrail testing
            // Supports: query ?force_bad_anchor=1, ?debug_force_bad_anchor=1, header x-debug-force-bad-anchor: 1
            // Enabled when: NODE_ENV=test, ALLOW_DEBUG=1, or NODE_ENV !== 'production'
            const allowDebugHooks = process.env.NODE_ENV === 'test'
                || process.env.ALLOW_DEBUG === '1'
                || process.env.NODE_ENV !== 'production';
            const forceBadAnchor = allowDebugHooks && (
                req.query.force_bad_anchor === '1'
                || req.query.debug_force_bad_anchor === '1'
                || req.headers['x-debug-force-bad-anchor'] === '1'
            );

            // T71: Validate scope_type
            const validScopeTypes = ['since_memo', 'last_session', 'session'];
            const effectiveScopeType = validScopeTypes.includes(scopeType) ? scopeType : 'since_memo';
            if (effectiveScopeType === 'session' && (!sessionKey || typeof sessionKey !== 'string')) {
                throw new HttpError({ status: 400, code: 'invalid_session_key', message: 'session_key is required when scope_type=session' });
            }

            console.log(`[memo:generate] tree=${tree_id} focus=${focus_node_id || 'auto'} limit=${limitN} incremental=${isIncremental} scope=${effectiveScopeType} trace=${traceId}`);

            const { pool } = await import('../db/pool.js');

            // Ensure persistence table exists (safe no-op if already migrated)
            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);

            // Step 0: If incremental, fetch previous memo
            let previousMemo = null;
            if (based_on_memo_id) {
                const { rows: prevRows } = await pool.query(
                    `SELECT id, memo_json, created_at, to_node_seq FROM memos WHERE id = $1`,
                    [based_on_memo_id]
                );
                if (prevRows.length > 0) {
                    previousMemo = prevRows[0];
                }
            }

            // Step 1: Get latest node if focus not specified
            let focusNodeId = focus_node_id;
            if (!focusNodeId) {
                const { rows: latestRows } = await pool.query(
                    `SELECT id FROM nodes WHERE tree_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [tree_id]
                );
                if (latestRows.length === 0) {
                    throw new HttpError({ status: 404, code: 'tree_empty', message: 'No nodes found in tree' });
                }
                focusNodeId = latestRows[0].id;
            }

            // Step 2: Get branch path from focus node to root
            const { rows: branchNodes } = await pool.query(
                `WITH RECURSIVE path AS (
           SELECT id, parent_id, role, text, created_at, 1 as depth
           FROM nodes WHERE id = $1 AND tree_id = $2
           UNION ALL
           SELECT n.id, n.parent_id, n.role, n.text, n.created_at, p.depth + 1
           FROM nodes n
           INNER JOIN path p ON n.id = p.parent_id
           WHERE n.tree_id = $2 AND p.depth < $3
         )
         SELECT id, parent_id, role, text, created_at, depth
         FROM path ORDER BY depth DESC`,
                [focusNodeId, tree_id, limitN]
            );

            if (branchNodes.length === 0) {
                throw new HttpError({ status: 404, code: 'node_not_found', message: 'Focus node not found' });
            }

            const branchRootId = branchNodes[0].id;

            // T71: Apply session scope filtering
            let scopeFilteredNodes = branchNodes;
            let sessionWindow = null;
            if (effectiveScopeType === 'last_session' || effectiveScopeType === 'session') {
                const lookupKey = effectiveScopeType === 'last_session' ? 'last' : sessionKey;
                sessionWindow = await getSessionTimeWindow(pool, tree_id, lookupKey, focus_node_id);
                if (sessionWindow) {
                    const startAt = new Date(sessionWindow.start_at);
                    const endAt = new Date(sessionWindow.end_at);
                    scopeFilteredNodes = branchNodes.filter(n => {
                        const nodeTime = new Date(n.created_at);
                        return nodeTime >= startAt && nodeTime <= endAt;
                    });
                    console.log(`[memo:generate] Session scope ${lookupKey}: ${scopeFilteredNodes.length}/${branchNodes.length} nodes in window ${sessionWindow.start_at} - ${sessionWindow.end_at}`);
                } else {
                    console.log(`[memo:generate] Session scope ${lookupKey} not found, falling back to full branch`);
                }
            }

            // T63: Fetch evidence for heuristic keyframe picking
            let evidenceNodeIds = new Set();
            try {
                // Current schema uses node_evidence_links to attach evidence to nodes
                const { rows: evRows } = await pool.query(
                    `SELECT DISTINCT l.node_id
                                         FROM node_evidence_links l
                                         JOIN nodes n ON n.id = l.node_id
                                         WHERE n.tree_id = $1
                                             AND l.node_id IS NOT NULL`,
                    [tree_id]
                );
                evidenceNodeIds = new Set(evRows.map(r => r.node_id));
            } catch (e) {
                // Non-fatal: proceed without evidence signals
                console.warn('[memo:generate] Failed to fetch evidence:', e.message);
            }

            // Step 3: Build keyframes using v2 picker; T71: use scopeFilteredNodes
            // T72: Use selectKeyframesV2 for deterministic, explainable selection
            let keyframesResult;
            let keyframes;
            let keyframesMeta;
            let validNodeIds;
            let messages;

            // T67: Resolve language first (needed for keyword matching)
            const uiLang = req.session?.user?.preferred_language === 'en' ? 'en' : 'zh';
            let resolvedLang;
            if (langParam === 'en' || langParam === 'zh') {
                resolvedLang = langParam;
            } else {
                // Will refine after keyframes if auto
                resolvedLang = uiLang;
            }

            if (isIncremental && previousMemo) {
                // Get nodes created after previous memo, intersected with session window if active
                const deltaNodes = scopeFilteredNodes.filter(n =>
                    new Date(n.created_at) > new Date(previousMemo.created_at)
                );
                // T72: Use v2 picker for delta nodes
                keyframesResult = selectKeyframesV2(deltaNodes, {
                    evidenceNodeIds,
                    lang: resolvedLang,
                    k: 8,
                });
                keyframesMeta = keyframesResult.keyframes;
                keyframes = buildKeyframesFromV2(keyframesMeta, deltaNodes);
                validNodeIds = keyframes.map(kf => kf.node_id);

                // Refine language detection from actual keyframes if auto
                if (langParam !== 'en' && langParam !== 'zh') {
                    resolvedLang = detectLanguage(keyframes, uiLang);
                }

                console.log(`[memo:generate] Incremental mode (v2): ${keyframesMeta.length} keyframes from ${deltaNodes.length} delta nodes`);
            } else {
                // T72: Full generation with v2 keyframe picker; T71: use scopeFilteredNodes
                keyframesResult = selectKeyframesV2(scopeFilteredNodes, {
                    evidenceNodeIds,
                    lang: resolvedLang,
                    k: 8,
                });
                keyframesMeta = keyframesResult.keyframes;
                keyframes = buildKeyframesFromV2(keyframesMeta, scopeFilteredNodes);
                validNodeIds = keyframes.map(kf => kf.node_id);

                // Refine language detection from actual keyframes if auto
                if (langParam !== 'en' && langParam !== 'zh') {
                    resolvedLang = detectLanguage(keyframes, uiLang);
                }

                console.log(`[memo:generate] Full mode (v2): ${keyframesMeta.length} keyframes from ${scopeFilteredNodes.length} nodes`);
            }

            console.log(`[memo:generate] Language: requested=${langParam || 'auto'} resolved=${resolvedLang}`);

            // T72: Dry run mode - return keyframes without LLM call or DB write
            if (isDryRun) {
                return res.status(200).json(withTraceId(res, {
                    ok: true,
                    dry_run: true,
                    keyframes: keyframesMeta,
                    keyframe_picker_version: keyframesResult.keyframe_picker_version,
                    weights_hash: keyframesResult.weights_hash,
                    coverage: {
                        from_node_seq: 0,
                        to_node_seq: branchNodes.length,
                        delta_nodes_count: isIncremental ? keyframes.length : null,
                    },
                    lang: resolvedLang,
                }));
            }

            // Build messages with resolved language
            if (isIncremental && previousMemo) {
                const previousBullets = previousMemo.memo_json?.bullets || [];
                messages = buildIncrementalMemoMessages(previousBullets, keyframes, resolvedLang);
            } else {
                messages = buildMemoMessages(keyframes, resolvedLang);
            }

            // Handle case when no keyframes (for non-incremental, this is an error)
            if (!isIncremental && keyframes.length === 0) {
                throw new HttpError({ status: 400, code: 'no_content', message: 'No conversation content to summarize' });
            }

            // Step 4: Call LLM
            const { provider, defaultModel } = await resolveProviderForRequest({
                providerHint,
                userId,
            });

            const startTime = Date.now();
            let llmResult;
            try {
                llmResult = await provider.callChat({
                    messages,
                    options: {
                        model: model || defaultModel,
                        temperature: 0.3,
                        mode: 'memo',
                    },
                });
            } catch (err) {
                console.error('[memo:generate] LLM call failed:', err.message);
                throw new HttpError({ status: 502, code: 'llm_failed', message: 'Failed to generate memo' });
            }

            console.log(`[memo:generate] LLM responded in ${Date.now() - startTime}ms`);

            // Step 5: Parse response
            let parsed;
            const responseText = llmResult.ai_text || llmResult.text || '';

            // For incremental with delta=0, allow fallback anchor
            const fallbackNodeId = validNodeIds.length > 0 ? validNodeIds[validNodeIds.length - 1] : branchNodes[branchNodes.length - 1]?.id;
            const allValidIds = validNodeIds.length > 0 ? validNodeIds : [fallbackNodeId].filter(Boolean);

            try {
                if (llmResult.parsed_json) {
                    parsed = parseMemoResponse(llmResult.parsed_json, allValidIds);
                } else {
                    parsed = parseMemoResponse(responseText, allValidIds);
                }
            } catch (parseErr) {
                console.error('[memo:generate] Parse failed:', parseErr.message);
                throw new HttpError({ status: 500, code: 'memo_parse_failed', message: 'Failed to parse memo response' });
            }

            // T75: Inject bad anchor for testing grounding guardrails
            if (forceBadAnchor && parsed.bullets.length > 0) {
                console.warn('[memo:generate] T75 TEST: Injecting bad anchor for grounding test');
                parsed.bullets[0].anchors = [{ type: 'node', id: 'NONEXISTENT_TEST_NODE_ID' }];
            }

            // T75: Verify memo integrity before persist - validate anchors exist in scope
            const nodeMap = new Map(scopeFilteredNodes.map(n => [n.id, { id: n.id, created_at: n.created_at }]));
            const integrity = verifyMemoIntegrity(parsed.bullets, allValidIds, nodeMap);

            if (!integrity.ok) {
                console.warn(`[memo:generate] T75 Integrity: ${integrity.affected_count} bullets affected, ${integrity.bad_refs.length} bad refs: ${integrity.bad_refs.slice(0, 5).join(', ')}`);
            }

            // Step 6: Build memo object (T72: include keyframes metadata, T75: use verified bullets)
            const memoId = `M_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
            const createdAt = new Date();
            const memo = {
                memo_id: memoId,
                created_at: createdAt.toISOString(),
                scope: { type: 'branch', root_node_id: branchRootId },
                bullets: integrity.bullets, // T75: bullets with verified status
                // T72: Enhanced coverage with sequence range
                coverage: {
                    from_node_seq: 0,
                    to_node_seq: branchNodes.length,
                    delta_nodes_count: isIncremental ? keyframes.length : null,
                },
                // T75: Integrity result
                integrity: { ok: integrity.ok, bad_refs: integrity.bad_refs, affected_count: integrity.affected_count },
                // T72: Keyframes metadata for explainability
                keyframes: keyframesMeta,
                keyframe_picker_version: keyframesResult.keyframe_picker_version,
                weights_hash: keyframesResult.weights_hash,
                // T73: Generate is standalone unless link_to_previous=true
                based_on_memo_id: linkToPrevious ? (based_on_memo_id || null) : null,
                lang: resolvedLang, // T67: Resolved language
            };

            // Step 7: Persist to database (T67: lang, T72: keyframes, T75: integrity + verified bullets)
            const memoJsonData = {
                bullets: integrity.bullets, // T75: bullets with verified/repairs
                coverage: memo.coverage,
                integrity: memo.integrity, // T75: integrity persisted
                keyframes: keyframesMeta,
                keyframe_picker_version: keyframesResult.keyframe_picker_version,
                weights_hash: keyframesResult.weights_hash,
                lang: resolvedLang,
            };
            try {
                if (hasLangColumn) {
                    await pool.query(
                        `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            memoId,
                            tree_id,
                            branchRootId,
                            createdAt,
                            0, // from_node_seq
                            branchNodes.length, // to_node_seq
                            JSON.stringify(memoJsonData),
                            linkToPrevious ? (based_on_memo_id || null) : null, // T73: standalone by default
                            resolvedLang, // T67: lang column
                        ]
                    );
                } else {
                    await pool.query(
                        `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            memoId,
                            tree_id,
                            branchRootId,
                            createdAt,
                            0, // from_node_seq
                            branchNodes.length, // to_node_seq
                            JSON.stringify(memoJsonData),
                            linkToPrevious ? (based_on_memo_id || null) : null, // T73: standalone by default
                        ]
                    );
                }
                console.log(`[memo:generate] Persisted memo ${memoId}`);

                // P1-3: Write auditable artifact version (fail-open)
                writeMemoArtifact(pool, {
                    tree_id,
                    memo_id: memoId,
                    created_by: userId,
                    provider: providerHint || null,
                    model: model || null,
                    prompt_version: 'memo_v1_bullets',
                    memo_json: memoJsonData,
                    keyframe_ids: keyframesMeta.map(k => k.node_id),
                    node_ids: branchNodes.map(n => n.id),
                    based_on_memo_id: linkToPrevious ? (based_on_memo_id || null) : null,
                    scope_node_id: branchRootId,
                    lang: resolvedLang,
                }).catch(() => {}); // fail-open

                // T70: Log memo_generated process event (fail-open)
                const eventType = isIncremental ? 'memo_updated' : 'memo_generated';
                logProcessEvent(pool, {
                    tree_id,
                    scope_node_id: focusNodeId, // Node selected at memo generation time
                    event_type: eventType,
                    meta: {
                        actor: 'system',
                        source: 'api',
                        memo_id: memoId,
                        node_id: focusNodeId,
                        based_on_memo_id: based_on_memo_id || null,
                    },
                }).catch(() => { }); // fail-open
            } catch (dbErr) {
                // Log but don't fail - memo generation succeeded, persistence is secondary
                console.error('[memo:generate] Failed to persist memo:', dbErr.message);
            }

            console.log(`[memo:generate] Generated memo ${memoId} with ${memo.bullets.length} bullets`);

            res.status(200).json(withTraceId(res, { ok: true, memo }));
        })
    );

    /**
     * GET /api/memo/:memo_id
     * Fetch memo by id
     */
    router.get(
        '/api/memo/:memo_id',
        wrapAsync(async (req, res) => {
            const memoIdRaw = req.params.memo_id;
            const memoId = typeof memoIdRaw === 'string' ? memoIdRaw.trim() : '';

            if (!memoId) {
                throw new HttpError({ status: 400, code: 'invalid_memo_id', message: 'memo_id is required' });
            }

            const { pool } = await import('../db/pool.js');

            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);
            const langSelect = hasLangColumn ? 'lang' : 'NULL::text AS lang';

            const { rows: memoRows } = await pool.query(
                `SELECT id, tree_id, scope_root_node_id, created_at,
                        from_node_seq, to_node_seq, memo_json, based_on_memo_id, ${langSelect}
                 FROM memos
                 WHERE id = $1
                 LIMIT 1`,
                [memoId]
            );

            if (memoRows.length === 0) {
                throw new HttpError({ status: 404, code: 'memo_not_found', message: `memo ${memoId} not found` });
            }

            const memoRow = memoRows[0];
            const memoJson = normalizeMemoJson(memoRow.memo_json);
            const bullets = Array.isArray(memoJson?.bullets) ? memoJson.bullets : [];
            const coverage = memoJson?.coverage || { node_count: 0 };
            const resolvedLang = memoRow.lang || memoJson.lang || 'zh';

            const memo = {
                memo_id: memoRow.id,
                created_at: memoRow.created_at,
                scope: {
                    type: 'branch',
                    root_node_id: memoRow.scope_root_node_id,
                },
                bullets,
                coverage,
                based_on_memo_id: memoRow.based_on_memo_id || null,
                lang: resolvedLang,
            };

            res.status(200).json(withTraceId(res, { ok: true, memo }));
        })
    );

    /**
     * POST /api/memo/update
     * T69: Incremental Memo Update (Rolling Baton)
     * 
     * Request body:
     * {
     *   tree_id: string (required)
     *   focus_node_id?: string (optional, defaults to most recent node)
     *   lang?: 'auto' | 'en' | 'zh' (optional)
     * }
     * 
     * Behavior:
     * - Finds latest memo for tree
     * - Computes delta: (memo.to_node_seq, current_max_node_seq]
     * - If delta is empty: returns { ok: true, unchanged: true, memo: latest_memo }
     * - Otherwise generates new memo with:
     *   - based_on_memo_id = latest_memo.id
     *   - from_node_seq = latest_memo.to_node_seq
     *   - to_node_seq = current node count
     *   - delta_nodes_count = number of delta nodes processed
     */
    router.post(
        '/api/memo/update',
        wrapAsync(async (req, res) => {
            const {
                tree_id,
                focus_node_id,
                lang: langParam,
                provider: providerHint,
            } = req.body || {};
            const userId = req.session?.user?.id || req.user?.id || null;

            if (!tree_id || typeof tree_id !== 'string') {
                throw new HttpError({ status: 400, code: 'invalid_tree_id', message: 'tree_id is required' });
            }

            const traceId = getTraceId(req);
            console.log(`[memo:update] tree=${tree_id} lang=${langParam || 'auto'} trace=${traceId}`);

            const { pool } = await import('../db/pool.js');

            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);
            const hasDeltaColumn = await hasMemoDeltaColumn(pool);
            const langSelect = hasLangColumn ? 'lang' : 'NULL::text AS lang';

            // Step 1: Get latest memo
            const { rows: memoRows } = await pool.query(
                `SELECT id, tree_id, scope_root_node_id, created_at,
                        from_node_seq, to_node_seq, memo_json, based_on_memo_id, ${langSelect}
                 FROM memos
                 WHERE tree_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [tree_id]
            );

            // If no previous memo exists, delegate to generate endpoint behavior
            if (memoRows.length === 0) {
                throw new HttpError({
                    status: 400,
                    code: 'no_memo_to_update',
                    message: 'No existing memo found. Use POST /api/memo/generate first.',
                    hint: 'Call generate endpoint to create the initial memo'
                });
            }

            const latestMemo = memoRows[0];
            const previousMemoId = latestMemo.id;
            const previousToNodeSeq = latestMemo.to_node_seq;
            const previousMemoJson = normalizeMemoJson(latestMemo.memo_json);
            const previousBullets = Array.isArray(previousMemoJson?.bullets) ? previousMemoJson.bullets : [];
            const previousLang = latestMemo.lang || previousMemoJson.lang || 'zh';

            // Step 2: Get current tree node count (user nodes)
            const { rows: treeState } = await pool.query(
                `SELECT COUNT(*) as count FROM nodes 
                 WHERE tree_id = $1 
                 AND role = 'user'`,
                [tree_id]
            );
            const currentMaxNodeSeq = parseInt(treeState[0]?.count || '0', 10);

            // Step 3: Check if delta is empty or tree has shrunk
            // T83: Handle node reduction (deletion/rollback) by creating a sync memo
            if (currentMaxNodeSeq < previousToNodeSeq) {
                // Tree has shrunk - create a new memo to record current state
                console.log(`[memo:update] Tree shrunk. current=${currentMaxNodeSeq} previous=${previousToNodeSeq}. Creating sync memo.`);

                const hasDeltaColumn = await hasMemoDeltaColumn(pool);
                const memoId = `M_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
                const createdAt = new Date();
                const scopeRootNodeId = latestMemo.scope_root_node_id;
                
                // Create sync memo with same content but updated coverage
                const memoJsonForDb = {
                    bullets: previousBullets,
                    coverage: { 
                        node_count: currentMaxNodeSeq, 
                        delta_count: 0,
                        sync_reason: 'tree_shrunk'
                    },
                    lang: previousLang,
                };

                try {
                    if (hasLangColumn && hasDeltaColumn) {
                        await pool.query(
                            `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang, delta_nodes_count)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                            [memoId, tree_id, scopeRootNodeId, createdAt, previousToNodeSeq, currentMaxNodeSeq, JSON.stringify(memoJsonForDb), previousMemoId, previousLang, 0]
                        );
                    } else if (hasLangColumn) {
                        await pool.query(
                            `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [memoId, tree_id, scopeRootNodeId, createdAt, previousToNodeSeq, currentMaxNodeSeq, JSON.stringify(memoJsonForDb), previousMemoId, previousLang]
                        );
                    } else {
                        await pool.query(
                            `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [memoId, tree_id, scopeRootNodeId, createdAt, previousToNodeSeq, currentMaxNodeSeq, JSON.stringify(memoJsonForDb), previousMemoId]
                        );
                    }
                    console.log(`[memo:update] Persisted sync memo ${memoId} (based_on=${previousMemoId}, synced to ${currentMaxNodeSeq})`);

                    // P1-3: Write auditable artifact version for sync memo (fail-open)
                    writeMemoArtifact(pool, {
                        tree_id,
                        memo_id: memoId,
                        created_by: userId,
                        provider: null,
                        model: null,
                        prompt_version: 'memo_sync_v1',
                        memo_json: memoJsonForDb,
                        keyframe_ids: [],
                        node_ids: [],
                        based_on_memo_id: previousMemoId,
                        scope_node_id: scopeRootNodeId,
                        lang: previousLang,
                    }).catch(() => {}); // fail-open
                } catch (dbErr) {
                    console.error('[memo:update] DB insert failed:', dbErr.message);
                    throw new HttpError({ status: 500, code: 'memo_persist_failed', message: 'Failed to persist sync memo' });
                }

                const memo = {
                    memo_id: memoId,
                    created_at: createdAt.toISOString(),
                    scope: { type: 'branch', root_node_id: scopeRootNodeId },
                    bullets: previousBullets,
                    coverage: { node_count: currentMaxNodeSeq, delta_count: 0 },
                    based_on_memo_id: previousMemoId,
                    lang: previousLang,
                };

                return res.status(200).json(withTraceId(res, {
                    ok: true,
                    synced: true,  // Flag to indicate this was a sync operation
                    memo,
                    meta: {
                        current_max_node_seq: currentMaxNodeSeq,
                        memo_to_node_seq: currentMaxNodeSeq,  // Now synced
                        delta_nodes_count: 0,
                    }
                }));
            }
            
            // No changes case: current == previous
            if (currentMaxNodeSeq === previousToNodeSeq) {
                console.log(`[memo:update] No changes. current=${currentMaxNodeSeq} previous=${previousToNodeSeq}`);

                // Return unchanged with existing memo
                const memo = {
                    memo_id: latestMemo.id,
                    created_at: latestMemo.created_at,
                    scope: {
                        type: 'branch',
                        root_node_id: latestMemo.scope_root_node_id,
                    },
                    bullets: previousBullets,
                    coverage: previousMemoJson?.coverage || { node_count: previousToNodeSeq },
                    based_on_memo_id: latestMemo.based_on_memo_id || null,
                    lang: previousLang,
                };

                return res.status(200).json(withTraceId(res, {
                    ok: true,
                    unchanged: true,
                    memo,
                    meta: {
                        current_max_node_seq: currentMaxNodeSeq,
                        memo_to_node_seq: previousToNodeSeq,
                        delta_nodes_count: 0,
                    }
                }));
            }

            // Step 4: Get focus node if not specified
            let focusNodeId = focus_node_id;
            if (!focusNodeId) {
                const { rows: latestRows } = await pool.query(
                    `SELECT id FROM nodes WHERE tree_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [tree_id]
                );
                if (latestRows.length === 0) {
                    throw new HttpError({ status: 404, code: 'tree_empty', message: 'No nodes found in tree' });
                }
                focusNodeId = latestRows[0].id;
            }

            // Step 5: Get all branch nodes from focus to root
            const { rows: branchNodes } = await pool.query(
                `WITH RECURSIVE path AS (
                   SELECT id, parent_id, role, text, created_at, 1 as depth
                   FROM nodes WHERE id = $1 AND tree_id = $2
                   UNION ALL
                   SELECT n.id, n.parent_id, n.role, n.text, n.created_at, p.depth + 1
                   FROM nodes n
                   INNER JOIN path p ON n.id = p.parent_id
                   WHERE n.tree_id = $2 AND p.depth < 100
                 )
                 SELECT id, parent_id, role, text, created_at, depth
                 FROM path ORDER BY depth DESC`,
                [focusNodeId, tree_id]
            );

            if (branchNodes.length === 0) {
                throw new HttpError({ status: 404, code: 'node_not_found', message: 'Focus node not found' });
            }

            const branchRootId = branchNodes[0].id;

            // Step 6: Filter to delta nodes (created after previous memo)
            const deltaNodes = branchNodes.filter(n =>
                new Date(n.created_at) > new Date(latestMemo.created_at)
            );

            console.log(`[memo:update] Delta: ${deltaNodes.length} nodes after memo ${previousMemoId}`);

            // If no delta nodes in the branch path (edge case: nodes added in other branches)
            if (deltaNodes.length === 0) {
                // Still no progress on this branch
                const memo = {
                    memo_id: latestMemo.id,
                    created_at: latestMemo.created_at,
                    scope: {
                        type: 'branch',
                        root_node_id: latestMemo.scope_root_node_id,
                    },
                    bullets: previousBullets,
                    coverage: previousMemoJson?.coverage || { node_count: previousToNodeSeq },
                    based_on_memo_id: latestMemo.based_on_memo_id || null,
                    lang: previousLang,
                };

                return res.status(200).json(withTraceId(res, {
                    ok: true,
                    unchanged: true,
                    memo,
                    meta: {
                        current_max_node_seq: currentMaxNodeSeq,
                        memo_to_node_seq: previousToNodeSeq,
                        delta_nodes_count: 0,
                    }
                }));
            }

            // Step 7: Build delta keyframes
            const deltaKeyframes = buildKeyframesFromNodes(deltaNodes);
            const validNodeIds = deltaKeyframes.map(kf => kf.node_id);

            // Step 8: Resolve language
            const uiLang = req.session?.user?.preferred_language === 'en' ? 'en' : 'zh';
            let resolvedLang;
            if (langParam === 'en' || langParam === 'zh') {
                resolvedLang = langParam;
            } else {
                // Keep previous memo language for consistency, or detect from delta
                resolvedLang = previousLang || detectLanguage(deltaKeyframes, uiLang);
            }
            console.log(`[memo:update] Language: requested=${langParam || 'auto'} resolved=${resolvedLang}`);

            // Step 9: Build incremental messages
            const messages = buildIncrementalMemoMessages(previousBullets, deltaKeyframes, resolvedLang);

            // Step 10: Call LLM
            const { provider, defaultModel } = await resolveProviderForRequest({
                providerHint,
                userId,
            });

            const startTime = Date.now();
            let llmResult;
            try {
                llmResult = await provider.callChat({
                    messages,
                    options: {
                        model: defaultModel,
                        temperature: 0.3,
                        mode: 'memo',
                    },
                });
            } catch (err) {
                console.error('[memo:update] LLM call failed:', err.message);
                throw new HttpError({ status: 502, code: 'llm_failed', message: 'Failed to update memo' });
            }

            console.log(`[memo:update] LLM responded in ${Date.now() - startTime}ms`);

            // Step 11: Parse response
            let parsed;
            const responseText = llmResult.ai_text || llmResult.text || '';
            const fallbackNodeId = validNodeIds.length > 0 ? validNodeIds[validNodeIds.length - 1] : branchNodes[branchNodes.length - 1]?.id;
            const allValidIds = validNodeIds.length > 0 ? validNodeIds : [fallbackNodeId].filter(Boolean);

            try {
                if (llmResult.parsed_json) {
                    parsed = parseMemoResponse(llmResult.parsed_json, allValidIds);
                } else {
                    parsed = parseMemoResponse(responseText, allValidIds);
                }
            } catch (parseErr) {
                console.error('[memo:update] Parse failed:', parseErr.message);
                throw new HttpError({ status: 500, code: 'memo_parse_failed', message: 'Failed to parse memo response' });
            }

            // T75/T79: Debug injection for grounding guardrail testing (same as /generate)
            const allowDebugHooks = process.env.NODE_ENV === 'test'
                || process.env.ALLOW_DEBUG === '1'
                || process.env.NODE_ENV !== 'production';
            const forceBadAnchor = allowDebugHooks && (
                req.query.force_bad_anchor === '1'
                || req.query.debug_force_bad_anchor === '1'
                || req.headers['x-debug-force-bad-anchor'] === '1'
            );

            // T79: Inject bad anchor for testing grounding guardrails
            if (forceBadAnchor && parsed.bullets.length > 0) {
                console.warn('[memo:update] T79 TEST: Injecting bad anchor for grounding test');
                parsed.bullets[0].anchors = [{ type: 'node', id: 'NONEXISTENT_TEST_NODE_ID' }];
            }

            // T75: Verify memo integrity before persist
            const nodeMap = new Map(deltaNodes.map(n => [n.id, { id: n.id, created_at: n.created_at }]));
            const integrity = verifyMemoIntegrity(parsed.bullets, allValidIds, nodeMap);

            if (!integrity.ok) {
                console.warn(`[memo:update] T75 Integrity: ${integrity.affected_count} bullets affected, ${integrity.bad_refs.length} bad refs`);
            }

            // Step 12: Build new memo object (T75: use verified bullets)
            const memoId = `M_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
            const createdAt = new Date();
            const memo = {
                memo_id: memoId,
                created_at: createdAt.toISOString(),
                scope: { type: 'branch', root_node_id: branchRootId },
                bullets: integrity.bullets, // T75: verified bullets
                coverage: {
                    node_count: currentMaxNodeSeq,
                    delta_count: deltaNodes.length,
                },
                integrity: { ok: integrity.ok, bad_refs: integrity.bad_refs, affected_count: integrity.affected_count }, // T75
                based_on_memo_id: previousMemoId,
                lang: resolvedLang,
            };

            // Step 13: Persist to database (T75: include integrity)
            const memoJsonForDb = { bullets: integrity.bullets, coverage: memo.coverage, lang: resolvedLang, integrity: memo.integrity };
            try {
                if (hasLangColumn && hasDeltaColumn) {
                    await pool.query(
                        `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang, delta_nodes_count)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                        [
                            memoId,
                            tree_id,
                            branchRootId,
                            createdAt,
                            previousToNodeSeq, // from_node_seq = previous memo's to_node_seq
                            currentMaxNodeSeq, // to_node_seq = current node count
                            JSON.stringify(memoJsonForDb),
                            previousMemoId,
                            resolvedLang,
                            deltaNodes.length, // delta_nodes_count
                        ]
                    );
                } else if (hasLangColumn) {
                    await pool.query(
                        `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id, lang)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            memoId,
                            tree_id,
                            branchRootId,
                            createdAt,
                            previousToNodeSeq,
                            currentMaxNodeSeq,
                            JSON.stringify(memoJsonForDb),
                            previousMemoId,
                            resolvedLang,
                        ]
                    );
                } else {
                    await pool.query(
                        `INSERT INTO memos (id, tree_id, scope_root_node_id, created_at, from_node_seq, to_node_seq, memo_json, based_on_memo_id)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            memoId,
                            tree_id,
                            branchRootId,
                            createdAt,
                            previousToNodeSeq,
                            currentMaxNodeSeq,
                            JSON.stringify(memoJsonForDb),
                            previousMemoId,
                        ]
                    );
                }
                console.log(`[memo:update] Persisted memo ${memoId} (based_on=${previousMemoId}, delta=${deltaNodes.length})`);

                // P1-3: Write auditable artifact version for incremental memo (fail-open)
                writeMemoArtifact(pool, {
                    tree_id,
                    memo_id: memoId,
                    created_by: userId,
                    provider: providerHint || null,
                    model: model || null,
                    prompt_version: 'memo_incremental_v1',
                    memo_json: memoJsonForDb,
                    keyframe_ids: deltaNodes.map(n => n.id),
                    node_ids: deltaNodes.map(n => n.id),
                    based_on_memo_id: previousMemoId,
                    scope_node_id: branchRootId,
                    lang: resolvedLang,
                }).catch(() => {}); // fail-open

                // T70: Log memo_updated process event (fail-open)
                logProcessEvent(pool, {
                    tree_id,
                    scope_node_id: focusNodeId,
                    event_type: 'memo_updated',
                    meta: {
                        actor: 'system',
                        source: 'api',
                        memo_id: memoId,
                        node_id: focusNodeId,
                        based_on_memo_id: previousMemoId,
                    },
                }).catch(() => { }); // fail-open
            } catch (dbErr) {
                console.error('[memo:update] Failed to persist memo:', dbErr.message);
            }

            console.log(`[memo:update] Updated memo ${memoId} with ${memo.bullets.length} bullets`);

            res.status(200).json(withTraceId(res, {
                ok: true,
                unchanged: false,
                memo,
                meta: {
                    current_max_node_seq: currentMaxNodeSeq,
                    memo_to_node_seq: currentMaxNodeSeq,
                    delta_nodes_count: deltaNodes.length,
                    based_on_memo_id: previousMemoId,
                }
            }));
        })
    );

    /**
     * GET /api/memo/:memo_id/chain
     * T73: Get memo evolution chain by traversing based_on_memo_id
     * 
     * Query params:
     *   depth?: number (default 20, max 50)
     */
    router.get(
        '/api/memo/:memo_id/chain',
        wrapAsync(async (req, res) => {
            const memoIdRaw = req.params.memo_id;
            const memoId = typeof memoIdRaw === 'string' ? memoIdRaw.trim() : '';
            const depthRaw = req.query.depth;

            if (!memoId) {
                throw new HttpError({ status: 400, code: 'invalid_memo_id', message: 'memo_id is required' });
            }

            // Clamp depth: default 20, max 50
            const depth = Math.max(1, Math.min(50, parseInt(depthRaw, 10) || 20));

            const { pool } = await import('../db/pool.js');
            await ensureMemosSchema(pool);
            const hasLangColumn = await hasMemoLangColumn(pool);
            const langSelect = hasLangColumn ? 'lang' : 'NULL::text AS lang';

            // Traverse chain backward with cycle protection
            const chain = [];
            const visited = new Set();
            let currentId = memoId;
            let cycleDetected = false;
            let cycleAt = null;

            while (currentId && chain.length < depth) {
                if (visited.has(currentId)) {
                    cycleDetected = true;
                    cycleAt = currentId;
                    break;
                }
                visited.add(currentId);

                const { rows } = await pool.query(
                    `SELECT id, created_at, based_on_memo_id, from_node_seq, to_node_seq,
                            memo_json, ${langSelect}
                     FROM memos WHERE id = $1 LIMIT 1`,
                    [currentId]
                );

                if (rows.length === 0) break;

                const row = rows[0];
                const memoJson = normalizeMemoJson(row.memo_json);
                const bulletsCount = Array.isArray(memoJson?.bullets) ? memoJson.bullets.length : 0;
                const resolvedLang = row.lang || memoJson?.lang || 'zh';

                chain.unshift({
                    memo_id: row.id,
                    created_at: row.created_at,
                    based_on_memo_id: row.based_on_memo_id || null,
                    lang: resolvedLang,
                    from_node_seq: row.from_node_seq,
                    to_node_seq: row.to_node_seq,
                    bullets_count: bulletsCount,
                });

                currentId = row.based_on_memo_id;
            }

            if (cycleDetected) {
                console.error(`[memo:chain] Cycle detected at memo ${cycleAt}`);
                return res.status(400).json(withTraceId(res, {
                    ok: false,
                    error: 'memo_chain_cycle',
                    cycle_at: cycleAt,
                }));
            }

            // Find current index (the requested memo's position)
            const currentIndex = chain.findIndex(item => item.memo_id === memoId);

            res.status(200).json(withTraceId(res, {
                ok: true,
                chain,
                current_index: currentIndex >= 0 ? currentIndex : chain.length - 1,
                total: chain.length,
            }));
        })
    );

    return router;
}

/**
 * Build keyframes by pairing user+assistant nodes
 */
function buildKeyframesFromNodes(nodes) {
    const keyframes = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.role === 'user') {
            const assistantNode = nodes[i + 1];
            if (assistantNode && assistantNode.role === 'assistant') {
                keyframes.push({
                    node_id: node.id,
                    user_text: node.text || '',
                    ai_text: assistantNode.text || '',
                    ts: node.created_at,
                });
                i++;
            } else {
                keyframes.push({
                    node_id: node.id,
                    user_text: node.text || '',
                    ai_text: '',
                    ts: node.created_at,
                });
            }
        }
    }

    return keyframes;
}
