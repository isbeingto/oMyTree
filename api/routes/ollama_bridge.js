/**
 * Ollama Client-Side Bridge
 *
 * 当 Ollama 运行在用户本地电脑上（而非服务器）时，LLM 调用需要在浏览器端完成。
 * 这些端点提供"准备 → 保存"两阶段流程：
 *
 *   POST /api/turn/prepare-ollama            — 准备上下文（不调用 LLM）
 *   POST /api/turn/save-ollama               — 保存浏览器端 LLM 调用的结果
 *   POST /api/tree/start-root/prepare-ollama — 新建树 + 准备上下文
 *
 * 浏览器端流程：
 *   1. 调用 prepare → 获得 messages 数组
 *   2. 浏览器直接调用用户本地 Ollama (/v1/chat/completions)
 *   3. 流式显示结果
 *   4. 调用 save → 持久化 AI 响应
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getStrictAuthUserId, isDemoUserId } from '../lib/auth_user.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { withTraceId } from '../lib/trace.js';
import { buildContextMessages, generateTreeTopic } from '../services/llm/index.js';
import {
  buildRelevanceContext,
  ensureTreeOwnership,
  resolveActiveParent,
  isNativeFileProvider,
} from '../services/turn/create.js';
import { resolveProviderForRequest } from '../services/llm/providers/index.js';
import { saveLens } from '../services/lens/update.js';
import { recordUsage } from '../services/quota_service.js';
import { recomputeTreeCountersWithPool } from '../services/tree/counters.js';
import { maybeRefreshTreeSummary } from '../services/tree/tree_summary.js';
import { maybeUpdateRollingSummary } from '../services/llm/rolling_summary.js';
import { maybeUpdateBranchSummary } from '../services/llm/branch_summary.js';
import { classifyIntent } from '../services/llm/intent_classifier.js';
import { deriveTopicTag } from '../services/topic/topic_tagger.js';
import bus from '../bus/event_bus.js';
import growthLimits from '../config/growth_limits.js';
import { getUploadsTextForContext, formatUploadsForPrompt } from '../services/uploads/upload_service.js';
import { extractMemoryPatchFromText, persistMemoryPatch, persistFallbackNote } from '../services/semantic/memory_patch.js';
import { checkUsageLimits } from '../services/usage_limits.js';

function invalid(res, status, code, message) {
  return res.status(status).json(
    withTraceId(res, { ok: false, error: code, message })
  );
}

export default function createOllamaBridgeRouter() {
  const router = express.Router();

  /**
   * POST /api/turn/prepare-ollama
   *
   * 准备一个 Turn 的上下文：创建用户节点、构建 messages 数组、但不调用 LLM。
   * 返回 messages 数组给浏览器，由浏览器直接调用用户本地 Ollama。
   */
  router.post('/api/turn/prepare-ollama', async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
      const userId = await getStrictAuthUserId(req, client);
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot use Ollama');
      }

      const {
        tree_id, node_id, user_text,
        provider, model,
        upload_ids,
        knowledge, knowledge_base_ids,
        context_profile, memory_scope,
      } = req.body || {};

      const treeId = typeof tree_id === 'string' ? tree_id.trim() : '';
      const userText = typeof user_text === 'string' ? user_text.trim() : '';
      if (!treeId) return invalid(res, 422, 'INVALID_TREE_ID', 'tree_id is required');
      if (!userText) return invalid(res, 422, 'EMPTY_USER_TEXT', 'user_text cannot be empty');

      // Verify tree ownership
      const treeMeta = await ensureTreeOwnership(client, treeId, userId);
      const effectiveContextProfile = context_profile || treeMeta.context_profile || 'lite';
      const effectiveMemoryScope = memory_scope || treeMeta.memory_scope || 'branch';

      // Resolve parent node
      const parentNode = await resolveActiveParent(client, { treeId, requestedParentId: node_id });
      const resolvedParentId = parentNode.id;
      const userNodeLevel = (parentNode.level || 0) + 1;

      // Depth limit
      if (growthLimits.maxDepth > 0 && userNodeLevel > growthLimits.maxDepth) {
        return invalid(res, 422, 'DEPTH_LIMIT', `Max depth ${growthLimits.maxDepth} exceeded`);
      }

      // Build relevance context (root topic, breadcrumbs, recent turns, summaries, etc.)
      const relevanceContext = await buildRelevanceContext(client, {
        treeId,
        parentId: resolvedParentId,
        parentText: parentNode.text || '',
        userId,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
      });

      // Intent / topic tag (best-effort)
      let detectedIntent = null;
      let topicTag = null;
      try {
        detectedIntent = await classifyIntent(userText, { context: relevanceContext.rootTopic });
      } catch { /* non-critical */ }
      try {
        topicTag = await deriveTopicTag(userText, {
          rootTopic: relevanceContext.rootTopic,
          parentTag: parentNode.topic_tag || null,
        });
      } catch { /* non-critical */ }

      // Create user node + turn in a transaction
      await client.query('BEGIN');
      inTransaction = true;

      const { rows: [userNodeRow] } = await client.query(
        `INSERT INTO nodes (tree_id, parent_id, level, role, text, topic_tag)
         VALUES ($1, $2, $3, 'user', $4, $5)
         RETURNING id, tree_id, parent_id, level, role, text, topic_tag, created_at`,
        [treeId, resolvedParentId, userNodeLevel, userText, topicTag]
      );
      const userNodeId = userNodeRow.id;

      const { rows: [turnRow] } = await client.query(
        `INSERT INTO turns (node_id, user_text, status, provider, model, is_byok, intent)
         VALUES ($1, $2, 'pending_ollama', 'ollama', $3, false, $4)
         RETURNING id`,
        [userNodeId, userText, model || null, detectedIntent]
      );
      const turnId = turnRow.id;

      // Link uploads
      const resolvedUploadIds = Array.isArray(upload_ids) ? upload_ids.filter(Boolean) : [];
      if (resolvedUploadIds.length > 0) {
        for (const uid of resolvedUploadIds) {
          await client.query(
            `INSERT INTO turn_uploads (turn_id, upload_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [turnId, uid]
          );
        }
      }

      // Save lens for user node
      try {
        const breadcrumbs = relevanceContext.breadcrumbTitles || [];
        const pathSummary = [...breadcrumbs, userText.slice(0, 50)].join(' → ').slice(0, 140);
        await saveLens(userNodeId, {
          path_summary: pathSummary,
          parent_summary: userText.slice(0, 120),
          updated_by: 'user',
          userId,
        }, client);
      } catch { /* non-critical */ }

      await client.query('COMMIT');
      inTransaction = false;

      // Emit events
      bus.emit('node.created', { tree_id: treeId, node_id: userNodeId, payload: { role: 'user', level: userNodeLevel } });

      // Handle file uploads — extract text for non-native providers (Ollama = non-native)
      let userTextWithUploads = userText;
      if (resolvedUploadIds.length > 0) {
        try {
          const uploadedTexts = await getUploadsTextForContext(resolvedUploadIds);
          if (uploadedTexts.length > 0) {
            const uploadedContent = formatUploadsForPrompt(uploadedTexts);
            userTextWithUploads = userText + '\n\n' + uploadedContent;
          }
        } catch (err) {
          console.warn('[ollama-bridge] Failed to process uploads:', err.message);
        }
      }

      // Build context messages
      const parentSummary = relevanceContext.parentSummary || {};
      const contextPayload = {
        tree_id: treeId,
        node_id: resolvedParentId,
        user_text: userTextWithUploads,
        query_text: userText,
        path_summary: parentSummary.path_summary ?? null,
        parent_summary: parentSummary.parent_summary ?? null,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
        root_topic: relevanceContext.rootTopic ?? null,
        breadcrumb_titles: relevanceContext.breadcrumbTitles ?? [],
        parent_full_text: relevanceContext.parentFullText ?? parentSummary.parent_summary ?? null,
        tree_summary_text: relevanceContext.treeSummary ?? null,
        rolling_summary: relevanceContext.rollingSummary ?? null,
        recent_turns: relevanceContext.recentTurns ?? [],
        user_language: treeMeta?.preferred_language || 'en',
        topic_tag: topicTag,
        intent: detectedIntent,
        knowledge: knowledge || null,
        knowledge_base_ids: Array.isArray(knowledge_base_ids) ? knowledge_base_ids : [],
      };

      const { messages, citations } = await buildContextMessages(contextPayload, {
        returnCitations: true,
        providerName: 'ollama',
        model: model || '',
      });

      console.log(`[ollama-bridge] Prepared turn ${turnId} for tree ${treeId}: ${messages.length} messages`);

      return res.json(withTraceId(res, {
        ok: true,
        turn_id: turnId,
        user_node: {
          id: userNodeRow.id,
          tree_id: userNodeRow.tree_id,
          parent_id: userNodeRow.parent_id,
          level: userNodeRow.level,
          role: userNodeRow.role,
          text: userNodeRow.text,
          topic_tag: userNodeRow.topic_tag,
          created_at: userNodeRow.created_at,
        },
        tree_id: treeId,
        messages,
        citations: citations || [],
        model: model || null,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
      }));
    } catch (error) {
      if (inTransaction) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      console.error('[ollama-bridge] prepare failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'PREPARE_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/turn/cancel-ollama
   *
   * 取消一个 pending_ollama 的 Turn（Ollama 不可用、连接失败等场景）。
   * 将 Turn 标记为 'failed'，并可选清理孤立的 tree（如果是新树且只有 1 个 node）。
   *
   * Body: { turn_id, reason? }
   */
  router.post('/api/turn/cancel-ollama', async (req, res) => {
    try {
      const userId = await getStrictAuthUserId(req, pool);
      const { turn_id, reason } = req.body || {};
      if (!turn_id) return invalid(res, 422, 'MISSING_TURN_ID', 'turn_id is required');

      // Verify turn exists and belongs to user
      const { rows: turnRows } = await pool.query(
        `SELECT t.id, t.status, t.node_id, n.tree_id
         FROM turns t
         JOIN nodes n ON n.id = t.node_id
         JOIN trees tr ON tr.id = n.tree_id
         WHERE t.id = $1 AND tr.user_id = $2`,
        [turn_id, userId]
      );

      if (turnRows.length === 0) {
        return invalid(res, 404, 'TURN_NOT_FOUND', 'Turn not found');
      }

      const turn = turnRows[0];
      if (turn.status !== 'pending_ollama') {
        // Already completed or failed — nothing to cancel
        return res.json(withTraceId(res, { ok: true, already_resolved: true, status: turn.status }));
      }

      // Mark turn as failed
      await pool.query(
        `UPDATE turns SET status = 'failed', ai_text = $1 WHERE id = $2`,
        [reason ? `[cancelled] ${reason}` : '[cancelled] Ollama unavailable', turn_id]
      );

      // Check if this was a brand-new tree with only 1 node (root = user question)
      // If so, clean up the tree entirely to avoid orphaned empty trees
      const { rows: nodeCountRows } = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM nodes WHERE tree_id = $1`,
        [turn.tree_id]
      );
      const nodeCount = nodeCountRows[0]?.cnt || 0;
      let treeDeleted = false;
      if (nodeCount <= 1) {
        // New tree with only root node — safe to remove
        await pool.query(`DELETE FROM events WHERE tree_id = $1`, [turn.tree_id]);
        await pool.query(`DELETE FROM turns WHERE id = $1`, [turn_id]);
        await pool.query(`DELETE FROM nodes WHERE tree_id = $1`, [turn.tree_id]);
        await pool.query(`DELETE FROM trees WHERE id = $1`, [turn.tree_id]);
        treeDeleted = true;
        console.log(`[ollama-bridge] Cancelled turn ${turn_id} and deleted orphaned tree ${turn.tree_id}`);
      } else {
        console.log(`[ollama-bridge] Cancelled turn ${turn_id} for tree ${turn.tree_id} (tree kept, ${nodeCount} nodes)`);
      }

      return res.json(withTraceId(res, {
        ok: true,
        turn_id,
        tree_id: turn.tree_id,
        tree_deleted: treeDeleted,
      }));
    } catch (error) {
      console.error('[ollama-bridge] cancel failed:', error);
      return invalid(res, 500, 'CANCEL_FAILED', error.message);
    }
  });

  /**
   * POST /api/turn/save-ollama
   *
   * 保存浏览器端 Ollama 调用的结果：创建 AI 节点，更新 Turn 状态。
   *
   * Body: { turn_id, ai_text, reasoning_text?, usage? }
   */
  router.post('/api/turn/save-ollama', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot save Ollama responses');
      }

      const { turn_id, ai_text, reasoning_text, usage } = req.body || {};
      if (!turn_id) return invalid(res, 422, 'MISSING_TURN_ID', 'turn_id is required');
      if (typeof ai_text !== 'string') return invalid(res, 422, 'MISSING_AI_TEXT', 'ai_text is required');

      // Verify turn ownership and status
      const { rows: turnRows } = await client.query(
        `SELECT t.id, t.node_id, t.user_text, t.status, t.provider, t.model,
                t.intent,
                n.tree_id, n.level, n.parent_id
         FROM turns t
         JOIN nodes n ON n.id = t.node_id
         WHERE t.id = $1`,
        [turn_id]
      );

      if (turnRows.length === 0) {
        return invalid(res, 404, 'TURN_NOT_FOUND', 'Turn not found');
      }

      const turn = turnRows[0];

      // Verify tree ownership
      await ensureTreeOwnership(client, turn.tree_id, userId);

      if (turn.status !== 'pending_ollama') {
        return invalid(res, 409, 'INVALID_STATUS', `Turn is in status '${turn.status}', expected 'pending_ollama'`);
      }

      const aiText = typeof ai_text === 'string' ? ai_text : '';
      const aiReasoning = typeof reasoning_text === 'string' && reasoning_text.length > 0 ? reasoning_text : null;
      const aiNodeLevel = (turn.level || 0) + 1;
      const modelUsed = turn.model || 'unknown';
      const treeId = turn.tree_id;
      const userNodeId = turn.node_id;

      // Extract memory patch from AI text (if present)
      let memoryPatch = null;
      try {
        memoryPatch = extractMemoryPatchFromText(aiText);
      } catch { /* non-critical */ }

      // Create AI node
      const { rows: [aiNodeRow] } = await client.query(
        `INSERT INTO nodes (tree_id, parent_id, level, role, text, reasoning_content, provider, model, is_byok)
         VALUES ($1, $2, $3, 'ai', $4, $5, 'ollama', $6, false)
         RETURNING id, tree_id, parent_id, level, role, text, reasoning_content, created_at, provider, model, is_byok`,
        [treeId, userNodeId, aiNodeLevel, aiText, aiReasoning, modelUsed]
      );

      const aiNode = {
        id: aiNodeRow.id,
        tree_id: aiNodeRow.tree_id,
        parent_id: aiNodeRow.parent_id,
        level: aiNodeRow.level,
        role: aiNodeRow.role,
        text: aiNodeRow.text,
        reasoning_content: aiNodeRow.reasoning_content,
        created_at: aiNodeRow.created_at,
        provider: aiNodeRow.provider,
        model: aiNodeRow.model,
        is_byok: aiNodeRow.is_byok,
      };

      // Update turn status
      const usageJson = usage && typeof usage === 'object' ? usage : {};
      await client.query(
        `UPDATE turns SET ai_text = $1, status = 'completed', usage_json = $2, provider = 'ollama', model = $3, is_byok = false
         WHERE id = $4`,
        [aiText, JSON.stringify(usageJson), modelUsed, turn_id]
      );

      // Save AI node lens
      try {
        const pathSummary = (aiText || '').slice(0, 50);
        const parentSummary = (aiText || '').slice(0, 120);
        await saveLens(aiNode.id, {
          path_summary: pathSummary,
          parent_summary: parentSummary,
          updated_by: `llm:ollama`,
          userId,
        }, pool);
      } catch { /* non-critical */ }

      // Emit events
      bus.emit('node.created', { tree_id: treeId, node_id: aiNode.id, payload: { role: 'ai', level: aiNodeLevel } });
      bus.emit('turn.completed', {
        tree_id: treeId,
        node_id: userNodeId,
        payload: { status: 'completed', ai_node_id: aiNode.id, provider: 'ollama', model: modelUsed },
      });

      // Memory patch persistence
      if (memoryPatch) {
        try {
          await persistMemoryPatch(pool, { treeId, nodeId: aiNode.id, turnId: turn_id, patch: memoryPatch });
        } catch { /* non-critical */ }
      }

      // Record usage (best-effort)
      try {
        await recordUsage({
          userId,
          provider: 'ollama',
          isByok: false,
          model: modelUsed,
          tokensInput: usageJson?.prompt_tokens || null,
          tokensOutput: usageJson?.completion_tokens || null,
          treeId,
          contextProfile: null,
        });
      } catch { /* non-critical */ }

      // Async post-processing
      setImmediate(async () => {
        try { await recomputeTreeCountersWithPool(treeId); } catch {}
        try { await maybeRefreshTreeSummary(treeId, userId); } catch {}
        try { await maybeUpdateRollingSummary({ treeId, nodeId: aiNode.id, userId }); } catch {}
        try { await maybeUpdateBranchSummary({ treeId, nodeId: aiNode.id, userId }); } catch {}
        // Generate tree topic for new trees (first AI response)
        try {
          const { rows: treeRows } = await pool.query(
            'SELECT node_count, topic FROM trees WHERE id = $1',
            [treeId]
          );
          const nodeCount = Number(treeRows[0]?.node_count || 0);
          // Only generate topic for brand-new trees (≤3 nodes = root + user + ai)
          if (nodeCount <= 3 && treeRows[0]) {
            const result = await generateTreeTopic({ user_text: turn.user_text });
            if (result.topic && result.provider !== 'fallback') {
              await pool.query('UPDATE trees SET topic = $1 WHERE id = $2', [result.topic, treeId]);
              console.log(`[ollama-bridge] Updated tree ${treeId} topic to: "${result.topic}"`);
            }
          }
        } catch (topicErr) {
          console.warn('[ollama-bridge] topic generation failed:', topicErr?.message);
        }
      });

      console.log(`[ollama-bridge] Saved turn ${turn_id}: aiNode=${aiNode.id} model=${modelUsed}`);

      return res.json(withTraceId(res, {
        ok: true,
        turn_id,
        ai_node: aiNode,
        turn: {
          id: turn_id,
          node_id: userNodeId,
          user_text: turn.user_text,
          ai_text: aiText,
          status: 'completed',
          provider: 'ollama',
          model: modelUsed,
          is_byok: false,
        },
      }));
    } catch (error) {
      console.error('[ollama-bridge] save failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'SAVE_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/tree/start-root/prepare-ollama
   *
   * 新建树 + 准备第一条消息的上下文（不调用 LLM）。
   */
  router.post('/api/tree/start-root/prepare-ollama', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, pool);
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot use Ollama');
      }

      const {
        user_text,
        provider, model,
        context_profile, memory_scope,
        upload_ids,
        knowledge, knowledge_base_ids,
      } = req.body || {};

      const userText = typeof user_text === 'string' ? user_text.trim() : '';
      if (!userText) return invalid(res, 422, 'EMPTY_USER_TEXT', 'user_text is required');

      const effectiveContextProfile = context_profile || 'lite';
      const effectiveMemoryScope = memory_scope || 'branch';
      const tempTopic = userText.length > 50 ? `${userText.slice(0, 50)}...` : userText;

      // Create tree + root node in transaction
      await client.query('BEGIN');

      const { rows: [tree] } = await client.query(
        `INSERT INTO trees(topic, created_by, status, user_id, context_profile, memory_scope)
         VALUES ($1, 'user', 'active', $2, $3, $4)
         RETURNING id, topic, created_by, status, created_at, user_id, context_profile, memory_scope`,
        [tempTopic, userId, effectiveContextProfile, effectiveMemoryScope]
      );

      const { rows: [rootNode] } = await client.query(
        `INSERT INTO nodes(tree_id, parent_id, level, role, text)
         VALUES ($1, NULL, 0, 'user', $2)
         RETURNING id, tree_id, parent_id, level, role, text, created_at`,
        [tree.id, userText]
      );

      await client.query(
        `INSERT INTO events(event_type, tree_id, payload)
         VALUES ('tree.created', $1, jsonb_build_object('topic', $2::text, 'created_by', 'user'::text))`,
        [tree.id, tempTopic]
      );
      await client.query(
        `INSERT INTO events(event_type, tree_id, node_id, payload)
         VALUES ('node.created', $1, $2, jsonb_build_object('role', 'user'::text, 'level', 0::integer))`,
        [tree.id, rootNode.id]
      );

      // Create turn
      const { rows: [turnRow] } = await client.query(
        `INSERT INTO turns (node_id, user_text, status, provider, model, is_byok)
         VALUES ($1, $2, 'pending_ollama', 'ollama', $3, false)
         RETURNING id`,
        [rootNode.id, userText, model || null]
      );
      const turnId = turnRow.id;

      // Link uploads
      const resolvedUploadIds = Array.isArray(upload_ids) ? upload_ids.filter(Boolean) : [];
      if (resolvedUploadIds.length > 0) {
        for (const uid of resolvedUploadIds) {
          await client.query(
            `INSERT INTO turn_uploads (turn_id, upload_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [turnId, uid]
          );
        }
      }

      await client.query('COMMIT');

      // Handle file uploads — extract text
      let userTextWithUploads = userText;
      if (resolvedUploadIds.length > 0) {
        try {
          const uploadedTexts = await getUploadsTextForContext(resolvedUploadIds);
          if (uploadedTexts.length > 0) {
            const uploadedContent = formatUploadsForPrompt(uploadedTexts);
            userTextWithUploads = userText + '\n\n' + uploadedContent;
          }
        } catch (err) {
          console.warn('[ollama-bridge] Failed to process uploads:', err.message);
        }
      }

      // For a brand-new tree, there's no prior context. Build a minimal messages array.
      const contextPayload = {
        tree_id: tree.id,
        node_id: null,
        user_text: userTextWithUploads,
        query_text: userText,
        path_summary: null,
        parent_summary: null,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
        root_topic: tempTopic,
        breadcrumb_titles: [],
        parent_full_text: null,
        tree_summary_text: null,
        rolling_summary: null,
        recent_turns: [],
        user_language: 'en',
        topic_tag: null,
        intent: null,
        knowledge: knowledge || null,
        knowledge_base_ids: Array.isArray(knowledge_base_ids) ? knowledge_base_ids : [],
      };

      // Get user language preference
      try {
        const { rows } = await pool.query('SELECT preferred_language FROM users WHERE id = $1', [userId]);
        if (rows[0]?.preferred_language) {
          contextPayload.user_language = rows[0].preferred_language;
        }
      } catch { /* non-critical */ }

      const { messages, citations } = await buildContextMessages(contextPayload, {
        returnCitations: true,
        providerName: 'ollama',
        model: model || '',
      });

      console.log(`[ollama-bridge] Prepared new tree ${tree.id} turn ${turnId}: ${messages.length} messages`);

      return res.json(withTraceId(res, {
        ok: true,
        tree: {
          id: tree.id,
          topic: tree.topic,
          created_at: tree.created_at,
          context_profile: tree.context_profile,
          memory_scope: tree.memory_scope,
        },
        root_node: {
          id: rootNode.id,
          tree_id: rootNode.tree_id,
          text: rootNode.text,
          created_at: rootNode.created_at,
        },
        turn_id: turnId,
        user_node: {
          id: rootNode.id,
          tree_id: rootNode.tree_id,
          parent_id: null,
          level: 0,
          role: 'user',
          text: rootNode.text,
          created_at: rootNode.created_at,
        },
        tree_id: tree.id,
        messages,
        citations: citations || [],
        model: model || null,
      }));
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('[ollama-bridge] prepare-start-root failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'PREPARE_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  return router;
}
