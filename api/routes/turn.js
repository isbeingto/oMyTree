import { Router } from 'express';
import { validate as uuidValidate } from 'uuid';
import { pool } from '../db/pool.js';
import { createTurn } from '../services/turn/create.js';
import { retryTurn } from '../services/turn/retry.js';
import { applyRateQuotaHeaders } from '../lib/rate_quota_headers.js';
import { isLlmError, mapLlmError } from '../services/llm/errors.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { writeAuditLog } from '../lib/audit_log.js';
import { resolveWorkspaceWeKnoraApiKey } from '../services/workspaces/weknora_credentials.js';
import { resolveWorkspaceIdForUser } from '../services/workspaces/request_context.js';
// NOTE: Auto-recall of "成果资产库" has been removed (2026-02-10).
// The founder's design intent is: users manually select knowledge bases in the UI;
// the system should NOT silently inject knowledge base searches.
// Outcome assets remain available as a regular KB in the Knowledge Panel
// for users to select explicitly.

const router = Router();

function resolveProviderOptions(req) {
  const providerSources = [
    req.query?.provider,
    req.query?.provider_override,
    req.body?.provider,
    req.body?.provider_override,
  ];
  const normalizedProvider = providerSources.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  const modeSources = [
    req.query?.provider_mode,
    req.query?.mode,
    req.body?.provider_mode,
    req.body?.mode,
  ];
  const normalizedMode = modeSources.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  const modelSources = [
    req.query?.model,
    req.body?.model,
  ];
  const normalizedModel = modelSources.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  return {
    provider: normalizedProvider ? normalizedProvider.trim() : null,
    provider_mode: normalizedMode ? normalizedMode.trim() : null,
    model: normalizedModel ? normalizedModel.trim() : null,
  };
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res?.locals?.traceId ?? req?.headers?.["x-trace-id"] ?? null;
}

// GET /api/turn/:id - Retrieve turn by ID (read-only)
router.get('/api/turn/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!uuidValidate(id || '')) {
      return res.status(422).json({
        ok: false,
        error: 'INVALID_TURN_ID',
        message: 'Turn id is invalid',
        trace_id: req.headers['x-trace-id']
      });
    }
    const userId = await getAuthUserIdForRequest(req, pool);

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
           t.id,
           t.node_id,
           t.user_text,
           t.ai_text,
           t.status,
           t.usage_json,
           t.created_at,
           t.routed,
           t.provider,
           t.model,
           t.is_byok,
           t.intent,
           n.tree_id,
           n.parent_id,
           n.level AS node_level,
           n.role AS node_role,
           n.text AS node_text,
           n.soft_deleted_at AS node_soft_deleted,
           n.created_at AS node_created_at,
           n.topic_tag AS node_topic_tag
         FROM turns t
         JOIN nodes n ON n.id = t.node_id
          JOIN trees tr ON tr.id = n.tree_id
        WHERE t.id = $1
          AND tr.user_id = $2
          AND t.soft_deleted_at IS NULL
          AND n.soft_deleted_at IS NULL
        LIMIT 1`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: 'TURN_NOT_FOUND',
          message: 'Turn not found',
          trace_id: req.headers['x-trace-id']
        });
      }

      const turn = result.rows[0];
      const auditRes = await client.query(
        `SELECT payload, created_at
         FROM events
         WHERE turn_id = $1 AND event_type = 'turn.relevance_decision'
         ORDER BY created_at DESC
         LIMIT 1`,
        [id]
      );
      const auditRow = auditRes.rows[0] || null;
      const auditPayload = auditRow ? auditRow.payload : null;
      return res.status(200).json({
        ok: true,
        turn: {
          id: turn.id,
          tree_id: turn.tree_id,
          node_id: turn.node_id,
          parent_id: turn.parent_id,
          user_text: turn.user_text,
          ai_text: turn.ai_text ?? '',
          status: turn.status,
          usage_json: turn.usage_json ?? null,
          routed: turn.routed,
          created_at: turn.created_at,
          ai_pending: turn.status === 'pending',
          provider: turn.provider ?? null,
          model: turn.model ?? null,
          is_byok: turn.is_byok ?? null,
          intent: turn.intent ?? null,
        },
        node: {
          id: turn.node_id,
          tree_id: turn.tree_id,
          parent_id: turn.parent_id,
          level: turn.node_level,
          role: turn.node_role,
          text: turn.node_text,
          soft_deleted_at: turn.node_soft_deleted,
          created_at: turn.node_created_at,
          topic_tag: turn.node_topic_tag ?? null,
        },
        relevance_audit: auditPayload
          ? {
              ...auditPayload,
              logged_at: auditRow.created_at
            }
          : null,
        trace_id: req.headers['x-trace-id']
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('GET /api/turn/:id error:', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: req.headers['x-trace-id']
    });
  }
});

router.post('/api/turn', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  const respond = (status, payload) => {
    applyRateQuotaHeaders(res, 'turn');
    return res.status(status).json(payload);
  };
  try {
    const { tree_id, node_id, user_text, with_ai, who, route_mode, route_token } = req.body;
    let { knowledge, knowledge_base_ids } = req.body || {};
    const userId = await getAuthUserIdForRequest(req, pool);
    const providerOptions = resolveProviderOptions(req);

    let weknoraApiKey = null;
    const wantsExplicitKnowledge =
      (knowledge && typeof knowledge === 'object' && (knowledge.baseId || knowledge.base_id)) ||
      (Array.isArray(knowledge_base_ids) && knowledge_base_ids.length > 0);

    if (wantsExplicitKnowledge) {
      const workspaceId = await resolveWorkspaceIdForUser({ db: pool, req, userId });
      weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pool, workspaceId });
    }

    const result = await createTurn({
      tree_id,
      node_id,
      user_text,
      with_ai: with_ai !== false,
      who: who || 'unknown',
      trace_id: traceId,
      route_mode,
      route_token,
      provider: providerOptions.provider,
      provider_mode: providerOptions.provider_mode,
      model: providerOptions.model,
      knowledge,
      knowledge_base_ids,
      weknora_api_key: weknoraApiKey,
      user_id: userId,
    });

    const hasDecision = result && result.pending_decision;
    const aiPending = result && result.turn && result.turn.ai_pending;
    const statusCode = hasDecision || aiPending ? 202 : 201;
    return respond(statusCode, {
      ...result,
      trace_id: traceId
    });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const meta = error.meta && typeof error.meta === 'object' ? error.meta : null;
    if (isLlmError(error)) {
      const llmErr = mapLlmError(error, { provider: error.provider });
      return respond(llmErr.status, {
        ok: false,
        error: {
          code: llmErr.code,
          provider: llmErr.provider,
          message: llmErr.message,
        },
        trace_id: traceId
      });
    }
    const baseError = {
      ok: false,
      error: code,
      code,
      message: error.message,
      trace_id: traceId
    };
    if (meta) {
      baseError.meta = meta;
    }

    if (status === 404) {
      return respond(404, baseError);
    }

    if (status === 422) {
      return respond(422, baseError);
    }

    if (status === 429) {
      return respond(429, baseError);
    }

    if (status === 503) {
      return respond(503, baseError);
    }

    console.error('POST /api/turn error:', error);
    return respond(500, {
      ok: false,
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
      message: error.message,
      trace_id: traceId
    });
  }
});

router.post('/api/turn/retry/:id', async (req, res) => {
  const traceId = req.headers['x-trace-id'];
  const respond = (status, payload) => {
    applyRateQuotaHeaders(res, 'turn');
    return res.status(status).json(payload);
  };

  try {
    const { id } = req.params;
    if (!uuidValidate(id || '')) {
      return respond(422, {
        ok: false,
        error: 'INVALID_TURN_ID',
        code: 'INVALID_TURN_ID',
        message: 'turn id is invalid',
        trace_id: traceId,
      });
    }

    const providerOptions = resolveProviderOptions(req);
    const userId = await getAuthUserIdForRequest(req, pool);
    const result = await retryTurn({
      turn_id: id,
      trace_id: traceId,
      provider: providerOptions.provider,
      provider_mode: providerOptions.provider_mode,
      model: providerOptions.model,
      user_id: userId,
    });
    return respond(200, {
      ...result,
      trace_id: traceId,
    });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || 'INTERNAL_ERROR';
    if (isLlmError(error)) {
      const llmErr = mapLlmError(error, { provider: error.provider });
      return respond(llmErr.status, {
        ok: false,
        error: {
          code: llmErr.code,
          provider: llmErr.provider,
          message: llmErr.message,
        },
        trace_id: traceId,
      });
    }
    return respond(status, {
      ok: false,
      error: code,
      code,
      message: error.message,
      trace_id: traceId,
    });
  }
});

export default router;
