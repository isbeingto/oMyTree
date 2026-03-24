import { pool } from '../../db/pool.js';
import { clampText } from './context_limits.js';
import { resolveProviderForRequest } from './providers/index.js';
import { parseOpenAiJson } from './providers/openai.js';
import { embedText } from '../semantic/embeddings.js';
import { embeddingCache } from '../semantic/embedding_cache.js';
import {
  recordBranchSummaryGenerationAttempt,
  recordBranchSummaryGenerationError,
  recordBranchSummaryGenerationSkipped,
  recordBranchSummaryGenerationSuccess,
  recordBranchSummaryGenerationDuration,
  recordCrossBranchDetectionAttempt,
  recordCrossBranchDetectionError,
  recordCrossBranchDetectionHit,
  recordCrossBranchDetectionMiss,
  recordCrossBranchDetectionDuration,
  recordCrossBranchReferenceCount,
} from './branch_summary_metrics.js';
import { getBranchSummary, upsertBranchSummary } from './branch_summary_store.js';

function ensureId(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw Object.assign(new Error(`${name} is required`), { code: `INVALID_${name.toUpperCase()}` });
  }
  return value.trim();
}

function normalizeLanguage(value) {
  if (!value || typeof value !== 'string') return 'en';
  const lower = value.trim().toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export const BRANCH_SUMMARY_CONFIG = {
  enabledEnv: 'BRANCH_SUMMARY_ENABLED',
  modelEnv: 'BRANCH_SUMMARY_LLM_MODEL',
  minTurnsEnv: 'BRANCH_SUMMARY_MIN_TURNS',
  updateThresholdEnv: 'BRANCH_SUMMARY_UPDATE_THRESHOLD',
  similarityThresholdEnv: 'CROSS_BRANCH_SIMILARITY_THRESHOLD',
  maxReferencesEnv: 'CROSS_BRANCH_MAX_REFERENCES',
  maxTurnTextChars: 800,
  maxCandidateSummaries: 50,
  minQueryLengthFallback: 3,
  llm: {
    temperature: 0.3,
    timeout_ms: 45000,
  },
};

const BRANCH_SUMMARY_VERBOSE_LOGS = (() => {
  const raw = (process.env.BRANCH_SUMMARY_VERBOSE_LOGS || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
})();

const MODEL_MISMATCH_WARNED = new Set();

export function isBranchSummaryEnabled() {
  const raw = (process.env[BRANCH_SUMMARY_CONFIG.enabledEnv] || '0').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function getMinTurns() {
  const v = parseInt(process.env[BRANCH_SUMMARY_CONFIG.minTurnsEnv] || '5', 10);
  return Math.max(1, Number.isFinite(v) ? v : 5);
}

function getUpdateThreshold() {
  const v = parseInt(process.env[BRANCH_SUMMARY_CONFIG.updateThresholdEnv] || '5', 10);
  return Math.max(1, Number.isFinite(v) ? v : 5);
}

function getCrossBranchSimilarityThreshold() {
  const v = Number.parseFloat(process.env[BRANCH_SUMMARY_CONFIG.similarityThresholdEnv] || '0.65');
  if (!Number.isFinite(v)) return 0.65;
  return Math.max(0, Math.min(1, v));
}

function getCrossBranchMaxReferences() {
  const v = parseInt(process.env[BRANCH_SUMMARY_CONFIG.maxReferencesEnv] || '2', 10);
  return Math.max(1, Number.isFinite(v) ? v : 2);
}

function getCrossBranchMinQueryLength() {
  const v = parseInt(process.env.SEMANTIC_MIN_QUERY_LENGTH || `${BRANCH_SUMMARY_CONFIG.minQueryLengthFallback}`, 10);
  return Math.max(1, Number.isFinite(v) ? v : BRANCH_SUMMARY_CONFIG.minQueryLengthFallback);
}

function normalizeProviderKind(kind, name) {
  const raw = String(kind || name || '').trim().toLowerCase();
  if (raw === 'google' || raw.includes('gemini')) return 'gemini';
  if (raw.includes('anthropic') || raw.includes('claude')) return 'anthropic';
  if (raw.includes('deepseek')) return 'deepseek';
  if (raw.includes('ollama')) return 'ollama';
  return 'openai';
}

function isModelCompatibleForProvider(model, providerKind) {
  const normalizedModel = typeof model === 'string' ? model.trim().toLowerCase() : '';
  if (!normalizedModel) return false;
  switch (providerKind) {
    case 'gemini':
      return normalizedModel.includes('gemini');
    case 'anthropic':
      return normalizedModel.includes('claude');
    case 'deepseek':
      return normalizedModel.includes('deepseek');
    case 'ollama':
      return true;
    case 'openai':
    default:
      return !normalizedModel.includes('gemini')
        && !normalizedModel.includes('claude')
        && !normalizedModel.includes('deepseek');
  }
}

function getProviderDefaultModel(providerKind, defaultModel) {
  const normalizedDefault = typeof defaultModel === 'string' ? defaultModel.trim() : '';
  if (normalizedDefault) return normalizedDefault;
  switch (providerKind) {
    case 'gemini':
      return process.env.GOOGLE_LLM_MODEL || 'gemini-3-flash-preview';
    case 'anthropic':
      return process.env.ANTHROPIC_LLM_MODEL || 'claude-sonnet-4-20250514';
    case 'deepseek':
      return process.env.DEEPSEEK_LLM_MODEL || 'deepseek-chat';
    case 'ollama':
      return 'llama3.2';
    case 'openai':
    default:
      return process.env.LLM_MODEL || 'gpt-4o-mini';
  }
}

function resolveBranchSummaryModel({ providerKind, providerName, configuredModel, defaultModel }) {
  const normalizedKind = normalizeProviderKind(providerKind, providerName);
  const configured = typeof configuredModel === 'string' ? configuredModel.trim() : '';

  if (configured && isModelCompatibleForProvider(configured, normalizedKind)) {
    return configured;
  }

  const fallback = getProviderDefaultModel(normalizedKind, defaultModel);
  if (configured && !isModelCompatibleForProvider(configured, normalizedKind)) {
    const warningKey = `${normalizedKind}:${configured}->${fallback}`;
    if (!MODEL_MISMATCH_WARNED.has(warningKey)) {
      MODEL_MISMATCH_WARNED.add(warningKey);
      console.warn(
        `[P2:BranchSummary] Incompatible model "${configured}" for provider "${normalizedKind}", fallback to "${fallback}"`
      );
    }
  }

  if (isModelCompatibleForProvider(fallback, normalizedKind)) {
    return fallback;
  }

  return getProviderDefaultModel(normalizedKind, null);
}

function isValidTurn(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.text !== 'string' || t.text.trim().length === 0) return false;
  return true;
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
    lines.push(`${prefix}: ${clampText(text, BRANCH_SUMMARY_CONFIG.maxTurnTextChars)}`);
  }
  return lines.join('\n');
}

function buildInitialBranchSummaryPrompt(turns, { userLanguage } = {}) {
  const lang = normalizeLanguage(userLanguage);
  return [
    `Target language: ${lang}`,
    'Task: Generate a structured summary (JSON) for the following branch conversation.',
    '',
    'Output requirements:',
    '- Output JSON only (no Markdown).',
    '- The JSON MUST include keys: overview, key_points, conclusions, open_questions.',
    '- key_points MUST be an array of strings; open_questions MUST be an array of strings.',
    '',
    'Conversation turns:',
    formatTurns(turns),
    '',
    'JSON schema example:',
    '{',
    '  "overview": "One-sentence topic overview",',
    '  "key_points": ["Point 1", "Point 2"],',
    '  "conclusions": "Decisions/conclusions (can be empty string)",',
    '  "open_questions": ["Question 1"]',
    '}',
  ].join('\n');
}

function buildIncrementalBranchSummaryPrompt(existingSummary, newTurns, { userLanguage } = {}) {
  const lang = normalizeLanguage(userLanguage);
  const existingJson = existingSummary && typeof existingSummary === 'object' ? existingSummary : {};
  return [
    `Target language: ${lang}`,
    'Task: Update the EXISTING branch summary by integrating NEW turns.',
    '',
    'EXISTING summary (JSON):',
    JSON.stringify(existingJson),
    '',
    'NEW turns to integrate:',
    formatTurns(newTurns),
    '',
    'Output requirements:',
    '- Output JSON only (no Markdown).',
    '- The JSON MUST include keys: overview, key_points, conclusions, open_questions.',
    '- Preserve existing correct facts; integrate new information; remove redundancy.',
  ].join('\n');
}

function normalizeSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const overview = typeof payload.overview === 'string' ? payload.overview.trim() : '';
  const conclusions = typeof payload.conclusions === 'string' ? payload.conclusions.trim() : '';
  const key_points = Array.isArray(payload.key_points)
    ? payload.key_points.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
    : [];
  const open_questions = Array.isArray(payload.open_questions)
    ? payload.open_questions.map((q) => (typeof q === 'string' ? q.trim() : '')).filter(Boolean)
    : [];

  if (!overview && key_points.length === 0 && !conclusions && open_questions.length === 0) {
    return null;
  }

  return { overview, key_points, conclusions, open_questions };
}

function buildSummaryText(summary) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const overview = typeof s.overview === 'string' ? s.overview.trim() : '';
  const keyPoints = Array.isArray(s.key_points) ? s.key_points.filter((p) => typeof p === 'string' && p.trim()) : [];
  const conclusions = typeof s.conclusions === 'string' ? s.conclusions.trim() : '';
  const openQs = Array.isArray(s.open_questions) ? s.open_questions.filter((q) => typeof q === 'string' && q.trim()) : [];

  const lines = [];
  if (overview) lines.push(`Topic: ${overview}`);
  if (keyPoints.length) {
    lines.push('Key points:');
    for (const p of keyPoints) lines.push(`- ${p.trim()}`);
  }
  if (conclusions) lines.push(`Conclusions: ${conclusions}`);
  if (openQs.length) lines.push(`Open questions: ${openQs.map((q) => q.trim()).join('; ')}`);
  return lines.join('\n').trim();
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

function hasExplicitBranchMention(text) {
  const lower = typeof text === 'string' ? text.toLowerCase() : '';
  if (!lower) return false;
  const keywords = [
    '另一个分支', '之前的分支', '主线', '回到', '分支',
    'branch', 'another branch', 'previous branch', 'main branch', 'back to',
  ];
  return keywords.some((kw) => lower.includes(kw));
}

function extractExplicitBranchIds(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  const regex = /branch-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-to-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push(m[0]);
  }
  return [...new Set(matches)];
}

async function getCachedEmbedding(text, { provider, model, dim, embedder, cache } = {}) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return null;
  const key = cache?.makeKey ? cache.makeKey(normalized, provider, model, dim) : null;
  if (key) {
    const cached = cache.get(key);
    if (cached) return cached;
  }
  const vec = await embedder(normalized, { provider, model, dim });
  if (key && Array.isArray(vec)) {
    cache.set(key, vec);
  }
  return vec;
}

/**
 * Identify the branch thread segment that a node belongs to.
 *
 * Branch point selection:
 * - Choose the nearest ancestor (closest to the current node) that is a fork (children_count > 1),
 *   otherwise fall back to the root (parent_id is NULL) or the topmost reachable ancestor.
 *
 * @param {string} nodeId
 * @param {string} treeId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<{
 *   branchId: string,
 *   branchNodes: string[],
 *   branchPoint: string,
 *   branchRootNodeId: string,
 *   branchTipNodeId: string,
 * }>}
 */
export async function identifyBranch(nodeId, treeId, client = pool) {
  const node_id = ensureId('node_id', nodeId);
  const tree_id = ensureId('tree_id', treeId);

  const { rows } = await client.query(
    `
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, 0 AS depth
        FROM nodes
        WHERE id = $1
          AND tree_id = $2
          AND soft_deleted_at IS NULL

        UNION ALL

        SELECT n.id, n.parent_id, a.depth + 1
        FROM nodes n
        JOIN ancestors a ON a.parent_id = n.id
        WHERE n.tree_id = $2
          AND n.soft_deleted_at IS NULL
      )
      SELECT
        a.id,
        a.parent_id,
        a.depth,
        COUNT(c.id)::int AS children_count
      FROM ancestors a
      LEFT JOIN nodes c
        ON c.parent_id = a.id
       AND c.tree_id = $2
       AND c.soft_deleted_at IS NULL
      GROUP BY a.id, a.parent_id, a.depth
      ORDER BY a.depth DESC
    `,
    [node_id, tree_id]
  );

  if (!rows || rows.length === 0) {
    throw Object.assign(new Error(`node not found in tree`), { code: 'NODE_NOT_FOUND' });
  }

  // rows ordered root -> ... -> current
  const path = rows.map((r) => ({
    id: String(r.id),
    parent_id: r.parent_id === null ? null : String(r.parent_id),
    children_count: Number.isFinite(r.children_count) ? r.children_count : parseInt(String(r.children_count || '0'), 10) || 0,
  }));

  let branchPointIndex = 0;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const n = path[i];
    const isRoot = n.parent_id === null || i === 0;
    const isFork = n.children_count > 1;
    if (isFork || isRoot) {
      branchPointIndex = i;
      break;
    }
  }

  const branchPoint = path[branchPointIndex].id;
  const branchNodes = path.slice(branchPointIndex).map((n) => n.id);
  const branchId = `branch-${branchPoint}-to-${node_id}`;

  return {
    branchId,
    branchNodes,
    branchPoint,
    branchRootNodeId: branchPoint,
    branchTipNodeId: node_id,
  };
}

/**
 * Decide whether a branch summary should be updated.
 * @param {string} treeId
 * @param {string} branchId
 * @param {number} currentNodeCount
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<{needsUpdate:boolean, existingSummary: any, existingSummaryText: string, existingNodeCount: number}>}
 */
export async function shouldUpdateBranchSummary(treeId, branchId, currentNodeCount, client = pool) {
  const current = Math.max(0, Number(currentNodeCount || 0) || 0);
  const existing = await getBranchSummary(treeId, branchId, client);
  const minTurns = getMinTurns();
  const updateThreshold = getUpdateThreshold();

  if (!existing) {
    return {
      needsUpdate: current >= minTurns,
      existingSummary: null,
      existingSummaryText: '',
      existingNodeCount: 0,
    };
  }

  const newNodes = Math.max(0, current - (Number(existing.node_count || 0) || 0));
  const needsUpdate = newNodes >= updateThreshold;

  return {
    needsUpdate,
    existingSummary: existing.summary ?? null,
    existingSummaryText: existing.summary_text ?? '',
    existingNodeCount: Number(existing.node_count || 0) || 0,
  };
}

async function fetchBranchTurns(client, { treeId, branchNodes = [] } = {}) {
  if (!client || typeof client.query !== 'function') return [];
  const tree_id = ensureId('tree_id', treeId);
  const ids = Array.isArray(branchNodes) ? branchNodes.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (ids.length === 0) return [];

  const { rows } = await client.query(
    `
      SELECT id::text AS id, role, text, level
      FROM nodes
      WHERE tree_id = $1
        AND soft_deleted_at IS NULL
        AND id = ANY($2::uuid[])
        AND role IN ('user','ai')
      ORDER BY level ASC
    `,
    [tree_id, ids]
  );

  return Array.isArray(rows) ? rows : [];
}

async function countBranchTurns(client, { treeId, branchNodes = [] } = {}) {
  if (!client || typeof client.query !== 'function') return 0;
  const tree_id = ensureId('tree_id', treeId);
  const ids = Array.isArray(branchNodes) ? branchNodes.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (ids.length === 0) return 0;
  const { rows } = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM nodes
      WHERE tree_id = $1
        AND soft_deleted_at IS NULL
        AND id = ANY($2::uuid[])
        AND role IN ('user','ai')
    `,
    [tree_id, ids]
  );
  return Number(rows?.[0]?.count || 0) || 0;
}

async function tryAcquireBranchSummaryLock(client, branchId) {
  if (!client || typeof client.query !== 'function') return false;
  const { rows } = await client.query(
    `SELECT pg_try_advisory_lock(hashtext('branch_summary'), hashtext($1)) AS locked`,
    [String(branchId || '')]
  );
  return rows[0]?.locked === true;
}

async function releaseBranchSummaryLock(client, branchId) {
  if (!client || typeof client.query !== 'function') return false;
  const { rows } = await client.query(
    `SELECT pg_advisory_unlock(hashtext('branch_summary'), hashtext($1)) AS unlocked`,
    [String(branchId || '')]
  );
  return rows[0]?.unlocked === true;
}

/**
 * Generate or update a branch summary, then upsert to DB.
 *
 * Fail-open: returns existing summary when generation fails.
 *
 * @returns {Promise<{updated:boolean, summary:any, summaryText:string, nodeCount:number, totalTokens:number, provider?:string, model?:string}>}
 */
export async function generateBranchSummary({
  treeId,
  branchId,
  branchNodes,
  branchPoint,
  existingSummary = null,
  existingNodeCount = 0,
  userId = null,
  providerHint = null,
  userLanguage = null,
  client = pool,
  providerResolver = resolveProviderForRequest,
} = {}) {
  const tree_id = ensureId('tree_id', treeId);
  const branch_id = ensureId('branch_id', branchId);
  const branch_point = ensureId('branch_point', branchPoint);

  const rows = await fetchBranchTurns(client, { treeId: tree_id, branchNodes });
  const allTurns = rows
    .map((r) => ({
      id: typeof r?.id === 'string' ? r.id : null,
      role: r?.role === 'ai' ? 'assistant' : (typeof r?.role === 'string' ? r.role : 'user'),
      text: typeof r?.text === 'string' ? r.text : '',
      level: Number(r?.level || 0) || 0,
    }))
    .filter(isValidTurn);

  const nodeCount = allTurns.length;
  const minTurns = getMinTurns();
  if (nodeCount < minTurns) {
    recordBranchSummaryGenerationSkipped({ reason: 'min_turns' });
    return {
      updated: false,
      summary: existingSummary,
      summaryText: typeof existingSummary === 'object' && existingSummary ? buildSummaryText(existingSummary) : '',
      nodeCount,
      totalTokens: 0,
    };
  }

  const useIncremental = existingSummary && typeof existingSummary === 'object' && existingNodeCount > 0;
  const newTurns = useIncremental ? allTurns.slice(Math.min(existingNodeCount, allTurns.length)) : allTurns;
  const prompt = useIncremental
    ? buildIncrementalBranchSummaryPrompt(existingSummary, newTurns, { userLanguage })
    : buildInitialBranchSummaryPrompt(allTurns, { userLanguage });

  const { provider, name: providerName, defaultModel, providerKind } = await providerResolver({
    providerHint,
    userId,
  });
  const modelToUse = resolveBranchSummaryModel({
    providerKind,
    providerName,
    configuredModel: process.env[BRANCH_SUMMARY_CONFIG.modelEnv],
    defaultModel,
  });

  const startedAt = Date.now();
  try {
    recordBranchSummaryGenerationAttempt();
    const response = await provider.callChat({
      prompt,
      metadata: { mode: 'branch_summary' },
      options: {
        model: modelToUse,
        temperature: BRANCH_SUMMARY_CONFIG.llm.temperature,
        timeout_ms: BRANCH_SUMMARY_CONFIG.llm.timeout_ms,
      },
    });

    const parsed = normalizeSummaryPayload(parseOpenAiJson(response?.ai_text || ''));
    if (!parsed) {
      recordBranchSummaryGenerationError();
      recordBranchSummaryGenerationDuration({ durationMs: Date.now() - startedAt, outcome: 'error' });
      return {
        updated: false,
        summary: existingSummary,
        summaryText: typeof existingSummary === 'object' && existingSummary ? buildSummaryText(existingSummary) : '',
        nodeCount,
        totalTokens: Number(response?.usage_json?.total_tokens || 0) || 0,
        provider: providerName || 'unknown',
        model: response?.model || modelToUse,
      };
    }

    const summaryText = buildSummaryText(parsed);
    const totalTokens = Number(response?.usage_json?.total_tokens || 0) || 0;

    await upsertBranchSummary(
      {
        treeId: tree_id,
        branchId: branch_id,
        branchRootNodeId: branch_point,
        branchTipNodeId: ensureId('branch_tip_node_id', allTurns[allTurns.length - 1]?.id || ''),
        summary: parsed,
        summaryText,
        nodeCount,
        totalTokens,
      },
      client
    );

    recordBranchSummaryGenerationSuccess();
    recordBranchSummaryGenerationDuration({ durationMs: Date.now() - startedAt, outcome: 'success' });
    return {
      updated: true,
      summary: parsed,
      summaryText,
      nodeCount,
      totalTokens,
      provider: providerName || 'unknown',
      model: response?.model || modelToUse,
    };
  } catch (error) {
    recordBranchSummaryGenerationError();
    recordBranchSummaryGenerationDuration({ durationMs: Date.now() - startedAt, outcome: 'error' });
    return {
      updated: false,
      summary: existingSummary,
      summaryText: typeof existingSummary === 'object' && existingSummary ? buildSummaryText(existingSummary) : '',
      nodeCount,
      totalTokens: 0,
      provider: providerName || 'unknown',
      model: modelToUse,
    };
  }
}

/**
 * Detect cross-branch references by explicit keywords or semantic similarity.
 * @param {string} userText
 * @param {string} currentBranchId
 * @param {string} treeId
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.client]
 * @param {function} [options.embedder]
 * @param {object} [options.cache]
 * @returns {Promise<Array<{branchId:string, score:number, summary:any, summaryText:string, referenceType:string}>>}
 */
export async function detectCrossBranchReferences(userText, currentBranchId, treeId, options = {}) {
  const text = typeof userText === 'string' ? userText.trim() : '';
  if (!text) return [];
  const tree_id = ensureId('tree_id', treeId);
  const current_branch_id = ensureId('current_branch_id', currentBranchId);

  const opts = options && typeof options.query === 'function' ? { client: options } : options;
  const client = opts?.client || pool;
  const embedder = opts?.embedder || embedText;
  const cache = opts?.cache || embeddingCache;

  recordCrossBranchDetectionAttempt();
  const startedAt = Date.now();
  try {
    const minQueryLength = getCrossBranchMinQueryLength();
    const hasExplicit = hasExplicitBranchMention(text);
    const explicitIds = extractExplicitBranchIds(text);
    if (!hasExplicit && text.length < minQueryLength) {
      recordCrossBranchDetectionMiss();
      recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'miss' });
      return [];
    }

    const maxRefs = getCrossBranchMaxReferences();
    if (explicitIds.length > 0) {
      const { rows: explicitRows } = await client.query(
        `
          SELECT branch_id, summary, summary_text, updated_at
          FROM branch_summaries
          WHERE tree_id = $1
            AND branch_id = ANY($2::text[])
          ORDER BY updated_at DESC
        `,
        [tree_id, explicitIds]
      );

      if (explicitRows && explicitRows.length > 0) {
        const byId = new Map(explicitRows.map((row) => [String(row.branch_id), row]));
        const matched = explicitIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .slice(0, maxRefs)
          .map((row) => ({
            branchId: String(row.branch_id),
            score: 1,
            summary: row.summary ?? null,
            summaryText: typeof row.summary_text === 'string' ? row.summary_text : '',
            referenceType: 'explicit',
          }));

        if (matched.length > 0) {
          recordCrossBranchDetectionHit();
          recordCrossBranchReferenceCount(matched.length);
          recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'hit' });
          return matched;
        }
      }
    }

    const { rows } = await client.query(
      `
        SELECT branch_id, summary, summary_text, updated_at
        FROM branch_summaries
        WHERE tree_id = $1
          AND branch_id <> $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [tree_id, current_branch_id, BRANCH_SUMMARY_CONFIG.maxCandidateSummaries]
    );

    if (!rows || rows.length === 0) {
      recordCrossBranchDetectionMiss();
      recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'miss' });
      return [];
    }

    const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
    const EMBEDDING_MODEL = (process.env.EMBEDDING_MODEL || process.env.EMBEDDING_OPENAI_MODEL || '').trim();
    const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '64', 10) || 64;

    const queryVec = await getCachedEmbedding(text, {
      provider: EMBEDDING_PROVIDER,
      model: EMBEDDING_MODEL,
      dim: EMBEDDING_DIM,
      embedder,
      cache,
    });
    if (!queryVec || queryVec.length === 0) {
      recordCrossBranchDetectionMiss();
      recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'miss' });
      return [];
    }

    const scored = [];
    for (const row of rows) {
      const summaryText = typeof row?.summary_text === 'string' ? row.summary_text : '';
      if (!summaryText) continue;
      const vec = await getCachedEmbedding(summaryText, {
        provider: EMBEDDING_PROVIDER,
        model: EMBEDDING_MODEL,
        dim: EMBEDDING_DIM,
        embedder,
        cache,
      });
      if (!vec || vec.length === 0) continue;
      const score = cosineSimilarity(queryVec, vec);
      scored.push({
        branchId: String(row.branch_id),
        score,
        summary: row.summary ?? null,
        summaryText,
      });
    }

    const threshold = getCrossBranchSimilarityThreshold();
    const filtered = scored
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxRefs)
      .map((item) => ({
        ...item,
        referenceType: hasExplicit ? 'explicit' : 'semantic',
      }));

    if (filtered.length > 0) {
      recordCrossBranchDetectionHit();
      recordCrossBranchReferenceCount(filtered.length);
      recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'hit' });
    } else {
      recordCrossBranchDetectionMiss();
      recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'miss' });
    }

    return filtered;
  } catch (error) {
    recordCrossBranchDetectionError();
    recordCrossBranchDetectionDuration({ durationMs: Date.now() - startedAt, outcome: 'error' });
    return [];
  }
}

/**
 * Record a cross-branch reference event for analytics.
 * @param {object} params
 * @param {string} params.treeId
 * @param {string} params.sourceNodeId
 * @param {string} params.sourceBranchId
 * @param {string} params.referencedBranchId
 * @param {string} params.referenceType
 * @param {number|null} [params.confidenceScore]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 */
export async function recordBranchReference(
  { treeId, sourceNodeId, sourceBranchId, referencedBranchId, referenceType, confidenceScore = null },
  client = pool
) {
  try {
    await client.query(
      `
        INSERT INTO branch_references (
          tree_id, source_node_id, source_branch_id,
          referenced_branch_id, reference_type, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        ensureId('tree_id', treeId),
        ensureId('source_node_id', sourceNodeId),
        ensureId('source_branch_id', sourceBranchId),
        ensureId('referenced_branch_id', referencedBranchId),
        typeof referenceType === 'string' ? referenceType : 'semantic',
        Number.isFinite(confidenceScore) ? confidenceScore : null,
      ]
    );
  } catch (error) {
    // fail-open
  }
}

/**
 * Async updater for branch summaries (fail-open).
 * Intended to be called post-commit (setImmediate).
 */
export async function maybeUpdateBranchSummary({
  pool: poolOverride,
  treeId,
  nodeId,
  userId = null,
  providerHint = null,
  userLanguage = null,
} = {}) {
  const tree_id = ensureId('tree_id', treeId);
  const node_id = ensureId('node_id', nodeId);
  const poolToUse = poolOverride || pool;

  if (!isBranchSummaryEnabled()) {
    recordBranchSummaryGenerationSkipped();
    return { ok: false, skipped: true, reason: 'disabled' };
  }

  if (!poolToUse || typeof poolToUse.connect !== 'function') {
    recordBranchSummaryGenerationSkipped();
    return { ok: false, skipped: true, reason: 'missing_pool' };
  }

  const client = await poolToUse.connect();
  let locked = false;
  let lockedBranchId = null;
  try {
    const branchInfo = await identifyBranch(node_id, tree_id, client);
    lockedBranchId = branchInfo.branchId;
    locked = await tryAcquireBranchSummaryLock(client, branchInfo.branchId);
    if (!locked) {
      recordBranchSummaryGenerationSkipped();
      return { ok: false, skipped: true, reason: 'locked' };
    }

    const currentNodeCount = await countBranchTurns(client, { treeId: tree_id, branchNodes: branchInfo.branchNodes });
    const { needsUpdate, existingSummary, existingNodeCount } = await shouldUpdateBranchSummary(
      tree_id,
      branchInfo.branchId,
      currentNodeCount,
      client
    );

    if (!needsUpdate) {
      recordBranchSummaryGenerationSkipped();
      return { ok: true, skipped: true, reason: 'threshold' };
    }

    const result = await generateBranchSummary({
      treeId: tree_id,
      branchId: branchInfo.branchId,
      branchNodes: branchInfo.branchNodes,
      branchPoint: branchInfo.branchPoint,
      existingSummary,
      existingNodeCount,
      userId,
      providerHint,
      userLanguage,
      client,
    });

    if (BRANCH_SUMMARY_VERBOSE_LOGS) {
      console.log('[P2:BranchSummary]', {
        treeId: tree_id,
        branchId: branchInfo.branchId,
        updated: result?.updated === true,
        nodeCount: result?.nodeCount ?? null,
        provider: result?.provider ?? null,
        model: result?.model ?? null,
      });
    }

    return { ok: true, skipped: false, updated: result?.updated === true };
  } catch (error) {
    recordBranchSummaryGenerationError();
    console.warn('[P2:BranchSummary] update failed:', error?.message || error);
    return { ok: false, skipped: true, reason: 'error' };
  } finally {
    if (locked && lockedBranchId) {
      try {
        await releaseBranchSummaryLock(client, lockedBranchId);
      } catch {
        // fail-open
      }
    }
    client.release();
  }
}

export default {
  identifyBranch,
  shouldUpdateBranchSummary,
  generateBranchSummary,
  detectCrossBranchReferences,
  recordBranchReference,
  isBranchSummaryEnabled,
  maybeUpdateBranchSummary,
};
