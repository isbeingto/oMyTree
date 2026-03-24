import { pool } from '../../db/pool.js';
import { resolveProviderForRequest } from '../llm/providers/index.js';
import { 
  clampText, 
  TREE_SUMMARY_LIMIT, 
  TREE_SUMMARY_INITIAL_THRESHOLD,
  TREE_SUMMARY_REFRESH_INTERVAL,
  TREE_SUMMARY_MIN_REFRESH_MINUTES
} from '../llm/context_limits.js';
import { markTreeSummaryFailure, markTreeSummarySuccess } from '../../lib/tree_summary_metrics.js';
import { parseOpenAiJson } from '../llm/providers/openai.js';

const RECENT_NODE_LIMIT = 12;
const HAN_REGEX = /[\u4e00-\u9fff]/g;
const LATIN_REGEX = /[A-Za-z]/g;
const TREE_SUMMARY_MAX_AGE_MINUTES = 30; // Deprecated: use TREE_SUMMARY_MIN_REFRESH_MINUTES for max age

// T47-1: Incremental update constants
const SUMMARY_VERSION = 3; // v3 = incremental support
const INCREMENTAL_DELTA_THRESHOLD = 20; // If delta >= 20 nodes, force full refresh
const INCREMENTAL_MAX_CONSECUTIVE = 5; // Force full refresh every N incremental updates
const INCREMENTAL_MAX_DAYS = 7; // Force full refresh if no full refresh in N days
const SUMMARY_COMPRESS_THEME_THRESHOLD = 6; // Compress if >= N themes
const SUMMARY_COMPRESS_LENGTH_THRESHOLD = 700; // Compress if text length >= N chars
const INCREMENTAL_NODE_LIMIT = 20; // Max nodes to fetch for incremental update

function normalizeLanguage(value) {
  if (!value || typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return null;
}

function countMatches(text, regex) {
  if (!text || typeof text !== 'string') return 0;
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function detectLanguageFromContent({ topic, recentNodes }) {
  const parts = [];
  if (topic) parts.push(topic);
  recentNodes.forEach((node) => {
    if (node?.text) parts.push(node.text);
    if (node?.path_summary) parts.push(node.path_summary);
    if (node?.parent_summary) parts.push(node.parent_summary);
  });
  const combined = parts.join(' ');
  const hanCount = countMatches(combined, HAN_REGEX);
  const latinCount = countMatches(combined, LATIN_REGEX);
  const totalAlpha = hanCount + latinCount;

  if (hanCount >= 3) {
    return 'zh-CN';
  }
  if (latinCount >= 5 && latinCount > hanCount * 1.1) {
    return 'en';
  }
  return null;
}

function selectTargetLanguage({ preferredLanguage, topic, recentNodes }) {
  const normalizedPref = normalizeLanguage(preferredLanguage);
  if (normalizedPref === 'zh-CN') return 'zh-CN';
  const detected = detectLanguageFromContent({ topic, recentNodes });
  if (detected) return detected;
  if (normalizedPref) return normalizedPref;
  return 'en';
}

function buildTreeSummaryPrompt({ topic, recentNodes, branchCount, nodeCount, targetLanguage }) {
  const targetLang = targetLanguage || 'en';
  const lines = [
    `Target language: ${targetLang}`,
    topic ? `Root topic: ${topic}` : 'Root topic: (none)',
    `Stats: nodes=${nodeCount ?? 'unknown'}, branches=${branchCount ?? 'unknown'}`,
    'Task: Produce a structured tree summary JSON capturing themes (topics), facts, and open questions.',
    'JSON schema:',
    `{
  "lang": "<target language code>",
  "themes": [
    {
      "name": "string (theme name)",
      "facts": ["key fact 1", "key fact 2"],
      "questions": ["unresolved question 1"]
    }
  ]
}`,
    'Rules: keep 2-6 themes; each theme 1-5 facts; questions are optional; avoid duplicate facts; keep concise phrases; do not include node ids; no Markdown; output only JSON.',
  ];

  recentNodes.forEach((node, idx) => {
    const text = clampText(node.text || '', 240);
    const pathSummary = clampText(node.path_summary || '', 200);
    const parentSummary = clampText(node.parent_summary || '', 200);
    const pieces = [
      `#${idx + 1} ${node.role || 'user'}`,
      text ? `text: ${text}` : null,
      pathSummary ? `path_summary: ${pathSummary}` : null,
      parentSummary ? `parent_summary: ${parentSummary}` : null,
    ].filter(Boolean);
    if (pieces.length) {
      lines.push(pieces.join(' | '));
    }
  });

  return lines.join('\n');
}

// T47-1: Build incremental update prompt
function buildIncrementalPrompt({ oldSummary, newNodes, topic, nodeCount, targetLanguage }) {
  const targetLang = targetLanguage || 'en';
  const meta = oldSummary.meta || {};
  const lastNodeCount = Number(meta.last_node_count || 0);
  const newNodesCount = nodeCount - lastNodeCount;
  
  const lines = [
    `Target language: ${targetLang}`,
    'Task: Update existing tree summary with NEW nodes added since last update.',
    '',
    '=== EXISTING SUMMARY ===',
    JSON.stringify(oldSummary.semantic, null, 2),
    '',
    '=== TREE CONTEXT ===',
    `Root topic: ${topic || '(none)'}`,
    `Total nodes now: ${nodeCount}`,
    `Last summary covered: ${lastNodeCount} nodes`,
    `New nodes added: ${newNodesCount}`,
    '',
    '=== NEW NODES (since last update) ===',
  ];
  
  newNodes.forEach((node, idx) => {
    const text = clampText(node.text || '', 240);
    const pathSummary = clampText(node.path_summary || '', 200);
    const pieces = [
      `#${idx + 1} ${node.role || 'user'}`,
      text ? `text: ${text}` : null,
      pathSummary ? `path_summary: ${pathSummary}` : null,
    ].filter(Boolean);
    if (pieces.length) {
      lines.push(pieces.join(' | '));
    }
  });
  
  lines.push(
    '',
    '=== INSTRUCTIONS ===',
    '1. Identify new themes/facts/questions from NEW NODES',
    '2. Merge them into EXISTING SUMMARY:',
    '   - If new content fits existing theme: add facts to that theme',
    '   - If new content is distinct: create new theme (max 7 themes total)',
    '3. Keep existing themes unless contradicted by new nodes',
    '4. Remove redundant facts across themes',
    '5. Keep summary concise (target: 2-6 themes, 1-5 facts per theme)',
    '6. Output only updated JSON (same schema as existing summary)',
    '',
    'JSON schema:',
    `{
  "lang": "${targetLang}",
  "themes": [
    {
      "name": "string",
      "facts": ["fact 1", "fact 2"],
      "questions": ["question 1"]
    }
  ]
}`,
  );
  
  return lines.join('\n');
}

// T47-1: Build compress prompt (when summary is too long)
function buildCompressPrompt({ oldSummary, topic, nodeCount, targetLanguage }) {
  const targetLang = targetLanguage || 'en';
  
  const lines = [
    `Target language: ${targetLang}`,
    'Task: COMPRESS existing tree summary (too long, too many themes).',
    '',
    '=== CURRENT SUMMARY (too long) ===',
    JSON.stringify(oldSummary.semantic, null, 2),
    '',
    '=== TREE CONTEXT ===',
    `Root topic: ${topic || '(none)'}`,
    `Total nodes: ${nodeCount}`,
    '',
    '=== INSTRUCTIONS ===',
    '1. Merge similar themes (reduce to MAX 5 themes)',
    '2. Keep only most important facts (2-4 per theme)',
    '3. Remove redundant/trivial facts',
    '4. Keep open questions only if critical',
    '5. Output compressed JSON',
    '',
    'Target output length: ~400-600 characters display text',
    '',
    'JSON schema:',
    `{
  "lang": "${targetLang}",
  "themes": [
    {
      "name": "string",
      "facts": ["fact 1", "fact 2"],
      "questions": ["question 1"]
    }
  ]
}`,
  ];
  
  return lines.join('\n');
}

function parseSemanticSummary(aiText) {
  if (!aiText || typeof aiText !== 'string') {
    throw new Error('empty tree summary');
  }
  let parsed = null;
  try {
    parsed = JSON.parse(aiText);
  } catch (err) {
    parsed = parseOpenAiJson(aiText);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('failed to parse tree summary JSON');
  }
  if (!Array.isArray(parsed.themes)) {
    throw new Error('tree summary missing themes array');
  }
  return parsed;
}

function buildDisplayText(semantic) {
  if (!semantic || !Array.isArray(semantic.themes)) return '';
  const themeNames = semantic.themes.map((t) => t?.name).filter(Boolean).slice(0, 5);
  const questions = [];
  semantic.themes.forEach((t) => {
    if (Array.isArray(t?.questions)) {
      t.questions.forEach((q) => {
        if (q && questions.length < 5) questions.push(q);
      });
    }
  });
  const parts = [];
  if (themeNames.length) {
    parts.push(`Themes: ${themeNames.join(' / ')}`);
  }
  if (questions.length) {
    parts.push(`Open questions: ${questions.join('; ')}`);
  }
  return clampText(parts.join(' · '), 320);
}

// T47-1: Select update mode (full, incremental, incremental-compress)
function selectUpdateMode(treeRow, { topicTag } = {}) {
  const summary = treeRow?.tree_summary;
  const nodeCount = Number(treeRow?.node_count || 0);
  
  // 1. First-time generation → full
  if (!summary || !summary.semantic) {
    return 'full';
  }
  
  const meta = summary.meta || {};
  const lastNodeCount = Number(meta.last_node_count || 0);
  const delta = nodeCount - lastNodeCount;
  
  // 2. Topic switch → full
  if (topicTag && meta.last_topic_tag && topicTag !== meta.last_topic_tag) {
    return 'full';
  }
  
  // 3. Large delta (>= 20 nodes) → full
  if (delta >= INCREMENTAL_DELTA_THRESHOLD) {
    return 'full';
  }
  
  // 4. Old summary version (< 3) → full
  if (!meta.version || meta.version < SUMMARY_VERSION) {
    return 'full';
  }
  
  // 5. Too many consecutive incremental updates → full
  const incrementalCount = Number(meta.incremental_count || 0);
  if (incrementalCount >= INCREMENTAL_MAX_CONSECUTIVE) {
    return 'full';
  }
  
  // 6. Last full refresh too old → full
  if (meta.last_full_refresh_at) {
    const lastFullMs = new Date(meta.last_full_refresh_at).getTime();
    const ageMs = Date.now() - lastFullMs;
    const maxAgeMs = INCREMENTAL_MAX_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return 'full';
    }
  }
  
  // 7. Summary too long or too many themes → compress
  const themeCount = summary.semantic?.themes?.length || 0;
  const summaryLength = summary.text?.length || 0;
  if (themeCount >= SUMMARY_COMPRESS_THEME_THRESHOLD && summaryLength >= SUMMARY_COMPRESS_LENGTH_THRESHOLD) {
    return 'incremental-compress';
  }
  
  // 8. Default → incremental
  return 'incremental';
}

function shouldRefresh(treeRow, { topicTag } = {}) {
  const nodeCount = Number(treeRow?.node_count || 0);
  const summary = treeRow?.tree_summary;
  
  // First-time generation: require minimum threshold
  if (!summary) {
    return nodeCount >= TREE_SUMMARY_INITIAL_THRESHOLD;
  }
  
  if (!nodeCount) return false;

  const meta = summary.meta || {};
  const updatedAt = summary.updated_at ? new Date(summary.updated_at) : null;
  const ageMs = updatedAt ? Date.now() - updatedAt.getTime() : Infinity;
  
  // Rate limiting: don't refresh too frequently
  const minRefreshMs = TREE_SUMMARY_MIN_REFRESH_MINUTES * 60 * 1000;
  if (ageMs < minRefreshMs) {
    return false; // Too soon since last refresh
  }
  
  // Topic switch: high priority refresh
  if (topicTag && meta.last_topic_tag && topicTag !== meta.last_topic_tag) {
    return true;
  }
  
  // Node count increment
  const lastNodeCount = Number(meta.last_node_count || 0);
  if (nodeCount - lastNodeCount >= TREE_SUMMARY_REFRESH_INTERVAL) {
    return true;
  }
  
  // Max staleness: force refresh if very old
  if (ageMs > TREE_SUMMARY_MAX_AGE_MINUTES * 60 * 1000) {
    return true;
  }
  
  return false;
}

function extractSummaryText(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return raw.text || raw.summary || raw.content || '';
  return '';
}

function sanitizeErrorMessage(err) {
  const msg = (err && err.message) || String(err) || 'tree summary failed';
  return clampText(msg.replace(/\s+/g, ' ').trim(), 240);
}

// T47-1: Main update function with mode selection
export async function updateTreeSummary(treeId, { userId, providerHint, topicTag = null, forceMode = null } = {}) {
  const client = await pool.connect();
  let selectedMode = forceMode || null;
  try {
    // Fetch tree row to determine update mode
    const { rows: treeRows } = await client.query(
      'SELECT id, topic, node_count, branch_count, user_id, context_profile, tree_summary FROM trees WHERE id = $1 LIMIT 1',
      [treeId]
    );
    if (!treeRows.length) {
      throw new Error(`tree not found: ${treeId}`);
    }
    const treeRow = treeRows[0];
    
    // Select update mode
    const mode = forceMode || selectUpdateMode(treeRow, { topicTag });
    selectedMode = mode;
    
    // Execute update based on mode
    let result;
    if (mode === 'full') {
      result = await fullRefresh(client, treeRow, { userId, providerHint, topicTag });
    } else if (mode === 'incremental') {
      result = await incrementalRefresh(client, treeRow, { userId, providerHint, topicTag, compress: false });
    } else if (mode === 'incremental-compress') {
      result = await incrementalRefresh(client, treeRow, { userId, providerHint, topicTag, compress: true });
    } else {
      throw new Error(`unknown update mode: ${mode}`);
    }
    
    return result;
  } catch (err) {
    const errorText = sanitizeErrorMessage(err);
    // Try fallback to full refresh if incremental failed
    if (err.message && err.message.includes('incremental') && !forceMode) {
      console.warn('[treeSummary] incremental update failed, falling back to full:', err.message);
      try {
        const { rows } = await client.query(
          'SELECT id, topic, node_count, branch_count, user_id, context_profile, tree_summary FROM trees WHERE id = $1 LIMIT 1',
          [treeId]
        );
        if (rows.length) {
          return await fullRefresh(client, rows[0], { userId, providerHint, topicTag, fallback: true });
        }
      } catch (fallbackErr) {
        console.error('[treeSummary] fallback to full also failed:', fallbackErr.message);
        // fullRefresh 会尽力持久化 last_error；这里返回 ok=false 给调用方
        return { ok: false, mode: selectedMode || 'unknown', error: sanitizeErrorMessage(fallbackErr) };
      }
    }

    // Best-effort persist last_error for non-full paths (e.g. forced incremental)
    try {
      await client.query(
        `UPDATE trees
            SET tree_summary_last_error = $2,
                tree_summary_last_error_at = now()
          WHERE id = $1`,
        [treeId, errorText]
      );
    } catch (persistErr) {
      console.warn('[treeSummary] failed to persist last_error:', persistErr?.message || persistErr);
    }

    return { ok: false, mode: selectedMode || 'unknown', error: errorText };
  } finally {
    client.release();
  }
}

// T47-1: Full refresh (original logic)
async function fullRefresh(client, treeRow, { userId, providerHint, topicTag = null, fallback = false } = {}) {
  let providerName = 'unknown';
  let contextProfile = 'unknown';
  try {
    const treeId = treeRow.id;
    const { rows: userRows } = await client.query(
      'SELECT preferred_language FROM users WHERE id = $1 LIMIT 1',
      [treeRow.user_id]
    );
    const tree = {
      ...treeRow,
      preferred_language: userRows.length ? userRows[0].preferred_language : null,
    };
    contextProfile = tree?.context_profile || 'unknown';

    const { rows: recentNodes } = await client.query(
      `
      SELECT n.role, n.text, ns.path_summary, ns.parent_summary
      FROM nodes n
      LEFT JOIN node_summaries ns ON ns.node_id = n.id
      WHERE n.tree_id = $1 AND n.soft_deleted_at IS NULL
      ORDER BY n.created_at DESC
      LIMIT $2
      `,
      [treeId, RECENT_NODE_LIMIT]
    );

    const targetLanguage = selectTargetLanguage({
      preferredLanguage: tree.preferred_language,
      topic: tree.topic,
      recentNodes,
    });

    const prompt = buildTreeSummaryPrompt({
      topic: tree.topic,
      recentNodes,
      branchCount: tree.branch_count,
      nodeCount: tree.node_count,
      targetLanguage,
    });

    const { provider, name, defaultModel } = await resolveProviderForRequest({
      providerHint: providerHint || null,
      userId,
    });

    providerName = name || 'unknown';

    const result = await provider.callChat({
      prompt,
      options: {
        temperature: 0.2,
        mode: 'tree_summary',
        model: defaultModel,
      },
    });

    const semantic = parseSemanticSummary(result?.ai_text || '');
    const displayText = buildDisplayText(semantic);

    await client.query(
      `
      UPDATE trees
         SET tree_summary = jsonb_build_object(
           'text', $2::text,
           'semantic', $3::jsonb,
           'provider', $4::text,
           'model', $5::text,
           'meta', jsonb_build_object(
             'version', $6::int,
             'last_topic_tag', $7::text,
             'last_node_count', $8::int,
             'target_language', $9::text,
             'update_mode', $10::text,
             'incremental_count', 0,
             'last_full_refresh_at', now(),
             'node_coverage_start', GREATEST(1, $8::int - $11::int),
             'node_coverage_end', $8::int
           ),
           'updated_at', now()
         ),
            tree_summary_last_error = NULL,
            tree_summary_last_error_at = NULL
       WHERE id = $1
      `,
      [
        treeId,
        displayText,
        JSON.stringify(semantic),
        name,
        result?.model || defaultModel || null,
        SUMMARY_VERSION,
        topicTag || null,
        tree.node_count || 0,
        targetLanguage,
        fallback ? 'full-fallback' : 'full',
        RECENT_NODE_LIMIT,
      ]
    );

    markTreeSummarySuccess(providerName, contextProfile);
    return {
      ok: true,
      mode: fallback ? 'full-fallback' : 'full',
      provider: name,
      model: result?.model || defaultModel || null,
      text: displayText,
      semantic,
      targetLanguage,
    };
  } catch (err) {
    const errorText = sanitizeErrorMessage(err);
    console.warn('[treeSummary] full refresh failed:', err?.message || err);
    try {
      await client.query(
        `UPDATE trees
            SET tree_summary_last_error = $2,
                tree_summary_last_error_at = now()
          WHERE id = $1`,
        [treeRow.id, errorText]
      );
    } catch (persistErr) {
      console.warn('[treeSummary] failed to persist last_error:', persistErr?.message || persistErr);
    }
    markTreeSummaryFailure(providerName, contextProfile);
    throw err; // Re-throw for fallback handling
  }
}

// T47-1: Incremental refresh (update based on new nodes)
async function incrementalRefresh(client, treeRow, { userId, providerHint, topicTag = null, compress = false } = {}) {
  let providerName = 'unknown';
  let contextProfile = 'unknown';
  try {
    const treeId = treeRow.id;
    const oldSummary = treeRow.tree_summary;
    
    if (!oldSummary || !oldSummary.semantic) {
      throw new Error('incremental update requires existing summary');
    }
    
    const { rows: userRows } = await client.query(
      'SELECT preferred_language FROM users WHERE id = $1 LIMIT 1',
      [treeRow.user_id]
    );
    const tree = {
      ...treeRow,
      preferred_language: userRows.length ? userRows[0].preferred_language : null,
    };
    contextProfile = tree?.context_profile || 'unknown';
    
    const targetLanguage = selectTargetLanguage({
      preferredLanguage: tree.preferred_language,
      topic: tree.topic,
      recentNodes: [], // Not used for language detection in incremental mode
    });
    
    let prompt;
    if (compress) {
      // Compress mode: no need to fetch new nodes
      prompt = buildCompressPrompt({
        oldSummary,
        topic: tree.topic,
        nodeCount: tree.node_count,
        targetLanguage,
      });
    } else {
      // Incremental mode: fetch nodes since last update
      const meta = oldSummary.meta || {};
      const lastNodeCount = Number(meta.last_node_count || 0);
      
      const { rows: newNodes } = await client.query(
        `
        SELECT n.role, n.text, ns.path_summary, ns.parent_summary
        FROM nodes n
        LEFT JOIN node_summaries ns ON ns.node_id = n.id
        WHERE n.tree_id = $1 AND n.soft_deleted_at IS NULL
        ORDER BY n.created_at ASC
        OFFSET $2
        LIMIT $3
        `,
        [treeId, lastNodeCount, INCREMENTAL_NODE_LIMIT]
      );
      
      if (!newNodes.length) {
        console.warn('[treeSummary] no new nodes for incremental update');
        return {
          ok: true,
          mode: 'incremental-skipped',
          provider: oldSummary.provider,
          model: oldSummary.model,
          text: oldSummary.text,
          semantic: oldSummary.semantic,
          targetLanguage,
        };
      }
      
      prompt = buildIncrementalPrompt({
        oldSummary,
        newNodes,
        topic: tree.topic,
        nodeCount: tree.node_count,
        targetLanguage,
      });
    }
    
    const { provider, name, defaultModel } = await resolveProviderForRequest({
      providerHint: providerHint || null,
      userId,
    });
    
    providerName = name || 'unknown';
    
    const result = await provider.callChat({
      prompt,
      options: {
        temperature: 0.2,
        mode: compress ? 'tree_summary_compress' : 'tree_summary_incremental',
        model: defaultModel,
      },
    });
    
    const semantic = parseSemanticSummary(result?.ai_text || '');
    const displayText = buildDisplayText(semantic);
    
    // Update metadata for incremental mode
    const oldMeta = oldSummary.meta || {};
    const incrementalCount = compress ? 0 : Number(oldMeta.incremental_count || 0) + 1;
    
    await client.query(
      `
      UPDATE trees
         SET tree_summary = jsonb_build_object(
           'text', $2::text,
           'semantic', $3::jsonb,
           'provider', $4::text,
           'model', $5::text,
           'meta', jsonb_build_object(
             'version', $6::int,
             'last_topic_tag', $7::text,
             'last_node_count', $8::int,
             'target_language', $9::text,
             'update_mode', $10::text,
             'incremental_count', $11::int,
             'last_full_refresh_at', $12::timestamptz,
             'node_coverage_start', $13::int,
             'node_coverage_end', $8::int
           ),
           'updated_at', now()
         ),
            tree_summary_last_error = NULL,
            tree_summary_last_error_at = NULL
       WHERE id = $1
      `,
      [
        treeId,
        displayText,
        JSON.stringify(semantic),
        name,
        result?.model || defaultModel || null,
        SUMMARY_VERSION,
        topicTag || oldMeta.last_topic_tag || null,
        tree.node_count || 0,
        targetLanguage,
        compress ? 'incremental-compress' : 'incremental',
        incrementalCount,
        oldMeta.last_full_refresh_at || new Date().toISOString(),
        oldMeta.node_coverage_start || 1,
      ]
    );
    
    markTreeSummarySuccess(providerName, contextProfile);
    return {
      ok: true,
      mode: compress ? 'incremental-compress' : 'incremental',
      provider: name,
      model: result?.model || defaultModel || null,
      text: displayText,
      semantic,
      targetLanguage,
      incrementalCount,
    };
  } catch (err) {
    const errorText = sanitizeErrorMessage(err);
    console.warn('[treeSummary] incremental refresh failed:', err?.message || err);
    markTreeSummaryFailure(providerName, contextProfile);
    throw err; // Re-throw for fallback handling
  }
}

export async function maybeRefreshTreeSummary(treeId, { userId, providerHint } = {}) {
  try {
    const { rows } = await pool.query(
      'SELECT tree_summary, node_count FROM trees WHERE id = $1 LIMIT 1',
      [treeId]
    );
    const row = rows[0];
    if (!row) return;
    const topicTag = arguments?.[1]?.topicTag || null; // backward safe
    if (!shouldRefresh(row, { topicTag })) return;
    await updateTreeSummary(treeId, { userId, providerHint, topicTag });
  } catch (err) {
    console.warn('[treeSummary] refresh failed:', err?.message || err);
  }
}

export function getTreeSummaryText(raw) {
  return extractSummaryText(raw);
}

// Exposed for tests to validate language selection heuristics and v3 logic
export const __private__ = {
  normalizeLanguage,
  detectLanguageFromContent,
  selectTargetLanguage,
  selectUpdateMode,
  buildIncrementalPrompt,
  buildCompressPrompt,
};
