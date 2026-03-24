import { pool, getClient } from '../../db/pool.js';
import bus from '../../bus/event_bus.js';
import { getAnswer } from '../llm/index.js';
import { maybeUpdateRollingSummary } from '../llm/rolling_summary.js';
import {
  recordTurnCompletedEvent,
} from './turn_events.js';
import { resolveProviderForRequest } from '../llm/providers/index.js';
import { mapLlmError, recordLlmErrorEvent } from '../llm/errors.js';
import { recomputeTreeCounters } from '../tree/counters.js';
import { CONTEXT_MESSAGE_LIMITS } from '../llm/context_limits.js';

function isNativeFileProvider(providerName) {
  const normalized = typeof providerName === 'string' ? providerName.trim().toLowerCase() : '';
  return (
    normalized === 'google' ||
    normalized === 'gemini' ||
    normalized === 'openai' ||
    normalized === 'anthropic' ||
    normalized === 'claude'
  );
}

async function loadUploadAttachments(client, uploadIds) {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return [];

  const { rows } = await client.query(
    `SELECT id, content_bytes, file_name, mime_type
       FROM uploads
      WHERE id = ANY($1::uuid[])`,
    [uploadIds]
  );
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

async function hydrateHistoryAttachments(client, recentTurns) {
  if (!Array.isArray(recentTurns) || recentTurns.length === 0) return;

  const allUploadIds = [];
  for (const turn of recentTurns) {
    if (!Array.isArray(turn.attachments) || turn.attachments.length === 0) continue;
    for (const att of turn.attachments) {
      if (att?.id) allUploadIds.push(att.id);
    }
  }
  if (allUploadIds.length === 0) return;

  const hydrated = await loadUploadAttachments(client, allUploadIds);
  const hydratedById = new Map(hydrated.map((a) => [String(a.id), a]));

  for (const turn of recentTurns) {
    if (!Array.isArray(turn.attachments) || turn.attachments.length === 0) continue;
    turn.hydratedAttachments = turn.attachments
      .map((a) => hydratedById.get(String(a.id)))
      .filter(Boolean);
  }
}

export async function retryTurn(params) {
  const { turn_id, trace_id, provider, provider_mode, model, user_id } = params;

  if (!turn_id || typeof turn_id !== 'string') {
    throw { status: 422, code: 'INVALID_TURN_ID', message: 'turn_id is required for retry' };
  }
  const userId = typeof user_id === 'string' ? user_id.trim() : '';
  if (!userId) {
    throw { status: 422, code: 'INVALID_USER_ID', message: 'user_id is required for retry' };
  }

  const providerOverride =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : null;
  const providerModeOverride =
    typeof provider_mode === 'string' && provider_mode.trim().length > 0
      ? provider_mode.trim()
      : null;
  const modelOverride =
    typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
  const providerMeta = await resolveProviderForRequest({
    providerHint: providerOverride || undefined,
    modelHint: modelOverride,
    userId,
  });
  const resolvedProviderName = providerMeta.name || providerOverride || 'omytree-default';
  const defaultModel = providerMeta.defaultModel || null;
  const isByokRequest = providerMeta.isByok;
  const requestedModel = modelOverride || defaultModel || null;

  // T-FIX: Use getClient() which attaches error handler to prevent crashes
  const client = await getClient();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const turnResult = await client.query(
      `SELECT
         t.id AS turn_id,
         t.node_id,
         t.user_text,
         t.ai_text,
         t.status,
         t.usage_json,
         t.routed,
         n.tree_id,
         n.parent_id,
         n.level AS node_level,
         n.role AS node_role,
         n.text AS node_text,
         n.created_at AS node_created_at
       FROM turns t
       JOIN nodes n ON n.id = t.node_id
       JOIN trees tr ON tr.id = n.tree_id
       WHERE t.id = $1
         AND tr.user_id = $2
         AND t.soft_deleted_at IS NULL
         AND n.soft_deleted_at IS NULL
       FOR UPDATE`,
      [turn_id, userId]
    );

    if (turnResult.rows.length === 0) {
      throw { status: 404, code: 'TURN_NOT_FOUND', message: 'Turn not found' };
    }

    const turnRow = turnResult.rows[0];
    if (turnRow.status !== 'pending') {
      throw {
        status: 422,
        code: 'INVALID_TURN_STATE',
        message: 'Turn is not pending and cannot be retried',
      };
    }

    const parentText = await fetchNodeText(client, turnRow.parent_id, userId);
    const parentSummary = await fetchParentLensSummary(client, turnRow.parent_id, parentText, userId);
    const treeMeta = await fetchTreeMeta(client, turnRow.tree_id, userId);

    // P1-02: Fetch recent_turns for semantic selection in retry path
    const profile = treeMeta?.context_profile || 'lite';
    const limits = CONTEXT_MESSAGE_LIMITS[profile] || CONTEXT_MESSAGE_LIMITS.lite;
    const turnLimit = ((limits.recentTurnPairs || limits.recentTurns) * 2) || 4;
    const recentTurns = await fetchRecentPathNodes(client, turnRow.parent_id, turnLimit);

    // T85-Native / P1-02: Hydrate history attachments for native file providers (fail-open)
    const providerForHistory = providerOverride || resolvedProviderName;
    if (isNativeFileProvider(providerForHistory)) {
      try {
        await hydrateHistoryAttachments(client, recentTurns);
      } catch (hydrateErr) {
        console.warn('[retryTurn] Failed to hydrate history attachments:', hydrateErr?.message || hydrateErr);
      }
    }

    let aiNode = null;
    let usageJson = null;
    let aiText = '';
    let providerUsed = resolvedProviderName;
    let modelUsed = requestedModel;
    let isByokUsed = isByokRequest;

    try {
      // Avoid extra hard timeout wrapper; rely on LLM driver/provider timeout controls.
      const response = await getAnswer(
        {
          tree_id: turnRow.tree_id,
          node_id: turnRow.parent_id,
          user_text: turnRow.user_text,
          path_summary: parentSummary.path_summary ?? null,
          parent_summary: parentSummary.parent_summary ?? null,
          rolling_summary: parentSummary.rolling_summary ?? null,
          // P1-02: Add context params for semantic selection
          context_profile: profile,
          memory_scope: treeMeta?.memory_scope || 'branch',
          recent_turns: recentTurns,
          user_language: treeMeta?.preferred_language || 'en',
        },
        {
          provider: providerOverride || resolvedProviderName,
          mode: providerModeOverride,
          model: modelOverride,
          userId,
        }
      );

      aiText = typeof response?.ai_text === 'string' ? response.ai_text.trim() : '';
      usageJson = response?.usage_json ?? null;
      providerUsed = response?.provider || resolvedProviderName;
      modelUsed = response?.model || modelOverride || defaultModel || null;
      isByokUsed = response?.is_byok ?? isByokRequest;

      const aiNodeRes = await client.query(
        `INSERT INTO nodes (tree_id, parent_id, level, role, text, created_at, provider, model, is_byok)
         VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
         RETURNING id, tree_id, parent_id, level, role, text, created_at, provider, model, is_byok`,
        [
          turnRow.tree_id,
          turnRow.node_id,
          (turnRow.node_level || 0) + 1,
          'ai',
          aiText,
          providerUsed,
          modelUsed,
          isByokUsed,
        ]
      );
      aiNode = aiNodeRes.rows[0];

      bus.emit('node.created', {
        tree_id: aiNode.tree_id,
        node_id: aiNode.id,
        payload: {
          role: 'ai',
          level: aiNode.level,
          parent_id: aiNode.parent_id,
          who: 'retry',
          trace_id,
          routed: turnRow.routed,
        },
      });

      await client.query(
        `UPDATE turns
            SET ai_text = $1,
                status = $2,
                usage_json = $3,
                provider = $4,
                model = $5,
                is_byok = $6
          WHERE id = $7`,
        [
          aiText,
          'completed',
          usageJson ? JSON.stringify(usageJson) : 'null',
          providerUsed,
          modelUsed,
          isByokUsed,
          turn_id,
        ]
      );

      const completedPayload = {
        who: 'retry',
        trace_id,
        usage: usageJson,
        routed: turnRow.routed,
        decision: 'retry',
        status: 'completed',
        with_ai: true,
        ai_node_id: aiNode.id,
        retry: true,
        retry_provider: providerOverride || 'auto',
        retry_mode: providerModeOverride || null,
      };
      bus.emit('turn.completed', {
        tree_id: turnRow.tree_id,
        node_id: turnRow.node_id,
        payload: completedPayload,
      });
      await recordTurnCompletedEvent(client, {
        treeId: turnRow.tree_id,
        nodeId: turnRow.node_id,
        turnId: turn_id,
        traceId: trace_id,
        payload: completedPayload,
      });
    } catch (llmError) {
      const normalizedError = mapLlmError(llmError, {
        provider: providerOverride || resolvedProviderName,
        isByok: isByokRequest,
      });
      await recordLlmErrorEvent({
        pool,
        userId,
        treeId: turnRow.tree_id,
        provider: normalizedError.provider,
        errorCode: normalizedError.code,
        message: normalizedError.message,
        rawError: normalizedError.raw || llmError?.message,
        isByok: normalizedError.isByok,
        traceId: trace_id,
      });
      throw normalizedError;
    }

    await recomputeTreeCounters(client, turnRow.tree_id);
    // Update trees.updated_at to reflect latest activity
    await client.query('UPDATE trees SET updated_at = now() WHERE id = $1', [turnRow.tree_id]);
    await client.query('COMMIT');
    inTransaction = false;

    // P0-04: Refresh rolling summary asynchronously (write-path) with advisory lock.
    // Retries also create a completed AI node; keep behavior aligned with turn.create.
    if (aiNode?.id) {
      setImmediate(() => {
        maybeUpdateRollingSummary({
          pool,
          nodeId: aiNode.id,
          profile: treeMeta?.context_profile || 'lite',
          context: {
            topic: treeMeta?.topic || '',
            userLanguage: treeMeta?.preferred_language || 'en',
          },
          userId,
          providerHint: providerOverride || providerUsed || null,
        }).catch((err) => {
          console.warn('[retry] rolling summary refresh failed:', err?.message || err);
        });
      });
    }

    return {
      ok: true,
      user_node: {
        id: turnRow.node_id,
        tree_id: turnRow.tree_id,
        parent_id: turnRow.parent_id,
        level: turnRow.node_level,
        role: turnRow.node_role,
        text: turnRow.node_text,
        created_at: turnRow.node_created_at,
      },
      ai_node: aiNode
        ? {
          id: aiNode.id,
          tree_id: aiNode.tree_id,
          parent_id: aiNode.parent_id,
          level: aiNode.level,
          role: aiNode.role,
          text: aiNode.text,
          created_at: aiNode.created_at,
          provider: aiNode.provider ?? providerUsed,
          model: aiNode.model ?? modelUsed,
          is_byok: aiNode.is_byok ?? isByokUsed,
        }
        : null,
      turn: {
        id: turn_id,
        node_id: turnRow.node_id,
        user_text: turnRow.user_text,
        ai_text: aiText,
        usage_json: usageJson,
        status: 'completed',
        routed: turnRow.routed,
        ai_pending: false,
        provider: providerUsed,
        model: modelUsed,
        is_byok: isByokUsed,
      },
    };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
        inTransaction = false;
      } catch (rollbackErr) {
        console.warn('[retry] ROLLBACK failed in catch:', rollbackErr?.message);
      }
    }
    throw error;
  } finally {
    // Safety net: ensure transaction is rolled back before release
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
        console.warn('[retry] finally block: rolled back lingering transaction');
      } catch (rollbackErr) {
        console.warn('[retry] finally block: rollback failed:', rollbackErr?.message);
      }
    }
    client.release();
  }
}

async function fetchParentLensSummary(client, nodeId, fallbackText, userId) {
  if (!nodeId) {
    return {
      path_summary: '',
      parent_summary: fallbackText || '',
      rolling_summary: null,
    };
  }

  const { rows } = await client.query(
    `SELECT ns.path_summary, ns.parent_summary, ns.rolling_summary
       FROM node_summaries ns
       JOIN nodes n ON n.id = ns.node_id
       JOIN trees t ON t.id = n.tree_id
      WHERE ns.node_id = $1
        AND t.user_id = $2
      LIMIT 1`,
    [nodeId, userId]
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

async function fetchNodeText(client, nodeId, userId) {
  if (!nodeId) {
    return '';
  }
  const { rows } = await client.query(
    `SELECT n.text
       FROM nodes n
       JOIN trees t ON t.id = n.tree_id
      WHERE n.id = $1
        AND t.user_id = $2
      LIMIT 1`,
    [nodeId, userId]
  );
  return rows[0]?.text ?? '';
}

async function fetchTreeMeta(client, treeId, userId) {
  const { rows } = await client.query(
    `SELECT t.topic, t.context_profile, t.memory_scope, u.preferred_language
       FROM trees t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = $1
        AND t.user_id = $2
      LIMIT 1`,
    [treeId, userId]
  );
  return rows[0] || null;
}

// P1-02: Fetch recent path nodes for semantic selection (copied from create.js)
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
