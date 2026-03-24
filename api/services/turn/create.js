import { pool, getClient } from '../../db/pool.js';
import { getAnswer, streamAnswer } from '../llm/index.js';
import bus from '../../bus/event_bus.js';
import { evaluateRelevance } from '../llm/relevance.js';
import {
  createDecision,
  getDecision,
  completeDecision,
  PENDING_DECISION_TTL_MS
} from './pending_decision_store.js';
import growthLimits from '../../config/growth_limits.js';
import {
  recordTurnRoutedEvent,
  recordTurnCompletedEvent,
} from './turn_events.js';
import { recordUsage } from '../quota_service.js';
import { isOfficialLLMEnabled } from '../system_config.js';
import { checkAndRecordMilestone } from '../telemetry.js';
import { checkUsageLimits } from '../usage_limits.js';
import { resolveProviderForRequest } from '../llm/providers/index.js';
import { mapLlmError, recordLlmErrorEvent } from '../llm/errors.js';
import { recomputeTreeCountersWithPool } from '../tree/counters.js';
import { saveLens } from '../lens/update.js';
import { maybeRefreshTreeSummary } from '../tree/tree_summary.js';
import { maybeUpdateRollingSummary } from '../llm/rolling_summary.js';
import { maybeUpdateBranchSummary } from '../llm/branch_summary.js';
import { classifyIntent } from '../llm/intent_classifier.js';
import { deriveTopicTag, fetchRecentTopicTags } from '../topic/topic_tagger.js';
import {
  normalizeTrailActor,
  recordBranchBurstEvent,
  recordNodeCreatedEvent,
  recordTurnAddedEvent,
} from '../trail/tree_trail_events.js';
import { extractMemoryPatchFromText, persistMemoryPatch, persistFallbackNote } from '../semantic/memory_patch.js';
import { logProcessEvent } from '../../lib/process_event.js';
// T85-fix: Import upload text functions
import { getUploadsTextForContext, formatUploadsForPrompt, listUploadsForTurn, getUploadsContent, createUpload, isFileTypeSupported } from '../uploads/upload_service.js';

// Use LLM_REQUEST_TIMEOUT_MS (same as provider fetch timeout) with a generous default.
// Official SDK defaults are typically ~10 minutes; short hard timeouts cause confusing truncation/failures.
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || '600000', 10);
const FALLBACK_MAX_HOPS = Math.max(
  1,
  parseInt(process.env.ROUTING_MAX_FALLBACK_HOPS || '10', 10)
);
const ROUTE_MODES = new Set(['auto', 'side_fork', 'back_to_root', 'force_in']);

function isAbortLikeError(error) {
  if (!error) return false;
  if (error?.name === 'AbortError') return true;
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('aborted')) return true;
  if (msg.includes('cancelled')) return true;
  if (msg.includes('canceled')) return true;
  if (msg.includes('client disconnected')) return true;
  if (msg.includes('stream aborted')) return true;
  if (msg.includes('the user aborted a request')) return true;
  return false;
}

function normalizeRouteMode(value) {
  if (typeof value !== 'string') {
    return 'auto';
  }
  const normalized = value.trim().toLowerCase();
  if (!ROUTE_MODES.has(normalized)) {
    return 'auto';
  }
  return normalized;
}

function isNativeFileProvider(providerName) {
  const normalized = typeof providerName === 'string' ? providerName.trim().toLowerCase() : '';
  return normalized === 'google' || normalized === 'gemini' || normalized === 'openai' || normalized === 'anthropic' || normalized === 'claude';
}

function getExtensionForMimeType(mimeType) {
  const normalized = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  return '.png';
}

function buildGeneratedImageMarkdown(uploadIds) {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return '';
  const lines = [];
  uploadIds.forEach((id, idx) => {
    const n = idx + 1;
    const url = `/api/upload/${id}/download`;
    lines.push(`![生成图片 ${n}](${url})`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

function shouldAutoEnableGeminiGrounding({ provider, model }) {
  const providerLower = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  const modelLower = typeof model === 'string' ? model.trim().toLowerCase() : '';

  // Only auto-enable for Gemini/Google provider & Gemini models.
  const looksGeminiProvider = providerLower.includes('google') || providerLower.includes('gemini');
  const looksGeminiModel = modelLower.includes('gemini');
  if (!looksGeminiProvider && !looksGeminiModel) return false;
  if (!looksGeminiModel) return false;

  // Official docs: preview/experimental models are not included for Google Search grounding.
  if (modelLower.includes('preview') || modelLower.includes('experimental')) return false;

  // Image generation models should not auto-enable web search tooling.
  if (modelLower.includes('image')) return false;

  return true;
}

async function loadUploadAttachments(uploadIds) {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return [];

  const rows = await getUploadsContent(uploadIds);
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  const attachments = uploadIds.map((uploadId) => {
    const row = byId.get(String(uploadId));
    if (!row) return null;

    const contentBytes = row.content_bytes;
    return {
      id: uploadId,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: contentBytes?.length || 0,
      contentBytes,
    };
  });

  return attachments.filter((att) => att && att.contentBytes);
}

async function safeRecordTrail(label, fn) {
  try {
    await fn();
  } catch (trailError) {
    console.warn(`[treetrail] ${label} failed:`, trailError?.message || trailError);
  }
}

async function recordRelevanceAudit(client, { treeId, nodeId, turnId, traceId, payload }) {
  if (!payload) {
    return;
  }
  await client.query(
    `INSERT INTO events(event_type, tree_id, node_id, turn_id, payload, trace_id)
     VALUES (
       'turn.relevance_decision',
       $1,
       $2,
       $3,
       $4::jsonb,
       COALESCE($5::uuid, uuid_generate_v4())
     )`,
    [treeId, nodeId, turnId, JSON.stringify(payload), traceId || null]
  );
}

async function recordGrowthDeniedEvent(client, { treeId, nodeId, traceId, payload }) {
  if (!payload) {
    return;
  }
  await client.query(
    `INSERT INTO events(event_type, tree_id, node_id, turn_id, payload, trace_id)
     VALUES (
       'growth.denied',
       $1,
       $2,
       NULL,
       $3::jsonb,
       COALESCE($4::uuid, uuid_generate_v4())
     )`,
    [treeId, nodeId, JSON.stringify(payload), traceId || null]
  );
}

function buildRelevanceAuditPayload({
  classification,
  score,
  reason,
  source,
  confidence,
  userChoice,
  finalRoute,
  requiresDialog,
  anchorTreeId,
  anchorNodeId,
  targetTreeId,
  targetParentId,
}) {
  return {
    classification,
    score,
    reason,
    source,
    confidence,
    user_choice: userChoice,
    routed: finalRoute,
    requires_dialog: requiresDialog,
    decision_origin: requiresDialog ? 'user' : 'auto',
    anchor_tree_id: anchorTreeId,
    anchor_node_id: anchorNodeId,
    target_tree_id: targetTreeId,
    target_parent_id: targetParentId,
  };
}

export async function createTurn(params, streamCallbacks = {}) {
  const {
    tree_id,
    node_id,
    user_text,
    with_ai = true,
    who = 'system',
    trace_id,
    route_mode = 'auto',
    route_token,
    provider,
    provider_mode,
    model,
    user_id,
    weknora_api_key,
    existing_user_node_id,
    upload_ids, // T85: Array of upload IDs to attach to this turn
    knowledge_base_ids,
    knowledge,
    enable_grounding,
    enableGrounding,
  } = params;

  const streamingEnabled = Boolean(streamCallbacks?.enableStreaming);
  const onStreamDelta = typeof streamCallbacks?.onDelta === 'function' ? streamCallbacks.onDelta : null;
  const onStreamReasoningDelta =
    typeof streamCallbacks?.onReasoningDelta === 'function' ? streamCallbacks.onReasoningDelta : null;
  const onStreamStart = typeof streamCallbacks?.onStart === 'function' ? streamCallbacks.onStart : null;
  const streamSignal = streamCallbacks?.signal || null;

  const treeId = typeof tree_id === 'string' ? tree_id.trim() : '';
  const requestedParentId = typeof node_id === 'string' ? node_id.trim() : '';
  const routeMode = normalizeRouteMode(route_mode);
  const decisionToken =
    typeof route_token === 'string' && route_token.trim().length > 0
      ? route_token.trim()
      : null;
  const providerOverride =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : null;
  const providerModeOverride =
    typeof provider_mode === 'string' && provider_mode.trim().length > 0
      ? provider_mode.trim()
      : null;
  const modelOverride =
    typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
  const weknoraApiKey =
    typeof weknora_api_key === 'string' && weknora_api_key.trim().length > 0
      ? weknora_api_key.trim()
      : null;

  if (!treeId) {
    throw { code: 'INVALID_TREE_ID', status: 422, message: 'Tree id is required' };
  }
  const userId = typeof user_id === 'string' ? user_id.trim() : '';
  if (!userId) {
    throw { code: 'INVALID_USER_ID', status: 422, message: 'user_id is required' };
  }

  if (!user_text || user_text.trim().length === 0) {
    throw { code: 'EMPTY_USER_TEXT', status: 422, message: 'User text cannot be empty' };
  }

  const normalizedKnowledge = knowledge && typeof knowledge === 'object' ? knowledge : null;
  const initialUsageJson = normalizedKnowledge ? {
    knowledge: {
      baseId: normalizedKnowledge.baseId,
      baseName: normalizedKnowledge.baseName,
      documentIds: normalizedKnowledge.documentIds || [],
      documentCount: (normalizedKnowledge.documentIds || []).length || undefined
    }
  } : null;

  const effectiveKnowledgeBaseIds = normalizedKnowledge?.baseId
    ? [String(normalizedKnowledge.baseId)]
    : (Array.isArray(knowledge_base_ids) ? knowledge_base_ids : []);
  const userText_trimmed = user_text.trim();

  // Context/profile state (populated after DB lookups)
  let preferredProvider = 'omytree-default';
  let advancedEnabled = false;
  let userPlan = 'free';
  let treeContextProfile = 'lite';
  let treeMemoryScope = 'branch';
  let effectiveContextProfile = 'lite';
  let effectiveMemoryScope = 'branch';
  let topicTag = null;
  let detectedIntent = null;

  let pendingDecision = null;
  let effectiveWithAi = with_ai !== false;
  let effectiveWho = typeof who === 'string' && who.trim().length > 0 ? who : 'system';
  if (routeMode !== 'auto') {
    if (!decisionToken) {
      throw { code: 'DECISION_TOKEN_REQUIRED', status: 422, message: '缺少 Irrelevance 决策令牌' };
    }
    pendingDecision = getDecision(decisionToken);
    if (!pendingDecision) {
      throw { code: 'DECISION_TOKEN_EXPIRED', status: 410, message: 'Irrelevance 决策已过期，请重新提问' };
    }
    if (pendingDecision.userText !== userText_trimmed) {
      throw {
        code: 'DECISION_PAYLOAD_MISMATCH',
        status: 409,
        message: '问题内容与原始决策不一致，请重新提问'
      };
    }
    effectiveWithAi = pendingDecision.withAi !== false;
    effectiveWho =
      (typeof pendingDecision.who === 'string' && pendingDecision.who.trim().length > 0
        ? pendingDecision.who
        : effectiveWho) || 'system';
  }
  const trailActor = normalizeTrailActor(effectiveWho);

  const expectedNewNodes =
    (existing_user_node_id ? 0 : 1) + (effectiveWithAi ? 1 : 0);
  const trailCreatedNodes = [];

  // T-FIX: Use getClient() which attaches error handler to prevent crashes
  // from idle-in-transaction timeout
  const client = await getClient();
  let inTransaction = false;
  try {
    let resolvedParentId = null;
    let userNodeLevel = 0;
    let aiNodeLevel = 0;
    let parent = null;

    // T-Fix: Declare variables outside try/catch scope to be accessible in catch block for error recovery
    let userNodeId = null;
    let userNode = null;
    let turnId = null;
    let aiNode = null;
    let aiText = '';
    let aiReasoning = '';
    let aiThoughtSignature = null;  // Gemini 3 thought signature for multi-turn
    let citations = [];
    /** @type {Array<{ mimeType: string, dataBase64: string }>} */
    let generatedImages = [];
    let usageJson = null;
    let providerUsed = null; // Will be set after provider resolution
    let modelUsed = null;    // Will be set after provider resolution
    let isByokUsed = false;  // Will be set after provider resolution

    if (existing_user_node_id) {
      const { rows } = await client.query(
        'SELECT id, tree_id, parent_id, level, role, text FROM nodes WHERE id = $1',
        [existing_user_node_id]
      );
      if (rows.length === 0) {
        throw { code: 'NODE_NOT_FOUND', status: 404, message: 'Existing user node not found' };
      }
      const existingNode = rows[0];
      if (existingNode.tree_id !== treeId) {
        throw { code: 'TREE_MISMATCH', status: 400, message: 'Existing node does not belong to the specified tree' };
      }
      if (existingNode.role !== 'user') {
        throw { code: 'INVALID_ROLE', status: 400, message: 'Existing node must be a user node' };
      }
      userNodeLevel = existingNode.level;
      resolvedParentId = existingNode.parent_id;
      // For root node, parent_id is null, which is fine.
    } else {
      parent = await resolveActiveParent(client, {
        treeId,
        requestedParentId
      });
      resolvedParentId = parent.id;
      userNodeLevel = parent.level + 1;
    }

    // 2. Check limits before invoking costly subsystems
    // Only check limits if we are creating a new node (not using existing one)
    if (!existing_user_node_id) {
      aiNodeLevel = userNodeLevel + 1;
      const depthLimit = Number.isFinite(growthLimits.maxDepth) && growthLimits.maxDepth > 0
        ? growthLimits.maxDepth
        : null;
      if (depthLimit && userNodeLevel > depthLimit) {
        const depthMeta = {
          limit: 'max_depth',
          max_depth: depthLimit,
          current_level: userNodeLevel,
          parent_level: parent.level,
          tree_id: treeId,
          node_id: resolvedParentId,
        };
        const depthPayload = {
          ...depthMeta,
          reason: 'max depth exceeded',
          by: 'api/turn.create',
        };
        await recordGrowthDeniedEvent(client, {
          treeId,
          nodeId: resolvedParentId,
          traceId: trace_id,
          payload: depthPayload,
        });
        bus.emit('growth.denied', {
          tree_id: treeId,
          node_id: resolvedParentId,
          payload: {
            ...depthPayload,
            trace_id,
          },
        });
        throw {
          code: 'DEPTH_LIMIT_EXCEEDED',
          status: 429,
          message: '当前主题已达到最大深度限制，不能在此节点下继续生长。',
          meta: depthMeta,
        };
      }

      // Count existing children for limit enforcement
      const childrenRes = await client.query(
        'SELECT COUNT(*) as cnt FROM nodes WHERE parent_id = $1 AND soft_deleted_at IS NULL',
        [resolvedParentId]
      );
      const childCount = Number.parseInt(childrenRes.rows[0].cnt, 10) || 0;
      const childLimit =
        Number.isFinite(growthLimits.maxChildrenPerNode) && growthLimits.maxChildrenPerNode > 0
          ? growthLimits.maxChildrenPerNode
          : null;
      if (childLimit && childCount >= childLimit) {
        const childMeta = {
          limit: 'max_children_per_node',
          max_children_per_node: childLimit,
          current_children: childCount,
          tree_id: treeId,
          node_id: resolvedParentId,
        };
        const childPayload = {
          ...childMeta,
          reason: 'max children per node exceeded',
          by: 'api/turn.create',
        };
        await recordGrowthDeniedEvent(client, {
          treeId,
          nodeId: resolvedParentId,
          traceId: trace_id,
          payload: childPayload,
        });
        bus.emit('growth.denied', {
          tree_id: treeId,
          node_id: resolvedParentId,
          payload: {
            ...childPayload,
            trace_id,
          },
        });
        throw {
          code: 'CHILDREN_LIMIT_EXCEEDED',
          status: 429,
          message: '该节点的直接子节点数量已达上限。',
          meta: childMeta,
        };
      }
    }

    await client.query('BEGIN');
    inTransaction = true;
    const userPrefRes = await client.query(
      'SELECT preferred_llm_provider, enable_advanced_context, plan FROM users WHERE id = $1',
      [userId]
    );
    preferredProvider = userPrefRes.rows[0]?.preferred_llm_provider || 'omytree-default';
    advancedEnabled = Boolean(userPrefRes.rows[0]?.enable_advanced_context);
    userPlan = typeof userPrefRes.rows[0]?.plan === 'string' ? userPrefRes.rows[0].plan : 'free';

    const treeMeta = await ensureTreeOwnership(client, treeId, userId);
    treeContextProfile = normalizeContextProfileValue(treeMeta?.context_profile);
    treeMemoryScope = normalizeMemoryScopeValue(treeMeta?.memory_scope);
    effectiveContextProfile = advancedEnabled ? treeContextProfile : 'lite';
    effectiveMemoryScope = advancedEnabled ? treeMemoryScope : 'branch';

    let relevanceContext = {};
    if (!existing_user_node_id) {
      relevanceContext = await buildRelevanceContext(client, {
        treeId,
        parentId: resolvedParentId,
        parentText: parent.text,
        userId,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
      });
    }
    detectedIntent = classifyIntent({
      userText: userText_trimmed,
      recentTurns: relevanceContext.recentTurns || [],
    });
    const recentTopicTags = await fetchRecentTopicTags(client, treeId, 3);
    topicTag = deriveTopicTag({
      rootTopic: relevanceContext.rootTopic || treeMeta?.topic || '',
      userText: userText_trimmed,
      recentTurns: relevanceContext.recentTurns || [],
      recentTags: recentTopicTags,
    });

    let routedDecision = 'in';
    let routedScore = null;
    let routedReason = '默认路径';
    let routedSource = 'rules';
    let routedConfidence = null;

    if (!existing_user_node_id) {
      if (pendingDecision) {
        routedDecision = pendingDecision.relevance?.classification ?? 'in';
        routedScore = Number.isFinite(pendingDecision.relevance?.score)
          ? pendingDecision.relevance.score
          : null;
        routedReason = pendingDecision.relevance?.reason ?? routedReason;
        routedSource = pendingDecision.relevance?.source ?? routedSource;
        routedConfidence = Number.isFinite(pendingDecision.relevance?.confidence)
          ? pendingDecision.relevance.confidence
          : null;
      } else {
        try {
          const relevanceResult = await evaluateRelevance(
            {
              rootTopic: relevanceContext.rootTopic,
              breadcrumb: relevanceContext.breadcrumbTitles,
              parentSummary: relevanceContext.parentSummary,
              userText: userText_trimmed,
            },
            { traceId: trace_id, providerOverride, userId }
          );
          routedDecision = relevanceResult?.classification ?? 'in';
          routedScore = Number.isFinite(relevanceResult?.rule_decision?.score)
            ? relevanceResult.rule_decision.score
            : null;
          routedReason = relevanceResult?.rule_decision?.reason ?? routedReason;
          routedSource = relevanceResult?.source ?? routedSource;
          routedConfidence = Number.isFinite(relevanceResult?.confidence)
            ? relevanceResult.confidence
            : null;
        } catch (error) {
          console.warn('[TurnService] Relevance evaluation failed, fallback to "in"', error);
        }
      }
    }

    const anchorTreeId = pendingDecision?.treeId ?? treeId;
    const anchorParentId = pendingDecision?.parentId ?? resolvedParentId;
    let finalRoute = routedDecision;
    let userDecision = 'auto_in';
    let requiresDialog = Boolean(pendingDecision);

    if (!existing_user_node_id) {
      if (pendingDecision) {
        if (routeMode === 'side_fork') {
          if (parent.parent_id !== null) {
            throw { code: 'SIDE_FORK_TARGET_INVALID', status: 422, message: '派生新树仅支持挂载到根节点' };
          }
          finalRoute = 'side';
          userDecision = 'side_fork';
        } else if (routeMode === 'back_to_root') {
          if (treeId !== pendingDecision.treeId) {
            throw { code: 'BACK_TO_ROOT_TREE_MISMATCH', status: 422, message: '回到根节点必须在原树中' };
          }
          if (parent.parent_id !== null) {
            throw { code: 'BACK_TO_ROOT_TARGET_INVALID', status: 422, message: '请选择根节点作为目标' };
          }
          finalRoute = 'in';
          userDecision = 'back_to_root';
        } else if (routeMode === 'force_in') {
          if (treeId !== pendingDecision.treeId || resolvedParentId !== pendingDecision.parentId) {
            throw { code: 'FORCE_IN_TARGET_MISMATCH', status: 422, message: '仍然在此发问仅可作用于原节点' };
          }
          finalRoute = 'in';
          userDecision = 'force_in';
          routedSource = 'forced_dev';
        } else {
          userDecision = 'auto_in';
          finalRoute = routedDecision;
        }
      } else {
        finalRoute = routedDecision;
        userDecision = 'auto_in';
      }
    }

    // 3. Insert user node (PostgreSQL generates UUID)
    // Variables declared in outer scope

    if (existing_user_node_id) {
      userNodeId = existing_user_node_id;
      // We already fetched it above, but let's ensure we have the object structure we need
      // Re-fetch or use what we have. We have 'existingNode' from the first block.
      // But 'existingNode' is scoped to the if block.
      // Let's refetch or restructure the code.
      // To avoid scope issues, I'll just query it again or move the variable out.
      // Actually, I can just use the ID.
      // But I need the object for the return value.
      const { rows } = await client.query('SELECT * FROM nodes WHERE id = $1', [userNodeId]);
      userNode = rows[0];
    } else {
      const userNodeRes = await client.query(
        `INSERT INTO nodes (tree_id, parent_id, level, role, text, created_at, topic_tag)
         VALUES ($1, $2, $3, $4, $5, now(), $6)
         RETURNING id, tree_id, parent_id, level, role, text, created_at, topic_tag`,
        [treeId, resolvedParentId, userNodeLevel, 'user', userText_trimmed, topicTag]
      );
      userNode = userNodeRes.rows[0];
      userNodeId = userNode.id;

      trailCreatedNodes.push({
        node_id: userNodeId,
        role: 'user',
        parent_id: resolvedParentId,
        level: userNodeLevel,
        topic_tag: topicTag,
      });
      await safeRecordTrail('trail.node_created.user', () =>
        recordNodeCreatedEvent(client, {
          treeId,
          nodeId: userNodeId,
          actor: 'user',
          role: 'user',
          parentId: resolvedParentId,
          level: userNodeLevel,
          turnId: null,
          traceId: trace_id,
          topicTag: topicTag || null,
        })
      );
    }

    // 4. Insert turn record
    const turnRes = await client.query(
      `INSERT INTO turns (node_id, user_text, ai_text, status, usage_json, created_at, routed, intent)
       VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
       RETURNING id, node_id, user_text, ai_text, status, usage_json, created_at, routed, intent`,
      [userNodeId, userText_trimmed, '', 'pending', initialUsageJson ? JSON.stringify(initialUsageJson) : 'null', finalRoute, detectedIntent]
    );
    const turn = turnRes.rows[0];
    turnId = turn.id;

    await safeRecordTrail('trail.turn_added', () =>
      recordTurnAddedEvent(client, {
        treeId,
        turnId,
        nodeId: userNodeId,
        actor: 'user',
        routed: finalRoute,
        traceId: trace_id,
      })
    );

    // 4.1 Auto-save user node summary for multi-model context sharing
    // This ensures subsequent turns (potentially with different models) have access to conversation context
    // Save regardless of existing_user_node_id since root nodes created via tree_start_root also need summaries
    try {
      const breadcrumbTitles = relevanceContext.breadcrumbTitles || [];
      const pathSummary = breadcrumbTitles.length > 0
        ? breadcrumbTitles.join(' → ')
        : (relevanceContext.rootTopic || '');
      const parentSummaryText = parent?.text || userText_trimmed;

      await saveLens(userNodeId, {
        path_summary: pathSummary.slice(0, 140), // Truncate to avoid overly long summaries
        parent_summary: parentSummaryText.slice(0, 120),
        updated_by: 'system:auto',
        userId,
      }, client);
      console.info(`[turn.create] Auto-saved user node summary for node=${userNodeId}`);
    } catch (lensError) {
      // Non-critical, log but don't fail the turn
      console.warn('[turn.create] Failed to auto-save user node summary:', lensError?.message || lensError);
    }

    if (streamingEnabled && onStreamStart) {
      try {
        onStreamStart({
          tree_id: treeId,
          turn_id: turnId,
          routed: finalRoute,
          user_node: {
            id: userNodeId,
            tree_id: treeId,
            parent_id: resolvedParentId,
            level: userNodeLevel,
            role: 'user',
            text: userText_trimmed,
            created_at: userNode.created_at,
          },
        });
      } catch (callbackError) {
        console.warn('[turn.create] onStreamStart callback failed:', callbackError?.message || callbackError);
      }
    }

    // 5. Emit user node created event
    if (!existing_user_node_id) {
      bus.emit('node.created', {
        tree_id: treeId,
        node_id: userNodeId,
        payload: {
          role: 'user',
          level: userNodeLevel,
          parent_id: resolvedParentId,
          who: effectiveWho,
          trace_id,
          routed: finalRoute
        }
      });

      console.info(
        `[turn.routed] tree=${treeId} node=${userNodeId} final=${finalRoute} classified=${routedDecision} choice=${userDecision} score=${routedScore ?? 'n/a'} source=${routedSource}`
      );
      bus.emit('turn.routed', {
        tree_id: treeId,
        node_id: userNodeId,
        payload: {
          routed: finalRoute,
          classification: routedDecision,
          score: routedScore,
          reason: routedReason,
          confidence: routedConfidence,
          source: routedSource,
          decision: userDecision,
          who: effectiveWho,
          trace_id,
          context_profile: effectiveContextProfile,
          memory_scope: effectiveMemoryScope,
        },
      });
      await recordTurnRoutedEvent(client, {
        treeId,
        nodeId: userNodeId,
        turnId,
        traceId: trace_id,
        payload: {
          routed: finalRoute,
          classification: routedDecision,
          score: routedScore,
          reason: routedReason,
          confidence: routedConfidence,
          source: routedSource,
          decision: userDecision,
          who: effectiveWho,
          requires_dialog: requiresDialog,
          route_mode: routeMode,
          context_profile: effectiveContextProfile,
          memory_scope: effectiveMemoryScope,
        },
      });

      const auditPayload = buildRelevanceAuditPayload({
        classification: routedDecision,
        score: routedScore,
        reason: routedReason,
        source: routedSource,
        confidence: routedConfidence,
        userChoice: userDecision,
        finalRoute,
        requiresDialog,
        anchorTreeId,
        anchorNodeId: anchorParentId,
        targetTreeId: treeId,
        targetParentId: resolvedParentId,
      });
      await recordRelevanceAudit(client, {
        treeId,
        nodeId: userNodeId,
        turnId,
        traceId: trace_id,
        payload: auditPayload,
      });
    }

    // aiText, usageJson, aiNode are declared in outer scope
    let turnStatus = 'completed';
    let memoryPatch = null;
    let memoryPatchParseError = null;

    // 5.5 Check quota for official model usage
    // Resolve provider preference (user override > user setting) and BYOK
    let effectiveProvider = providerOverride || preferredProvider || 'omytree-default';
    if (advancedEnabled && effectiveProvider === 'omytree-default') {
      throw {
        code: 'DEFAULT_BLOCKED_IN_ADVANCED',
        status: 400,
        message: '高级模式开启后不可选择平台默认模型，请选择自带模型',
      };
    }

    const providerMeta = await resolveProviderForRequest({
      providerHint: providerOverride || effectiveProvider,
      modelHint: modelOverride,
      userId,
    });
    const isByokRequest = providerMeta.isByok;
    const resolvedProviderName = providerMeta.name || effectiveProvider;
    const defaultModel = providerMeta.defaultModel || null;
    const allowedModels = Array.isArray(providerMeta.allowedModels)
      ? providerMeta.allowedModels
      : null;

    let requestedModel = modelOverride || defaultModel || null;
    if (allowedModels?.length) {
      if (requestedModel && !allowedModels.includes(requestedModel)) {
        throw {
          code: 'provider_model_not_found',
          status: 400,
          message: 'Selected model is not enabled for this provider',
          provider: resolvedProviderName,
          isByok: Boolean(isByokRequest),
          isLlmError: true,
        };
      }
      if (!requestedModel) {
        requestedModel = allowedModels[0];
      }
    }

    // Variables initialized in outer scope, just update them here if needed
    providerUsed = resolvedProviderName;
    modelUsed = requestedModel;
    isByokUsed = isByokRequest;

    // T-UploadLimits: Enforce max attachments per turn for official (non-BYOK) usage.
    // free: 1 file/turn, pro: 3 files/turn, team: 10 files/turn (reserved).
    const normalizedPlan = ['free', 'pro', 'team'].includes(String(userPlan).toLowerCase())
      ? String(userPlan).toLowerCase()
      : 'free';

    if (!isByokRequest && upload_ids && Array.isArray(upload_ids) && upload_ids.length > 0) {
      const maxUploadsPerTurn = normalizedPlan === 'pro' ? 3 : normalizedPlan === 'team' ? 10 : 1;
      if (upload_ids.length > maxUploadsPerTurn) {
        throw {
          code: 'UPLOADS_PER_TURN_EXCEEDED',
          status: 413,
          message: `Too many attachments. Max ${maxUploadsPerTurn} file(s) per message for your plan.`,
          meta: { plan: normalizedPlan, max_uploads_per_turn: maxUploadsPerTurn, upload_count: upload_ids.length },
        };
      }
    }

    // T85: Attach uploads to this turn (after provider resolution + attachment count enforcement)
    if (upload_ids && Array.isArray(upload_ids) && upload_ids.length > 0) {
      for (const uploadId of upload_ids) {
        try {
          await client.query(
            `INSERT INTO turn_uploads (turn_id, upload_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [turnId, uploadId]
          );
        } catch (uploadErr) {
          console.warn(`[createTurn] Failed to attach upload ${uploadId} to turn:`, uploadErr?.message);
        }
      }
    }

    // 5.5a Kill Switch - Check if official LLM is enabled (applies to any non-BYOK default)
    if (effectiveWithAi && !isByokRequest) {
      const officialEnabled = await isOfficialLLMEnabled();
      if (!officialEnabled) {
        throw {
          code: 'OFFICIAL_LLM_DISABLED',
          status: 503,
          message: '官方模型暂时不可用，请绑定自己的 API Key 或稍后再试。',
          meta: { reason: 'kill_switch' },
        };
      }
    }

    // 5.5b Weekly quota is enforced by rate_quota_guard (Redis-based)

    // 5.5c T48-2: Check soft limits and collect warnings (non-blocking)
    let usageLimitWarnings = [];
    try {
      usageLimitWarnings = await checkUsageLimits({
        userId,
        treeId,
        contextProfile: effectiveContextProfile,
        isByok: isByokRequest,
      });
    } catch (limitCheckError) {
      console.warn('[turn.create] Soft limit check failed (non-critical):', limitCheckError?.message);
      // Don't block the turn on limit check failure
    }

    // T85+NativeFiles: Route uploads to native File APIs for Gemini/Claude/OpenAI,
    // keep local parsing for DeepSeek (openai-compatible).
    let userTextWithUploads = userText_trimmed;
    let attachmentsForLlm = [];
    if (upload_ids && Array.isArray(upload_ids) && upload_ids.length > 0) {
      const nativeFileProvider = isNativeFileProvider(providerUsed);
      if (nativeFileProvider) {
        try {
          attachmentsForLlm = await loadUploadAttachments(upload_ids);
          // T-FILE: Validate that all attachments are supported by the target provider
          const unsupported = attachmentsForLlm.filter(
            (att) => !isFileTypeSupported(providerUsed, att.mimeType)
          );
          if (unsupported.length > 0) {
            const names = unsupported.map((a) => `${a.fileName} (${a.mimeType})`).join(', ');
            throw {
              code: 'file_type_unsupported',
              status: 400,
              message: `File type not supported by ${providerUsed}: ${names}`,
              provider: providerUsed,
              isByok: Boolean(isByokRequest),
              isLlmError: true,
            };
          }
        } catch (uploadErr) {
          console.error('[createTurn] Failed to load upload attachments:', uploadErr?.message);
          throw {
            code: 'file_upload_failed',
            status: 400,
            message: 'Failed to prepare file attachments for provider upload.',
            provider: providerUsed,
            isByok: Boolean(isByokRequest),
            isLlmError: true,
          };
        }
      } else {
        try {
          const uploadsWithText = await getUploadsTextForContext(upload_ids, { maxLengthPerFile: 32000 });
          const successUploads = uploadsWithText.filter(u => u.text && !u.error);
          const failedUploads = uploadsWithText.filter(u => u.error);
          
          if (failedUploads.length > 0) {
            console.warn(`[createTurn] ${failedUploads.length} file(s) failed to parse: ${failedUploads.map(u => `${u.fileName}: ${u.error}`).join(', ')}`);
          }
          
          const uploadedContent = formatUploadsForPrompt(uploadsWithText);
          if (uploadedContent) {
            userTextWithUploads = userText_trimmed + uploadedContent;
          }
        } catch (uploadErr) {
          console.error('[createTurn] Failed to get uploaded file contents:', uploadErr?.message);
        }
      }
    }

    // ====================================================================
    // T-ABORT-FIX: 在 LLM 调用前先提交用户节点和 turn 记录
    // 这样即使 LLM 超时、abort 或服务崩溃，用户节点也已经持久化
    // ====================================================================
    await client.query('COMMIT');
    inTransaction = false;

    // 6. Try to get AI response if requested
    aiNodeLevel = userNodeLevel + 1;
    if (effectiveWithAi) {
      let idleTimeoutHandle = null;
      let streamAbortCleanup = null;
      const streamAbortController = streamingEnabled ? new AbortController() : null;

      // 创建 idle timeout 重置函数，每次收到数据时调用
      const resetIdleTimeout = () => {
        if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
        if (streamAbortController && !streamAbortController.signal.aborted) {
          idleTimeoutHandle = setTimeout(
            () => streamAbortController.abort(new Error('LLM timeout')),
            LLM_TIMEOUT_MS
          );
        }
      };

      try {
        const parentSummary = relevanceContext.parentSummary || {};

        // T85-Native: Hydrate history attachments if we are using a native file provider
        // this allows the LLM to "see" previously uploaded files in the conversation context.
        if (isNativeFileProvider(providerUsed) && Array.isArray(relevanceContext.recentTurns)) {
          const allUploadIds = [];
          for (const turn of relevanceContext.recentTurns) {
            if (!Array.isArray(turn.attachments) || turn.attachments.length === 0) continue;
            for (const att of turn.attachments) {
              if (att?.id) allUploadIds.push(att.id);
            }
          }

          if (allUploadIds.length > 0) {
            try {
              const hydrated = await loadUploadAttachments(allUploadIds);
              const hydratedById = new Map(hydrated.map((a) => [String(a.id), a]));

              for (const turn of relevanceContext.recentTurns) {
                if (!Array.isArray(turn.attachments) || turn.attachments.length === 0) continue;
                turn.hydratedAttachments = turn.attachments
                  .map((a) => hydratedById.get(String(a.id)))
                  .filter(Boolean);
              }
            } catch (hydrateErr) {
              console.warn('[createTurn] Failed to hydrate history attachments:', hydrateErr.message);
            }
          }
        }

        const contextPayload = {
          tree_id: treeId,
          node_id: resolvedParentId,
          user_text: userTextWithUploads, // T85-fix: Use text with uploaded file contents
          query_text: userText_trimmed, // KB-3.x: Dedicated query field for RAG search
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
          knowledge: normalizedKnowledge,
          knowledge_base_ids: effectiveKnowledgeBaseIds,
        };

        citations = [];
        if (streamingEnabled) {
          if (streamAbortController) {
            if (streamSignal?.aborted) {
              streamAbortController.abort(streamSignal.reason || new Error('Stream aborted'));
            } else if (streamSignal) {
              const forwardAbort = () =>
                streamAbortController.abort(streamSignal.reason || new Error('Stream aborted'));
              streamSignal.addEventListener('abort', forwardAbort, { once: true });
              streamAbortCleanup = () => streamSignal.removeEventListener('abort', forwardAbort);
            }
            // 启动初始 idle timeout
            resetIdleTimeout();
          }

          const streamResult = await streamAnswer(contextPayload, {
            provider: providerOverride || effectiveProvider,
            mode: providerModeOverride,
            model: modelOverride,
            userId,
            weknoraApiKey,
            signal: streamAbortController?.signal || streamSignal || null,
            context_profile: effectiveContextProfile,
            memory_scope: effectiveMemoryScope,
            // Grounding: always-on for supported Gemini text models.
            // (The model still decides when to actually perform a web search.)
            enableGrounding: shouldAutoEnableGeminiGrounding({
              provider: providerOverride || effectiveProvider,
              model: modelOverride || defaultModel || '',
            }),
            attachments: attachmentsForLlm,
          });

          citations = Array.isArray(streamResult?.citations) ? streamResult.citations : [];

          providerUsed = streamResult?.provider || resolvedProviderName;
          modelUsed = streamResult?.model || modelOverride || defaultModel || null;
          isByokUsed = streamResult?.is_byok ?? isByokRequest;
          turnStatus = 'completed';

          for await (const chunk of streamResult.stream) {
            // T-ABORT-DEFENSIVE: Check abort signal on every chunk. Some LLM providers
            // (e.g. Google's SDK) may not propagate abort signals to their stream iterator.
            // Without this check, the loop would continue until the LLM finishes naturally,
            // making the stop button appear non-functional to the user.
            if (streamAbortController?.signal?.aborted || streamSignal?.aborted) {
              console.log('[turn.create] Abort signal detected in streaming loop, breaking out.');
              turnStatus = 'aborted';
              break;
            }
            // 每次收到 chunk 重置 idle timeout
            resetIdleTimeout();
            if (chunk?.type === 'reasoning' && typeof chunk.text === 'string') {
              aiReasoning += chunk.text;
              if (onStreamReasoningDelta) {
                try {
                  onStreamReasoningDelta(chunk.text);
                } catch (callbackError) {
                  console.warn('[turn.create] onStreamReasoningDelta callback failed:', callbackError?.message || callbackError);
                }
              }
            } else if (chunk?.type === 'delta' && typeof chunk.text === 'string') {
              aiText += chunk.text;
              if (onStreamDelta) {
                try {
                  onStreamDelta(chunk.text);
                } catch (callbackError) {
                  console.warn('[turn.create] onStreamDelta callback failed:', callbackError?.message || callbackError);
                }
              }
            } else if (chunk?.type === 'usage' && chunk.usage) {
              usageJson = chunk.usage;

              if (Array.isArray(chunk.images) && chunk.images.length > 0) {
                generatedImages = chunk.images;
              }

              // Propagate grounding metadata (Google Search grounding) into persisted usage_json.
              // Frontend reads it from SSE done payload: event.usage.groundingMetadata
              if (chunk.groundingMetadata && typeof chunk.groundingMetadata === 'object') {
                const base = (usageJson && typeof usageJson === 'object') ? usageJson : {};
                usageJson = {
                  ...base,
                  groundingMetadata: chunk.groundingMetadata,
                };
              }

              // 如果底层驱动提供了 fullReasoning（或未来扩展），优先采用
              if (typeof chunk.fullReasoning === 'string') {
                aiReasoning = chunk.fullReasoning;
              }
              // Capture Gemini 3 thought signature for multi-turn quality
              if (chunk.thoughtSignature) {
                aiThoughtSignature = chunk.thoughtSignature;
              }
            }
          }

          if (!usageJson && streamResult?.usage) {
            usageJson = streamResult.usage;
          }

          // Persist generated images (if any) as uploads, then append Markdown preview/download links.
          if (Array.isArray(generatedImages) && generatedImages.length > 0) {
            try {
              const createdUploadIds = [];
              for (let i = 0; i < generatedImages.length; i++) {
                const img = generatedImages[i];
                const mimeType = typeof img?.mimeType === 'string' ? img.mimeType : 'image/png';
                const dataBase64 = typeof img?.dataBase64 === 'string' ? img.dataBase64 : '';
                if (!dataBase64) continue;

                const buffer = Buffer.from(dataBase64, 'base64');
                if (!buffer || buffer.length === 0) continue;

                const ext = getExtensionForMimeType(mimeType);
                const fileName = `generated-${turnId}-${i + 1}${ext}`;
                const record = await createUpload({
                  userId,
                  treeId,
                  turnId,
                  nodeId: null,
                  fileName,
                  mimeType,
                  contentBuffer: buffer,
                  client,
                });
                if (record?.id) createdUploadIds.push(record.id);
              }

              const md = buildGeneratedImageMarkdown(createdUploadIds);
              if (md) {
                aiText = aiText && aiText.trim().length > 0 ? `${aiText.trim()}\n\n${md}` : md;
              }
            } catch (imgErr) {
              console.warn('[turn.create] Failed to persist generated images:', imgErr?.message || imgErr);
            }
          }

          // T58-7-0: Extract memory patch from accumulated aiText in streaming path
          // Previously this only ran in non-streaming path, causing empty ledger atoms
          const extracted = extractMemoryPatchFromText(aiText);
          if (extracted.patch) {
            aiText = extracted.cleanText;
            memoryPatch = extracted.patch;
          } else {
            memoryPatchParseError = extracted.error || null;
          }
        } else {
          // 非流式请求：避免额外的“硬超时”包装；由 LLM driver/provider 的超时参数统一控制。
          const response = await getAnswer(contextPayload, {
            provider: providerOverride || effectiveProvider,
            mode: providerModeOverride,
            model: modelOverride,
            userId,
            weknoraApiKey,
            context_profile: effectiveContextProfile,
            memory_scope: effectiveMemoryScope,
            // Grounding: always-on for supported Gemini text models.
            enableGrounding: shouldAutoEnableGeminiGrounding({
              provider: providerOverride || effectiveProvider,
              model: modelOverride || defaultModel || '',
            }),
            attachments: attachmentsForLlm,
          });

          aiText = typeof response?.ai_text === 'string' ? response.ai_text.trim() : '';
          usageJson = response?.usage_json ?? null;
          providerUsed = response?.provider || resolvedProviderName;
          modelUsed = response?.model || modelOverride || defaultModel || null;  // T28-0: 获取使用的模型
          isByokUsed = response?.is_byok ?? isByokRequest;
          turnStatus = 'completed';

          citations = Array.isArray(response?.citations) ? response.citations : [];

          if (Array.isArray(response?.images) && response.images.length > 0) {
            generatedImages = response.images;
          }

          if (Array.isArray(generatedImages) && generatedImages.length > 0) {
            try {
              const createdUploadIds = [];
              for (let i = 0; i < generatedImages.length; i++) {
                const img = generatedImages[i];
                const mimeType = typeof img?.mimeType === 'string' ? img.mimeType : 'image/png';
                const dataBase64 = typeof img?.dataBase64 === 'string' ? img.dataBase64 : '';
                if (!dataBase64) continue;

                const buffer = Buffer.from(dataBase64, 'base64');
                if (!buffer || buffer.length === 0) continue;

                const ext = getExtensionForMimeType(mimeType);
                const fileName = `generated-${turnId}-${i + 1}${ext}`;
                const record = await createUpload({
                  userId,
                  treeId,
                  turnId,
                  nodeId: null,
                  fileName,
                  mimeType,
                  contentBuffer: buffer,
                  client,
                });
                if (record?.id) createdUploadIds.push(record.id);
              }

              const md = buildGeneratedImageMarkdown(createdUploadIds);
              if (md) {
                aiText = aiText && aiText.trim().length > 0 ? `${aiText.trim()}\n\n${md}` : md;
              }
            } catch (imgErr) {
              console.warn('[turn.create] Failed to persist generated images:', imgErr?.message || imgErr);
            }
          }

          const extracted = extractMemoryPatchFromText(aiText);
          if (extracted.patch) {
            aiText = extracted.cleanText;
            memoryPatch = extracted.patch;
          } else {
            aiText = extracted.cleanText;
            memoryPatchParseError = extracted.error || null;
          }
        }
      } catch (llmError) {
        // 用户手动打断 / 客户端断开：不应当作为 LLM 错误处理，
        // 需要保留已生成的部分文本并落库（turn.status=aborted）。
        const abortSignalTriggered = Boolean(streamSignal?.aborted || streamAbortController?.signal?.aborted);
        const abortLikeError = isAbortLikeError(llmError);
        const isAbort = abortSignalTriggered || abortLikeError;

        if (isAbort) {
          console.log(`[turn.create] ${abortSignalTriggered ? 'Stream aborted' : 'Abort-like error'} (persist partial output).`);
          turnStatus = 'aborted';
          // 不抛出异常，让代码继续执行以保存部分结果
        } else {
          // T-Fix: Use providerUsed (outer scope) instead of resolvedProviderName to avoid TDZ issues
          const safeProvider = providerOverride || providerUsed || effectiveProvider;
          const normalizedError = mapLlmError(llmError, {
            provider: safeProvider,
            isByok: isByokRequest,
          });
          await recordLlmErrorEvent({
            pool,
            userId,
            treeId,
            provider: normalizedError.provider,
            errorCode: normalizedError.code,
            message: normalizedError.message,
            rawError: normalizedError.raw || llmError?.message,
            isByok: normalizedError.isByok,
            traceId: trace_id,
          });
          throw normalizedError;
        }
      } finally {
        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }
        if (streamAbortCleanup) {
          try {
            streamAbortCleanup();
          } catch (cleanupError) {
            console.warn('[turn.create] Failed to cleanup stream abort listener:', cleanupError?.message || cleanupError);
          }
        }
      }

      // Record usage for quota tracking (only for completed turns)
      if (turnStatus === 'completed') {
        try {
          await recordUsage({
            userId,
            provider: providerUsed,
            isByok: isByokUsed,
            model: modelUsed,
            tokensInput: usageJson?.prompt_tokens || usageJson?.input_tokens || null,
            tokensOutput: usageJson?.completion_tokens || usageJson?.output_tokens || null,
            treeId,
            contextProfile: effectiveContextProfile, // T48-0: Track profile for cost analysis
          });
        } catch (usageError) {
          console.warn('[createTurn] Failed to record usage:', usageError.message);
        }
      }

      // Insert AI node (persist partial output when aborted)
      // T28-0: 同时写入 provider/model/is_byok 字段
      // FIX: 如果事务已提交（流式响应后），需要用pool直接执行，避免使用可能已断开的client
      const aiTextToPersist = typeof aiText === 'string' ? aiText : '';
      const aiReasoningToPersist =
        typeof aiReasoning === 'string' && aiReasoning.length > 0 ? aiReasoning : null;
      const shouldCreateAiNode =
        effectiveWithAi && (aiTextToPersist.length > 0 || turnStatus === 'aborted');
      if (shouldCreateAiNode) {
        let aiNodeRes;
        try {
          // FIX-STREAMING: 如果事务已提交（inTransaction=false），使用pool而不是client
          // 这避免了在长时间流式响应后使用已断开的连接
          const queryExecutor = inTransaction ? client : pool;
          aiNodeRes = await queryExecutor.query(
            `INSERT INTO nodes (tree_id, parent_id, level, role, text, reasoning_content, thought_signature, created_at, provider, model, is_byok)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10)
             RETURNING id, tree_id, parent_id, level, role, text, reasoning_content, thought_signature, created_at, provider, model, is_byok`,
            [treeId, userNodeId, aiNodeLevel, 'ai', aiTextToPersist, aiReasoningToPersist, aiThoughtSignature, providerUsed, modelUsed, isByokUsed]
          );
        } catch (insertErr) {
          console.error(`[turn.create] AI node INSERT failed:`, insertErr.message);
          throw insertErr;
        }
        const aiNodeRow = aiNodeRes.rows[0];

        aiNode = {
          id: aiNodeRow.id,
          tree_id: aiNodeRow.tree_id,
          parent_id: aiNodeRow.parent_id,
          level: aiNodeRow.level,
          role: aiNodeRow.role,
          text: aiNodeRow.text,
          reasoning_content: aiNodeRow.reasoning_content ?? null,
          thought_signature: aiNodeRow.thought_signature ?? null,
          created_at: aiNodeRow.created_at,
          provider: aiNodeRow.provider ?? providerUsed,
          model: aiNodeRow.model ?? modelUsed,
          is_byok: aiNodeRow.is_byok ?? isByokUsed,
        };

        trailCreatedNodes.push({
          node_id: aiNodeRow.id,
          role: 'ai',
          parent_id: userNodeId,
          level: aiNodeLevel,
        });
        // FIX-STREAMING: 使用pool而不是client（事务已提交）
        const trailExecutor = inTransaction ? client : pool;
        await safeRecordTrail('trail.node_created.ai', () =>
          recordNodeCreatedEvent(trailExecutor, {
            treeId,
            nodeId: aiNodeRow.id,
            actor: 'assistant',
            role: 'ai',
            parentId: userNodeId,
            level: aiNodeLevel,
            turnId,
            traceId: trace_id,
          })
        );

        // Emit AI node created event
        bus.emit('node.created', {
          tree_id: treeId,
          node_id: aiNodeRow.id,
          payload: {
            role: 'ai',
            level: aiNodeLevel,
            parent_id: userNodeId,
            who,
            trace_id,
            routed: routedDecision
          }
        });
      }

      // Auto-save AI node summary for multi-model context sharing
      // Include the AI response text in parent_summary so subsequent models can access it
      if (aiNode?.id) {
        try {
          const breadcrumbTitles = relevanceContext.breadcrumbTitles || [];
          // Add user question to the path context
          const pathWithUser = [...breadcrumbTitles, userText_trimmed.slice(0, 50)];
          const pathSummary = pathWithUser.join(' → ').slice(0, 140);
          // Use AI response as parent summary for child nodes
          const parentSummaryText = (aiTextToPersist || '').slice(0, 120);

          // FIX-STREAMING: 使用正确的executor（事务已提交则用pool）
          const lensExecutor = inTransaction ? client : pool;
          await saveLens(aiNode.id, {
            path_summary: pathSummary,
            parent_summary: parentSummaryText,
            updated_by: `llm:${providerUsed}`,
            userId,
          }, lensExecutor);
          console.info(`[turn.create] Auto-saved AI node summary for node=${aiNode.id}`);
        } catch (lensError) {
          // Non-critical, log but don't fail the turn
          console.warn('[turn.create] Failed to auto-save AI node summary:', lensError?.message || lensError);
        }
      }

      // Update turn with AI response (completed or aborted)
      // T28-0: 同时写入 provider/model/is_byok 字段
      // FIX-STREAMING: 使用正确的executor（事务已提交则用pool）
      const updateExecutor = inTransaction ? client : pool;

      // Ensure knowledge/citations survive the final usage_json overwrite.
      // - knowledge is required for client-side KB badge persistence after reload
      // - citations power the "参考内容" module after reload
      const usageJsonBase = (usageJson && typeof usageJson === 'object') ? usageJson : {};
      const usageJsonMerged = {
        ...usageJsonBase,
        ...(normalizedKnowledge && typeof normalizedKnowledge === 'object' ? { knowledge: normalizedKnowledge } : {}),
        ...(Array.isArray(citations) && citations.length > 0 ? { citations } : {}),
        ...(Array.isArray(effectiveKnowledgeBaseIds) && effectiveKnowledgeBaseIds.length > 0
          ? { knowledge_base_ids: effectiveKnowledgeBaseIds }
          : {}),
      };
      await updateExecutor.query(
        `UPDATE turns SET ai_text = $1, status = $2, usage_json = $3, provider = $4, model = $5, is_byok = $6 WHERE id = $7`,
        [
          aiTextToPersist,
          turnStatus === 'aborted' ? 'aborted' : 'completed',
          JSON.stringify(usageJsonMerged),
          providerUsed,
          modelUsed,
          isByokUsed,
          turnId
        ]
      );
    } else {
      turnStatus = 'completed';
    }

    // FIX-STREAMING: 使用正确的executor（事务已提交则用pool）
    const memoryExecutor = inTransaction ? client : pool;
    if (memoryPatch) {
      const targetNodeId = aiNode?.id || userNodeId;
      await safeRecordTrail('memory_patch.persist', () =>
        persistMemoryPatch(memoryExecutor, {
          treeId,
          nodeId: targetNodeId,
          turnId,
          patch: memoryPatch,
        })
      );
    } else if (memoryPatchParseError) {
      // T58-7-2: Write fallback note atom when parse fails (don't block response)
      console.warn('[memory_patch] parse failed; writing fallback note:', memoryPatchParseError?.message || memoryPatchParseError);
      const targetNodeId = aiNode?.id || userNodeId;
      await safeRecordTrail('memory_patch.fallback', () =>
        persistFallbackNote(memoryExecutor, {
          treeId,
          nodeId: targetNodeId,
          turnId,
          reason: 'patch_parse_failed',
        })
      );
    }

    if (turnStatus === 'completed') {
      const completedPayload = {
        who: effectiveWho,
        trace_id,
        usage: usageJson,
        routed: finalRoute,
        decision: userDecision,
        status: turnStatus,
        with_ai: effectiveWithAi,
        ai_node_id: aiNode?.id ?? null,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
        advanced_context_enabled: advancedEnabled,
        intent: detectedIntent,
        topic_tag: topicTag,
      };
      bus.emit('turn.completed', {
        tree_id: treeId,
        node_id: userNodeId,
        payload: completedPayload,
      });
      // FIX-STREAMING: 使用正确的executor（事务已提交则用pool）
      const eventExecutor = inTransaction ? client : pool;
      await recordTurnCompletedEvent(eventExecutor, {
        treeId,
        nodeId: userNodeId,
        turnId,
        traceId: trace_id,
        payload: completedPayload,
      });
    }

    if (trailCreatedNodes.length > 1) {
      // FIX-STREAMING: 使用正确的executor（事务已提交则用pool）
      const burstExecutor = inTransaction ? client : pool;
      await safeRecordTrail('trail.branch_burst', () =>
        recordBranchBurstEvent(burstExecutor, {
          treeId,
          parentId: resolvedParentId,
          children: trailCreatedNodes,
          turnId,
          actor: trailActor,
          traceId: trace_id,
        })
      );
    }

    // Always update trees.updated_at to reflect latest activity so the sidebar
    // can sort by last updated time correctly, including old/paginated conversations.
    const writeExecutor = inTransaction ? client : pool;
    await writeExecutor.query('UPDATE trees SET updated_at = now() WHERE id = $1', [treeId]);

    // T-ABORT-FIX: 事务已在 LLM 调用前提交，这里不需要再次 COMMIT
    // 但如果事务仍在进行中（例如某些路径没有进入 LLM 调用），则需要 COMMIT
    if (inTransaction) {
      await client.query('COMMIT');
      inTransaction = false;
    }

    // Counters recompute should not be part of the long-running transaction.
    // Running it inside the transaction can deadlock and force a full rollback,
    // which would lose the user node/turn on abort.
    setImmediate(() => {
      recomputeTreeCountersWithPool(treeId).catch((err) => {
        console.warn('[turn.create] recomputeTreeCounters failed (post-commit, non-blocking):', err?.message || err);
      });
    });
    if (pendingDecision && decisionToken) {
      completeDecision(decisionToken);
    }

    // T70: Log turn_created process event (fail-open, after commit)
    logProcessEvent(pool, {
      tree_id: treeId,
      scope_node_id: userNodeId, // The node this turn is attached to
      event_type: 'turn_created',
      meta: {
        actor: 'user',
        source: 'api',
        node_id: userNodeId,
        turn_id: turnId,
        model: modelUsed || null,
      },
    }).catch(() => { }); // fail-open: swallow any errors

    // Refresh tree summary asynchronously
    // T43-1: Generate for both tree and branch scopes (for context/admin visibility)
    setImmediate(() => {
      maybeRefreshTreeSummary(treeId, { userId, topicTag }).catch((err) => {
        console.warn('[turn.create] tree summary refresh failed:', err?.message || err);
      });
    });

    // P0-04: Refresh rolling summary asynchronously (write-path) with advisory lock.
    // Only after a completed AI turn so we don't summarize partial/aborted outputs.
    if (turnStatus === 'completed' && aiNode?.id) {
      setImmediate(() => {
        maybeUpdateRollingSummary({
          pool,
          nodeId: aiNode.id,
          profile: effectiveContextProfile,
          context: {
            topic: relevanceContext.rootTopic || treeMeta?.topic || '',
            userLanguage: treeMeta?.preferred_language || 'en',
          },
          userId,
          providerHint: providerOverride || providerUsed || null,
        }).catch((err) => {
          console.warn('[turn.create] rolling summary refresh failed:', err?.message || err);
        });
      });

      // P2-05: Refresh branch summary asynchronously (write-path)
      setImmediate(() => {
        maybeUpdateBranchSummary({
          pool,
          treeId,
          nodeId: aiNode.id,
          userId,
          providerHint: providerOverride || providerUsed || null,
          userLanguage: treeMeta?.preferred_language || 'en',
        }).catch((err) => {
          console.warn('[turn.create] branch summary refresh failed:', err?.message || err);
        });
      });
    }

    // Check for node count milestones (async, don't block response)
    pool.query('SELECT COUNT(*) as count FROM nodes WHERE tree_id = $1', [treeId])
      .then(result => {
        const nodeCount = parseInt(result.rows[0]?.count || 0);
        checkAndRecordMilestone(userId, treeId, nodeCount);
      })
      .catch(err => console.error('[telemetry] Milestone check failed:', err.message));

    // T85-fix: Get attachments for user_node
    let userNodeAttachments = [];
    if (turnId) {
      try {
        const uploads = await listUploadsForTurn(turnId);
        userNodeAttachments = uploads.map(u => ({
          id: u.id,
          fileName: u.file_name,
          ext: u.ext,
          sizeBytes: u.size_bytes,
        }));
      } catch (attachErr) {
        console.warn('[createTurn] Failed to get attachments for user_node:', attachErr?.message);
      }
    }

    // Return response
    const aiPending = turnStatus === 'pending';
    const responsePayload = {
      ok: !aiPending,
      user_node: {
        id: userNodeId,
        tree_id: treeId,
        parent_id: resolvedParentId,
        level: userNodeLevel,
        role: 'user',
        text: userText_trimmed,
        created_at: userNode.created_at,
        topic_tag: topicTag || null,
        attachments: userNodeAttachments.length > 0 ? userNodeAttachments : undefined, // T85-fix
      },
      ai_node: aiNode,
      turn: {
        id: turnId,
        node_id: userNodeId,
        user_text: userText_trimmed,
        ai_text: aiText || undefined,
        status: turnStatus,
        usage_json: usageJson,
        routed: finalRoute,
        ai_pending: aiPending,
        provider: providerUsed,
        model: modelUsed,
        is_byok: isByokUsed,
        context_profile: effectiveContextProfile,
        memory_scope: effectiveMemoryScope,
        topic_tag: topicTag || null,
        intent: detectedIntent,
      },
      citations: Array.isArray(citations) && citations.length > 0 ? citations : undefined,
      relevance: {
        decision: routedDecision,
        score: routedScore,
        reason: routedReason,
        source: routedSource,
        confidence: routedConfidence
      },
      // T48-2: Include usage limit warnings (non-blocking soft limits)
      warnings: usageLimitWarnings?.length > 0 ? usageLimitWarnings : undefined,
    };

    return responsePayload;
  } catch (error) {
    // ====================================================================
    // T-ABORT-FIX: 简化的错误恢复逻辑
    // 由于事务在 LLM 调用前已提交，用户节点和 turn 记录已持久化
    // 我们只需要确保创建一个空的 AI 节点，并更新 turn 状态
    // ====================================================================
    const hasUserNode = typeof userNodeId !== 'undefined' && userNodeId;
    const hasTurnRecord = typeof turnId !== 'undefined' && turnId;
    const hasAiNodeAlready = typeof aiNode !== 'undefined' && aiNode?.id;

    // 如果用户节点已创建且没有 AI 节点，尝试创建一个空的 AI 节点
    if (hasUserNode && hasTurnRecord && !hasAiNodeAlready && !inTransaction) {
      const safeAiNodeLevel = typeof aiNodeLevel !== 'undefined' ? aiNodeLevel : (typeof userNodeLevel !== 'undefined' ? userNodeLevel + 1 : 1);
      const safeProviderUsed = typeof providerUsed !== 'undefined' ? providerUsed : null;
      const safeModelUsed = typeof modelUsed !== 'undefined' ? modelUsed : null;
      const safeIsByokUsed = typeof isByokUsed !== 'undefined' ? isByokUsed : false;
      const safeAiText = typeof aiText !== 'undefined' && aiText ? aiText : '';

      try {
        console.info(
          `[turn.create] T-ABORT-FIX: Creating empty AI node on error recovery, ` +
          `userNodeId=${userNodeId}, error=${error?.code || error?.message}`
        );

        // 创建空的 AI 节点
        const aiNodeRes = await client.query(
          `INSERT INTO nodes (tree_id, parent_id, level, role, text, created_at, provider, model, is_byok)
           VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
           RETURNING id`,
          [treeId, userNodeId, safeAiNodeLevel, 'ai', safeAiText, safeProviderUsed, safeModelUsed, safeIsByokUsed]
        );
        const recoveredAiNodeId = aiNodeRes.rows[0]?.id;
        console.info(`[turn.create] T-ABORT-FIX: Created AI node: ${recoveredAiNodeId}`);

        // 更新 turn 记录为 aborted 状态
        await client.query(
          `UPDATE turns SET ai_text = $1, status = 'aborted', provider = $2, model = $3, is_byok = $4 WHERE id = $5`,
          [safeAiText, safeProviderUsed, safeModelUsed, safeIsByokUsed, turnId]
        );
        console.info(`[turn.create] T-ABORT-FIX: Updated turn to aborted status`);

        // 异步更新树计数器
        setImmediate(() => {
          recomputeTreeCountersWithPool(treeId).catch((err) => {
            console.warn('[turn.create] T-ABORT-FIX: recomputeTreeCounters failed:', err?.message || err);
          });
        });
      } catch (recoveryErr) {
        console.error('[turn.create] T-ABORT-FIX: Error recovery failed:', recoveryErr?.message || recoveryErr);
        // 恢复失败也不需要回滚（因为事务已提交），只是 AI 节点可能缺失
      }
    } else if (inTransaction) {
      // 如果事务仍在进行中（早期错误），则回滚
      try {
        await client.query('ROLLBACK');
        inTransaction = false;
      } catch (rollbackErr) {
        console.warn('[turn.create] Rollback failed:', rollbackErr?.message);
      }
    }

    throw error;
  } finally {
    // T70: Safety net - ensure transaction is rolled back before releasing connection
    // This prevents "idle in transaction" connections from being returned to pool
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
        console.warn('[turn.create] finally block: rolled back lingering transaction');
      } catch (rollbackErr) {
        // Connection may already be broken, just log and release
        console.warn('[turn.create] finally block: rollback failed:', rollbackErr?.message);
      }
    }
    client.release();
  }
}

async function buildRelevanceContext(client, { treeId, parentId, parentText, userId, context_profile, memory_scope }) {
  // T51-1: Use profile-based limit instead of hardcoded 4
  const profile = context_profile || 'lite';
  const { CONTEXT_MESSAGE_LIMITS } = await import('../llm/context_limits.js');
  const limits = CONTEXT_MESSAGE_LIMITS[profile] || CONTEXT_MESSAGE_LIMITS.lite;
  // T51-1: Use recentTurnPairs * 2 to get node count, fallback to recentTurns * 2
  const turnLimit = ((limits.recentTurnPairs || limits.recentTurns) * 2) || 4;

	  const [rootTopic, breadcrumbTitles, parentSummaryRecord, treeSummary, recentTurns] = await Promise.all([
	    fetchRootTopic(client, treeId, userId),
	    fetchBreadcrumbTitles(client, parentId),
	    fetchParentLensSummary(client, parentId, parentText),
	    fetchTreeSummary(client, treeId),
	    fetchRecentPathNodes(client, parentId, turnLimit),  // T51-1: use profile-based limit
	  ]);

	  return {
	    rootTopic,
	    breadcrumbTitles,
	    parentSummary: parentSummaryRecord,
	    treeSummary,
	    parentFullText: parentText || parentSummaryRecord?.parent_summary || '',
	    rollingSummary: parentSummaryRecord?.rolling_summary ?? null,
	    recentTurns,
	  };
	}

function normalizeContextProfileValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'standard' || normalized === 'max') {
    return normalized;
  }
  return 'lite';
}

function normalizeMemoryScopeValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'tree') {
    return 'tree';
  }
  return 'branch';
}

async function ensureTreeOwnership(client, treeId, userId) {
  const { rows } = await client.query(
    `SELECT t.user_id, t.context_profile, t.memory_scope, t.topic, u.preferred_language
     FROM trees t
     LEFT JOIN users u ON t.user_id = u.id
     WHERE t.id = $1
     LIMIT 1`,
    [treeId]
  );
  if (rows.length === 0 || rows[0].user_id !== userId) {
    throw { status: 404, code: 'TREE_NOT_FOUND', message: 'Tree not found' };
  }
  return rows[0];
}

async function resolveActiveParent(client, { treeId, requestedParentId }) {
  if (!requestedParentId) {
    return fetchRootNodeRecord(client, treeId);
  }

  let currentId = requestedParentId;
  let hops = 0;

  while (currentId && hops <= FALLBACK_MAX_HOPS) {
    const { rows } = await client.query(
      `SELECT id, tree_id, parent_id, level, role, text, soft_deleted_at, created_at
       FROM nodes
       WHERE id = $1
       LIMIT 1`,
      [currentId]
    );

    if (rows.length === 0) {
      if (hops === 0) {
        throw { code: 'PARENT_NOT_FOUND', status: 404, message: 'Parent node not found' };
      }
      break;
    }

    const candidate = rows[0];
    if (candidate.tree_id !== treeId) {
      throw { code: 'TREE_MISMATCH', status: 404, message: 'Node does not belong to this tree' };
    }

    if (!candidate.soft_deleted_at) {
      return candidate;
    }

    currentId = candidate.parent_id;
    hops += 1;
  }

  return fetchRootNodeRecord(client, treeId);
}

async function fetchRootNodeRecord(client, treeId) {
  const { rows } = await client.query(
    `SELECT id, tree_id, parent_id, level, role, text, soft_deleted_at, created_at
     FROM nodes
     WHERE tree_id = $1 AND parent_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [treeId]
  );

  if (rows.length === 0) {
    throw { code: 'ROOT_NOT_FOUND', status: 404, message: 'Root node not found' };
  }

  return rows[0];
}

async function fetchRootTopic(client, treeId, userId) {
  const { rows } = await client.query(
    'SELECT topic FROM trees WHERE id = $1 AND user_id = $2 LIMIT 1',
    [treeId, userId]
  );
  return rows[0]?.topic ?? '未命名主题';
}

async function fetchBreadcrumbTitles(client, nodeId) {
  const { rows } = await client.query(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, text, 0 AS depth
      FROM nodes
      WHERE id = $1 AND soft_deleted_at IS NULL
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.text, child.depth + 1
      FROM nodes parent
      JOIN ancestors child ON child.parent_id = parent.id
      WHERE parent.soft_deleted_at IS NULL
    )
    SELECT ARRAY_AGG(COALESCE(text, '')) FILTER (WHERE text IS NOT NULL) AS titles
    FROM (
      SELECT text, depth
      FROM ancestors
      ORDER BY depth DESC
    ) ordered
    `,
    [nodeId]
  );

  return rows[0]?.titles ?? [];
}

async function fetchParentLensSummary(client, nodeId, fallbackText) {
  const { rows } = await client.query(
    `SELECT path_summary, parent_summary, rolling_summary
     FROM node_summaries
     WHERE node_id = $1
     LIMIT 1`,
    [nodeId]
  );

  if (rows[0]) {
    return rows[0];
  }

  return {
    path_summary: '',
    parent_summary: fallbackText || '',
    rolling_summary: null,
  };
}

async function fetchTreeSummary(client, treeId) {
  const { rows } = await client.query(
    `SELECT tree_summary FROM trees WHERE id = $1 LIMIT 1`,
    [treeId]
  );
  const raw = rows[0]?.tree_summary;
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    return raw.text || raw.summary || raw.content || '';
  }
  return '';
}

async function fetchRecentPathNodes(client, nodeId, limit = 4) {
  if (!nodeId) return [];
  const { rows } = await client.query(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, role, text, created_at, topic_tag, reasoning_content, thought_signature
      FROM nodes
      WHERE id = $1
      UNION ALL
      SELECT n.id, n.parent_id, n.role, n.text, n.created_at, n.topic_tag, n.reasoning_content, n.thought_signature
      FROM nodes n
      JOIN ancestors a ON a.parent_id = n.id
      WHERE n.soft_deleted_at IS NULL
    ),
    ancestor_uploads AS (
      SELECT 
        a.id as node_id,
        json_agg(json_build_object(
          'id', u.id,
          'file_name', u.file_name,
          'mime_type', u.mime_type
        ) ORDER BY u.created_at) as attachments
      FROM ancestors a
      JOIN turns t ON t.node_id = a.id
      JOIN turn_uploads tu ON tu.turn_id = t.id
      JOIN uploads u ON u.id = tu.upload_id
      GROUP BY a.id
    )
    SELECT 
      a.role, a.text, a.topic_tag, a.reasoning_content, a.thought_signature,
      COALESCE(au.attachments, '[]'::json) as attachments
    FROM ancestors a
    LEFT JOIN ancestor_uploads au ON au.node_id = a.id
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [nodeId, limit]
  );
  return rows.map((row) => ({
    role: row.role || 'user',
    text: row.text || '',
    topic_tag: row.topic_tag || null,
    reasoning_content: typeof row.reasoning_content === 'string' ? row.reasoning_content : null,
    thought_signature: typeof row.thought_signature === 'string' ? row.thought_signature : null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  }));
}

// Exported helpers for Ollama client-side bridge
export { buildRelevanceContext, ensureTreeOwnership, resolveActiveParent, isNativeFileProvider };
