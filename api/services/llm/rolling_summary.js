/**
 * P0: Rolling Summary (Context v4)
 *
 * Compresses older path turns into a persistent summary while keeping a small
 * recent buffer intact for full-fidelity dialogue.
 *
 * Design goals:
 * - Fail-open: never break the main answer flow
 * - Incremental: only summarize newly dropped spans based on last_node_id
 * - Tree-native: operates on a single path segment (linear thread)
 */

import { CONTEXT_MESSAGE_LIMITS, clampText } from './context_limits.js';
import { resolveProviderForRequest } from './providers/index.js';
import { getRollingSummary, saveRollingSummary } from './rolling_summary_store.js';
import {
  recordRollingSummaryUpdateAttempt,
  recordRollingSummaryUpdateSuccess,
  recordRollingSummaryUpdateSkipped,
  recordRollingSummaryUpdateError,
  recordRollingSummaryCompression,
  recordRollingSummaryCompressionError,
} from './rolling_summary_metrics.js';

function normalizeProfile(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'standard' || v === 'max' || v === 'lite') return v;
  return 'lite';
}

function normalizeLanguage(value) {
  if (!value || typeof value !== 'string') return 'en';
  const lower = value.trim().toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getBufferSize(profile = 'lite') {
  const p = normalizeProfile(profile);
  return Math.max(0, Number(CONTEXT_MESSAGE_LIMITS[p]?.recentTurns || 0));
}

export const ROLLING_SUMMARY_CONFIG = {
  enabledEnv: 'ROLLING_SUMMARY_ENABLED',
  modelEnv: 'ROLLING_SUMMARY_LLM_MODEL',
  bufferSize: {
    lite: 2,
    standard: 4,
    max: 6,
  },
  minTurnsToCompress: 3,
  maxSummaryChars: {
    lite: 300,
    standard: 450,
    max: 600,
  },
  llm: {
    temperature: 0.1,
    timeout_ms: 30000,
  },
};

function isEnabled() {
  const raw = (process.env[ROLLING_SUMMARY_CONFIG.enabledEnv] || '0').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function getMaxSummaryChars(profile) {
  const p = normalizeProfile(profile);
  return ROLLING_SUMMARY_CONFIG.maxSummaryChars[p] || ROLLING_SUMMARY_CONFIG.maxSummaryChars.standard;
}

function clampSummaryText(text, profile) {
  const limit = getMaxSummaryChars(profile);
  return clampText(typeof text === 'string' ? text : '', limit);
}

function formatTurns(turns = []) {
  const lines = [];
  for (const t of turns) {
    if (!t || typeof t !== 'object') continue;
    const role = typeof t.role === 'string' ? t.role : 'user';
    const id = typeof t.id === 'string' ? t.id : null;
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text) continue;
    const prefix = id ? `[${id}] ${role}` : role;
    lines.push(`${prefix}: ${clampText(text, 600)}`);
  }
  return lines.join('\n');
}

function buildInitialSummaryPrompt(turns, { topic, userLanguage } = {}) {
  const lang = normalizeLanguage(userLanguage);
  const header = [
    `Target language: ${lang}`,
    'Task: Summarize the following conversation turns into a concise rolling summary.',
    topic ? `Topic: ${topic}` : null,
    '',
    'Rules:',
    '- Preserve decisions, constraints, definitions, and key facts.',
    '- Prefer newer facts if conflicts exist.',
    '- Keep it short and information-dense.',
    '- No Markdown; plain text only.',
    '',
    'Conversation turns:',
  ].filter(Boolean);

  return `${header.join('\n')}\n${formatTurns(turns)}`;
}

function buildIncrementalSummaryPrompt(existing, newTurns, { topic, userLanguage } = {}) {
  const lang = normalizeLanguage(userLanguage);
  const existingText = typeof existing?.text === 'string' ? existing.text : '';
  const header = [
    `Target language: ${lang}`,
    'Task: Update the existing rolling summary by merging NEW turns.',
    topic ? `Topic: ${topic}` : null,
    '',
    'Existing summary:',
    existingText || '(empty)',
    '',
    'NEW turns to merge:',
    formatTurns(newTurns),
    '',
    'Rules:',
    '- Integrate new information into the summary.',
    '- Prefer newer information if contradictions exist.',
    '- Remove redundancy.',
    '- Keep the updated summary short and information-dense.',
    '- No Markdown; plain text only.',
  ].filter(Boolean);

  return header.join('\n');
}

function extractMeta(summary) {
  const meta = summary && typeof summary === 'object' ? summary.meta : null;
  return meta && typeof meta === 'object' ? meta : {};
}

async function tryAcquireRollingSummaryLock(client, nodeId) {
  if (!client || typeof client.query !== 'function') return false;
  const { rows } = await client.query(
    `SELECT pg_try_advisory_lock(hashtext('rolling_summary'), hashtext($1)) AS locked`,
    [String(nodeId || '')]
  );
  return rows[0]?.locked === true;
}

async function releaseRollingSummaryLock(client, nodeId) {
  if (!client || typeof client.query !== 'function') return false;
  const { rows } = await client.query(
    `SELECT pg_advisory_unlock(hashtext('rolling_summary'), hashtext($1)) AS unlocked`,
    [String(nodeId || '')]
  );
  return rows[0]?.unlocked === true;
}

async function fetchPathTurnsForRollingSummary(client, { anchorNodeId, stopAtNodeId = null, maxDepth = 5000 } = {}) {
  if (!client || typeof client.query !== 'function') return [];
  if (typeof anchorNodeId !== 'string' || anchorNodeId.trim().length === 0) return [];

  const stopId = typeof stopAtNodeId === 'string' && stopAtNodeId.trim().length > 0 ? stopAtNodeId.trim() : null;
  const depthLimit = Math.max(10, Number(maxDepth) || 5000);

  const { rows } = await client.query(
    `
    WITH RECURSIVE path AS (
      SELECT id, parent_id, role, text, level, 0 AS depth
      FROM nodes
      WHERE id = $1 AND soft_deleted_at IS NULL
      UNION ALL
      SELECT n.id, n.parent_id, n.role, n.text, n.level, p.depth + 1
      FROM nodes n
      JOIN path p ON p.parent_id = n.id
      WHERE n.soft_deleted_at IS NULL
        AND ($2::text IS NULL OR p.id::text <> $2)
        AND p.depth < $3
    )
    SELECT id::text AS id, role, text, level
    FROM path
    WHERE role IN ('user','ai')
    ORDER BY level ASC
    `,
    [anchorNodeId.trim(), stopId, depthLimit]
  );

  return Array.isArray(rows) ? rows : [];
}

function isValidTurn(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.text !== 'string' || t.text.trim().length === 0) return false;
  return true;
}

/**
 * Decide whether compression is needed and which turns should be summarized.
 *
 * Input turns MUST be chronological (oldest -> newest).
 *
 * @param {object} params
 * @param {Array<{id?:string, role:string, text:string}>} params.allTurns
 * @param {number} params.bufferSize - how many turns to keep intact
 * @param {object|null} params.existingSummary - previously persisted summary JSON
 * @returns {{needCompress:boolean, turnsToCompress:Array, bufferTurns:Array, lastNodeId:string|null}}
 */
export function decideCompression({ allTurns = [], bufferSize = 0, existingSummary = null } = {}) {
  const normalizedTurns = Array.isArray(allTurns) ? allTurns.filter(isValidTurn) : [];
  const keep = Math.max(0, Number(bufferSize) || 0);
  if (normalizedTurns.length <= keep) {
    return {
      needCompress: false,
      turnsToCompress: [],
      bufferTurns: normalizedTurns,
      lastNodeId: null,
    };
  }

  const compressEndExclusive = Math.max(0, normalizedTurns.length - keep);
  const meta = extractMeta(existingSummary);
  const lastNodeId = typeof meta.last_node_id === 'string' ? meta.last_node_id : null;

  let compressStart = 0;
  if (lastNodeId) {
    const idx = normalizedTurns.findIndex((t) => t?.id === lastNodeId);
    if (idx >= 0) {
      compressStart = idx + 1;
    }
  }

  const turnsToCompress = normalizedTurns.slice(compressStart, compressEndExclusive);
  const bufferTurns = normalizedTurns.slice(compressEndExclusive);

  const needCompress =
    turnsToCompress.length >= ROLLING_SUMMARY_CONFIG.minTurnsToCompress &&
    bufferTurns.length === keep &&
    compressEndExclusive > 0;

  return {
    needCompress,
    turnsToCompress,
    bufferTurns,
    lastNodeId:
      turnsToCompress.length > 0 && typeof turnsToCompress[turnsToCompress.length - 1]?.id === 'string'
        ? turnsToCompress[turnsToCompress.length - 1].id
        : null,
  };
}

/**
 * Generate a new rolling summary text (initial or incremental).
 * @returns {Promise<{text:string, meta:object, provider?:string, model?:string}>}
 */
export async function generateRollingSummary({
  turnsToCompress = [],
  existingSummary = null,
  context = {},
  userId = null,
  providerHint = null,
  profile = 'lite',
} = {}) {
  const p = normalizeProfile(profile);
  const safeTurns = Array.isArray(turnsToCompress) ? turnsToCompress.filter(isValidTurn) : [];
  if (safeTurns.length === 0) {
    return existingSummary;
  }

  const prompt = existingSummary?.text
    ? buildIncrementalSummaryPrompt(existingSummary, safeTurns, context)
    : buildInitialSummaryPrompt(safeTurns, context);

  const { provider, name: providerName, defaultModel } = await resolveProviderForRequest({
    providerHint,
    userId,
  });

  const modelToUse = process.env[ROLLING_SUMMARY_CONFIG.modelEnv] || defaultModel || 'gpt-4o-mini';
  const startedAt = Date.now();
  let response;
  try {
    response = await provider.callChat({
      prompt,
      metadata: { mode: 'rolling_summary' },
      options: {
        model: modelToUse,
        temperature: ROLLING_SUMMARY_CONFIG.llm.temperature,
        timeout_ms: ROLLING_SUMMARY_CONFIG.llm.timeout_ms,
      },
    });
  } catch (error) {
    recordRollingSummaryCompressionError({
      profile: p,
      provider: providerName || 'unknown',
      model: modelToUse,
    });
    throw error;
  }
  const latencyMs = Date.now() - startedAt;

  const rawText = response?.ai_text || '';
  const summaryText = clampSummaryText(rawText, p);
  recordRollingSummaryCompression({
    profile: p,
    provider: providerName || 'unknown',
    model: response?.model || modelToUse,
    latencyMs,
    summaryLength: summaryText.length,
    turnsCompressed: safeTurns.length,
  });

  const existingMeta = extractMeta(existingSummary);
  const prevCount = Number(existingMeta.compressed_turn_count || 0) || 0;
  const nextCount = prevCount + safeTurns.length;
  const now = new Date().toISOString();

  return {
    text: summaryText,
    meta: {
      version: 1,
      last_node_id: typeof safeTurns[safeTurns.length - 1]?.id === 'string' ? safeTurns[safeTurns.length - 1].id : null,
      compressed_turn_count: nextCount,
      created_at: existingMeta.created_at || now,
      updated_at: now,
      provider: providerName || null,
      model: response?.model || process.env[ROLLING_SUMMARY_CONFIG.modelEnv] || defaultModel || null,
    },
  };
}

/**
 * High-level helper used by context construction:
 * - decides whether compression is needed
 * - generates summary (initial/incremental)
 * - persists summary into node_summaries.rolling_summary
 *
 * Fail-open: returns {rollingSummary:null, bufferTurns:[...]} on any error.
 */
export async function processRollingSummary({
  nodeId,
  pathTurns = [],
  profile = 'lite',
  context = {},
  userId = null,
  providerHint = null,
  client = null,
  existingSummary = undefined,
} = {}) {
  const p = normalizeProfile(profile);
  const bufferSize = getBufferSize(p) || ROLLING_SUMMARY_CONFIG.bufferSize[p] || 2;
  const allTurns = Array.isArray(pathTurns) ? pathTurns.filter(isValidTurn) : [];

  try {
    if (!isEnabled()) {
      return { rollingSummary: null, bufferTurns: allTurns.slice(-bufferSize) };
    }

    const existing = typeof existingSummary === 'undefined'
      ? await getRollingSummary(nodeId, client || undefined)
      : existingSummary;
    const decision = decideCompression({ allTurns, bufferSize, existingSummary: existing });
    if (!decision.needCompress) {
      return {
        rollingSummary: typeof existing?.text === 'string' ? existing.text : null,
        bufferTurns: decision.bufferTurns,
      };
    }

    const generated = await generateRollingSummary({
      turnsToCompress: decision.turnsToCompress,
      existingSummary: existing,
      context,
      userId,
      providerHint,
      profile: p,
    });

    if (generated && typeof generated === 'object') {
      await saveRollingSummary(nodeId, generated, client || undefined);
      return { rollingSummary: generated.text || null, bufferTurns: decision.bufferTurns };
    }

    return {
      rollingSummary: typeof existing?.text === 'string' ? existing.text : null,
      bufferTurns: decision.bufferTurns,
    };
  } catch (error) {
    return { rollingSummary: null, bufferTurns: allTurns.slice(-bufferSize) };
  }
}

/**
 * P0-04: Async refresh (write-path) + advisory lock.
 *
 * This function is intended to be called from turn.create after the AI node is persisted,
 * via setImmediate() (non-blocking).
 *
 * Fail-open: never throws to caller.
 */
export async function maybeUpdateRollingSummary({
  pool,
  nodeId,
  profile = 'lite',
  context = {},
  userId = null,
  providerHint = null,
  maxDepth = 5000,
} = {}) {
  try {
    recordRollingSummaryUpdateAttempt({ profile });
    if (!isEnabled()) {
      recordRollingSummaryUpdateSkipped({ profile, reason: 'disabled' });
      return { ok: false, skipped: true, reason: 'disabled' };
    }
    if (!pool || typeof pool.connect !== 'function') {
      recordRollingSummaryUpdateSkipped({ profile, reason: 'missing_pool' });
      return { ok: false, skipped: true, reason: 'missing_pool' };
    }
    if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
      recordRollingSummaryUpdateSkipped({ profile, reason: 'invalid_node_id' });
      return { ok: false, skipped: true, reason: 'invalid_node_id' };
    }

    const client = await pool.connect();
    let locked = false;
    try {
      locked = await tryAcquireRollingSummaryLock(client, nodeId);
      if (!locked) {
        recordRollingSummaryUpdateSkipped({ profile, reason: 'locked' });
        return { ok: false, skipped: true, reason: 'locked' };
      }

      const existing = await getRollingSummary(nodeId, client);
      const meta = extractMeta(existing);
      const lastNodeId = typeof meta.last_node_id === 'string' ? meta.last_node_id : null;

      const rows = await fetchPathTurnsForRollingSummary(client, {
        anchorNodeId: nodeId,
        stopAtNodeId: lastNodeId,
        maxDepth,
      });

      const pathTurns = rows
        .map((r) => ({
          id: typeof r?.id === 'string' ? r.id : null,
          role: r?.role === 'ai' ? 'assistant' : (typeof r?.role === 'string' ? r.role : 'user'),
          text: typeof r?.text === 'string' ? r.text : '',
        }))
        .filter(isValidTurn);

      const result = await processRollingSummary({
        nodeId,
        pathTurns,
        profile,
        context,
        userId,
        providerHint,
        client,
        existingSummary: existing,
      });

      recordRollingSummaryUpdateSuccess({ profile });
      return {
        ok: true,
        skipped: false,
        updated: Boolean(result?.rollingSummary),
        rollingSummaryChars: typeof result?.rollingSummary === 'string' ? result.rollingSummary.length : 0,
      };
    } finally {
      if (locked) {
        try {
          await releaseRollingSummaryLock(client, nodeId);
        } catch (e) {
          // fail-open
        }
      }
      client.release();
    }
  } catch (error) {
    recordRollingSummaryUpdateError({ profile });
    return { ok: false, skipped: true, reason: 'error' };
  }
}

export const __private__ = {
  normalizeProfile,
  normalizeLanguage,
  formatTurns,
  buildInitialSummaryPrompt,
  buildIncrementalSummaryPrompt,
  clampSummaryText,
  isEnabled,
  fetchPathTurnsForRollingSummary,
  tryAcquireRollingSummaryLock,
  releaseRollingSummaryLock,
};

export default {
  getBufferSize,
  decideCompression,
  generateRollingSummary,
  processRollingSummary,
  maybeUpdateRollingSummary,
};
