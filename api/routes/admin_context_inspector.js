/**
 * Admin Context Inspector API
 * 
 * Provides context debugging capabilities for admin users.
 * Allows inspection of LLM context construction for specific nodes.
 * 
 * Endpoints:
 *   GET /api/admin/context-inspector?tree_id=...&node_id=... - Get context for a specific node
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { HttpError, wrapAsync } from '../lib/errors.js';
import { withTraceId } from '../lib/trace.js';
import { buildLayeredContextSections } from '../services/llm/context_layers.js';
import { detectConversationStage } from '../services/llm/context_stage.js';
import { CONTEXT_MESSAGE_LIMITS } from '../services/llm/context_limits.js';
import { deriveTopicTag } from '../services/topic/topic_tagger.js';
import { classifyIntent } from '../services/llm/intent_classifier.js';

const ROLLING_SUMMARY_FLAG = (process.env.ROLLING_SUMMARY_ENABLED || '0').toLowerCase();
const ROLLING_SUMMARY_ENABLED = ['1', 'true', 'yes', 'on'].includes(ROLLING_SUMMARY_FLAG);

/**
 * Reconstruct the context messages that would be used for this node's LLM call
 * This simulates what buildContextMessages() does in llm/index.js
 */
async function reconstructContextForNode(client, treeId, nodeId) {
  // 1. Get node info
  const nodeResult = await client.query(
    `SELECT n.id, n.parent_id, n.role, n.text, n.topic_tag, n.created_at, n.level,
            ns.parent_summary
     FROM nodes n
     LEFT JOIN node_summaries ns ON n.id = ns.node_id
     WHERE n.id = $1 AND n.tree_id = $2`,
    [nodeId, treeId]
  );

  if (nodeResult.rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'NODE_NOT_FOUND',
      message: 'Node not found',
    });
  }

  const node = nodeResult.rows[0];

  // Only user nodes trigger LLM calls
  if (node.role !== 'user') {
    return {
      node,
      isAiNode: true,
      contextNotApplicable: true,
      message: 'This is an AI node. Context is only applicable for user nodes that trigger LLM calls.',
    };
  }

  // 2. Get tree info
  const treeResult = await client.query(
    `SELECT id, topic, context_profile, memory_scope, tree_summary, user_id
     FROM trees
     WHERE id = $1`,
    [treeId]
  );

  if (treeResult.rows.length === 0) {
    throw new HttpError({
      status: 404,
      code: 'TREE_NOT_FOUND',
      message: 'Tree not found',
    });
  }

  const tree = treeResult.rows[0];
  const profile = tree.context_profile || 'lite';
  const scope = tree.memory_scope || 'branch';
  const limits = CONTEXT_MESSAGE_LIMITS[profile] || CONTEXT_MESSAGE_LIMITS.lite;

  // 3. Get parent node (for parent_summary and parent_full_text)
  let parentSummary = '';
  let parentFullText = '';
  let rollingSummaryText = '';
  let rollingSummaryMeta = null;
  if (node.parent_id) {
    const parentResult = await client.query(
      `SELECT n.text, ns.parent_summary, ns.rolling_summary
       FROM nodes n
       LEFT JOIN node_summaries ns ON n.id = ns.node_id
       WHERE n.id = $1`,
      [node.parent_id]
    );
    if (parentResult.rows.length > 0) {
      parentSummary = parentResult.rows[0].parent_summary || '';
      parentFullText = parentResult.rows[0].text || '';
      if (ROLLING_SUMMARY_ENABLED) {
        const rolling = parentResult.rows[0].rolling_summary;
        if (rolling && typeof rolling === 'object') {
          rollingSummaryText = typeof rolling.text === 'string' ? rolling.text : '';
          rollingSummaryMeta = rolling.meta && typeof rolling.meta === 'object' ? rolling.meta : null;
        }
      }
    }
  }

  // 4. Get breadcrumb (path from root to current node's parent)
  const breadcrumbResult = await client.query(
    `WITH RECURSIVE path AS (
       SELECT n.id, n.parent_id, ns.parent_summary, n.text, n.level, 0 as depth
       FROM nodes n
       LEFT JOIN node_summaries ns ON n.id = ns.node_id
       WHERE n.id = $1
       UNION ALL
       SELECT n.id, n.parent_id, ns.parent_summary, n.text, n.level, p.depth + 1
       FROM nodes n
       LEFT JOIN node_summaries ns ON n.id = ns.node_id
       JOIN path p ON n.id = p.parent_id
     )
     SELECT parent_summary, text FROM path WHERE level > 0 ORDER BY depth DESC`,
    [node.parent_id || nodeId]
  );
  const breadcrumbTitles = breadcrumbResult.rows.map(r => r.parent_summary || r.text || '').filter(Boolean);

  // 5. Get recent turns (last N turns before this node)
  const recentResult = await client.query(
    `SELECT n.role, n.text, ns.parent_summary
     FROM nodes n
     LEFT JOIN node_summaries ns ON n.id = ns.node_id
     WHERE n.tree_id = $1 
       AND n.created_at < $2
       AND n.soft_deleted_at IS NULL
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [treeId, node.created_at, limits.recentTurns + 5] // Get a few extra
  );

  const recentTurns = recentResult.rows.reverse().map(r => ({
    role: r.role,
    text: r.text || '',
    summary: r.parent_summary || '',
  }));

  // 6. Build path_summary (concatenate breadcrumb summaries)
  const pathSummary = breadcrumbTitles.join(' → ');

  // 7. Detect intent
  const intent = classifyIntent({
    userText: node.text,
    recentTurns: recentTurns,
  });

  // 8. Get user language preference
  const userResult = await client.query(
    `SELECT preferred_language FROM users WHERE id = $1`,
    [tree.user_id]
  );
  const userLang = userResult.rows[0]?.preferred_language || 'en';
  const isChinese = userLang.startsWith('zh');

  // 9. Build layered context
  const includeTreeStory = scope === 'tree' && limits.includeTreeStory !== false;
  const treeSummaryInput = includeTreeStory ? (tree.tree_summary || '') : '';
  const treeStoryLimit = includeTreeStory ? limits.treeStoryLimit || 0 : 0;

  const layered = await buildLayeredContextSections({
    scope,
    breadcrumbTitles,
    pathSummary,
    parentSummary,
    parentFullText,
    treeSummary: treeSummaryInput,
    rollingSummary: rollingSummaryText || '',
    recentTurns,
    activeTopicTag: node.topic_tag || null,
    limits: {
      pathSummary: limits.pathSummary,
      parentSummary: limits.parentSummary,
      rollingSummary: limits.rollingSummary || limits.parentSummary,
      parentFull: limits.parentFull,
      recentTurns: limits.recentTurns,
      recentTurnChars: limits.recentTurnChars || limits.parentSummary,
      treeStory: treeStoryLimit,
    },
  }, {
    userText: node.text || '',
    semanticCoreFactsEnabled: process.env.SEMANTIC_CORE_FACTS_ENABLED === 'true',
    profile,
  });

  // T50-0: Labels without behavioral instructions
  const labels = isChinese ? {
    treeStory: '整棵树概况',
    topic: '主题',
    topicTag: '子话题',
    history: '历史摘要',
    coreFacts: '核心要点',
    pathBackground: '路径背景',
    recentDialogue: '近期对话',
  } : {
    treeStory: 'Tree Story',
    topic: 'Topic',
    topicTag: 'Sub-topic',
    history: 'History',
    coreFacts: 'Core Facts',
    pathBackground: 'Path Background',
    recentDialogue: 'Recent Dialogue',
  };

  const contextParts = [];
  if (scope === 'tree' && layered.tree_story) {
    contextParts.push(`${labels.treeStory}: ${layered.tree_story}`);
  }

  const shouldDropPathBackgroundForLite =
    profile === 'lite' &&
    scope === 'tree' &&
    layered.tree_story &&
    layered.path_background &&
    layered.tree_story.length < layered.path_background.length;

  if (tree.topic) {
    const topicLine = node.topic_tag
      ? `${labels.topic}: ${tree.topic} (${labels.topicTag}: ${node.topic_tag})`
      : `${labels.topic}: ${tree.topic}`;
    contextParts.push(topicLine);
  }

  if (layered.core_facts.length) {
    const factLines = layered.core_facts.map((t) => `- ${t}`).join('\n');
    const coreLabel = node.topic_tag ? `${labels.coreFacts} [${labels.topicTag}: ${node.topic_tag}]` : labels.coreFacts;
    contextParts.push(`${coreLabel}:\n${factLines}`);
  }

  if (layered.rolling_summary) {
    contextParts.push(`${labels.history}: ${layered.rolling_summary}`);
  }

  if (layered.recent_dialogue.length) {
    const recentLines = layered.recent_dialogue.map((t) => `- ${t.role}: ${t.text}`).join('\n');
    contextParts.push(`${labels.recentDialogue}:\n${recentLines}`);
  }

  if (layered.path_background && !shouldDropPathBackgroundForLite) {
    contextParts.push(`${labels.pathBackground}: ${layered.path_background}`);
  }

  // T50-0: No instruction added to context parts

  const systemContent = contextParts.join('\n\n');

  // 11. Build messages array (simplified - no narrative frame for now)
  const messages = [];
  if (systemContent) {
    messages.push({
      role: 'system',
      content: systemContent,
    });
  }
  messages.push({
    role: 'user',
    content: node.text,
  });

  // 12. Parse tree_summary if exists
  let treeSummaryParsed = null;
  if (tree.tree_summary) {
    try {
      treeSummaryParsed = typeof tree.tree_summary === 'string'
        ? JSON.parse(tree.tree_summary)
        : tree.tree_summary;
    } catch (e) {
      treeSummaryParsed = { _raw: tree.tree_summary };
    }
  }

  return {
    node: {
      id: node.id,
      parent_id: node.parent_id,
      role: node.role,
      text: node.text,
      summary: node.summary,
      topic_tag: node.topic_tag,
      level: node.level,
      created_at: node.created_at,
    },
    tree: {
      id: tree.id,
      topic: tree.topic,
      context_profile: tree.context_profile,
      memory_scope: tree.memory_scope,
      user_id: tree.user_id,
    },
    context: {
      profile,
      scope,
      limits,
      intent,
      user_language: userLang,
    },
    layers: {
      tree_story: layered.tree_story || null,
      rolling_summary: layered.rolling_summary
        ? {
            text: layered.rolling_summary,
            meta: rollingSummaryMeta,
            compressed_turn_count: Number(rollingSummaryMeta?.compressed_turn_count || 0) || 0,
          }
        : null,
      core_facts: layered.core_facts || [],
      recent_dialogue: layered.recent_dialogue || [],
      path_background: layered.path_background || null,
    },
    tree_summary: treeSummaryParsed,
    messages,
  };
}

export default function createAdminContextInspectorRouter() {
  const router = express.Router();

  /**
   * GET /api/admin/context-inspector
   * Reconstruct and return the context that would be used for a given node's LLM call
   * 
   * Query params:
   *   - tree_id: UUID of the tree
   *   - node_id: UUID of the node (must be a user node)
   * 
   * Returns:
   *   - node: node metadata
   *   - tree: tree metadata
   *   - context: context configuration (profile, scope, limits, intent)
   *   - layers: layered context sections
   *   - tree_summary: parsed tree summary (if exists)
   *   - messages: reconstructed messages array that would be sent to LLM
   */
  router.get('/api/admin/context-inspector', wrapAsync(async (req, res) => {
    withTraceId(req);

    const treeId = req.query.tree_id;
    const nodeId = req.query.node_id;

    if (!treeId || !nodeId) {
      throw new HttpError({
        status: 400,
        code: 'MISSING_PARAMS',
        message: 'tree_id and node_id are required',
      });
    }

    const client = await pool.connect();
    try {
      const result = await reconstructContextForNode(client, treeId, nodeId);
      res.json(result);
    } finally {
      client.release();
    }
  }));

  return router;
}
