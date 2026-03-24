import { Router } from 'express';
import { pool } from '../db/pool.js';
import { applyRateQuotaHeaders } from '../lib/rate_quota_headers.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { createTurn } from '../services/turn/create.js';
import { isLlmError, mapLlmError } from '../services/llm/errors.js';
import { registerStreamAbort, removeStream } from '../lib/stream_abort_registry.js';
import { resolveWorkspaceWeKnoraApiKey } from '../services/workspaces/weknora_credentials.js';
import { resolveWorkspaceIdForUser } from '../services/workspaces/request_context.js';

function parseBooleanEnv(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const TURN_STREAM_DEBUG = parseBooleanEnv(process.env.TURN_STREAM_DEBUG);
const TURN_STREAM_DEBUG_SSE = parseBooleanEnv(process.env.TURN_STREAM_DEBUG_SSE) || TURN_STREAM_DEBUG;

function debugLog(...args) {
  if (TURN_STREAM_DEBUG) {
    console.log(...args);
  }
}

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

function writeSse(res, payload) {
  if (res.writableEnded) return;
  try {
    const jsonStr = JSON.stringify(payload);
    if (TURN_STREAM_DEBUG_SSE) {
      const logPayload = {
        type: payload.type,
        ...(payload.type === 'error' && { error: payload.error }),
        ...(payload.type === 'done' && {
          hasUserNode: !!payload.user_node,
          hasAiNode: !!payload.ai_node,
          hasReasoning: !!payload.has_reasoning,
          provider: payload.provider,
          model: payload.model,
        }),
      };
      console.log('[turn.stream] writeSse:', JSON.stringify(logPayload));
    }
    res.write(`data: ${jsonStr}\n\n`);
  } catch (err) {
    // 写入失败，客户端可能已断开连接
    console.error('[turn.stream] writeSse error:', err?.message, 'type:', payload?.type);
  }
}

export default function createTurnStreamRouter() {
  const router = Router();

  router.post('/api/turn/stream', async (req, res) => {
    const traceId = req.headers['x-trace-id'];
    // 提前解析 providerOptions，以便在 catch 块中使用
    const providerOptions = resolveProviderOptions(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    applyRateQuotaHeaders(res, 'turn');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(': ping\n\n');
      } catch (err) {
        console.warn('[turn.stream] heartbeat failed:', err?.message || err);
      }
    }, 15000);

    const abortController = new AbortController();
    let streamStarted = false;
    let streamCompleted = false;
    
    req.on('close', () => {
      clearInterval(heartbeat);
      if (streamCompleted || abortController.signal.aborted) {
        return;
      }

      // 如果流已开始，客户端关闭连接应立即中止后端 LLM 流，确保“停止生成”生效
      if (streamStarted) {
        debugLog('[turn.stream] req.close during active stream (abort now)');
        abortController.abort(new Error('client disconnected'));
        return;
      }

      // 流未开始时：保留延迟中止，避免极少数误触发
      setTimeout(() => {
        if (!streamStarted && !streamCompleted && !abortController.signal.aborted) {
          debugLog('[turn.stream] req.close event fired before stream started (delayed abort)');
          abortController.abort(new Error('client disconnected'));
        }
      }, 500);
    });
    
    const markStreamStarted = () => { streamStarted = true; };
    const markStreamCompleted = () => { streamCompleted = true; };

    let activeTurnId = null;
    try {
      const { 
        tree_id, 
        node_id, 
        user_text, 
        with_ai, 
        who, 
        route_mode, 
        route_token, 
        upload_ids, 
        knowledge,
        knowledge_base_ids,
        enable_grounding 
      } = req.body;
      const userId = await getAuthUserIdForRequest(req, pool);
      debugLog(`[turn_stream] provider from frontend: req.body.provider=${req.body?.provider} req.body.provider_override=${req.body?.provider_override} resolved=${providerOptions.provider}`);
      // T85: Log upload_ids if present
      if (upload_ids && Array.isArray(upload_ids) && upload_ids.length > 0) {
        debugLog(`[turn_stream] upload_ids attached: ${upload_ids.join(', ')}`);
      }
      if (knowledge_base_ids && Array.isArray(knowledge_base_ids) && knowledge_base_ids.length > 0) {
        debugLog(`[turn_stream] knowledge_base_ids attached: ${knowledge_base_ids.join(', ')}`);
      }
      if (knowledge && typeof knowledge === 'object') {
        const baseId = knowledge?.baseId ?? knowledge?.base_id ?? null;
        const docIds = Array.isArray(knowledge?.documentIds)
          ? knowledge.documentIds
          : Array.isArray(knowledge?.document_ids)
            ? knowledge.document_ids
            : [];
        debugLog(`[turn_stream] knowledge attached: baseId=${baseId || 'null'} docIds=${docIds.length}`);
      }

      let weknoraApiKey = null;
      const wantsKnowledge =
        (knowledge && typeof knowledge === 'object' && (knowledge.baseId || knowledge.base_id)) ||
        (Array.isArray(knowledge_base_ids) && knowledge_base_ids.length > 0);
      if (wantsKnowledge) {
        const workspaceId = await resolveWorkspaceIdForUser({ db: pool, req, userId });
        weknoraApiKey = await resolveWorkspaceWeKnoraApiKey({ client: pool, workspaceId });
      }

      const turnResult = await createTurn({
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
        enable_grounding: enable_grounding === true,
        upload_ids, // T85: Pass upload_ids to createTurn
        knowledge,
        knowledge_base_ids,
        weknora_api_key: weknoraApiKey,
        user_id: userId,
      }, {
        enableStreaming: true,
        signal: abortController.signal,
        onStart: (meta) => {
          markStreamStarted();
          activeTurnId = meta?.turn_id || null;
          if (activeTurnId) {
            registerStreamAbort(activeTurnId, abortController);
          }
          writeSse(res, { type: 'start', trace_id: traceId, ...meta });
        },
        onReasoningDelta: (text) => writeSse(res, { type: 'reasoning', text }),
        onDelta: (text) => writeSse(res, { type: 'delta', text }),
      });

      const reasoningText = turnResult.ai_node?.reasoning_content;
      writeSse(res, {
        type: 'done',
        turn: turnResult.turn,
        user_node: turnResult.user_node,
        ai_node: turnResult.ai_node,
        citations: turnResult.citations,
        has_reasoning: Boolean(reasoningText),
        reasoning_length: typeof reasoningText === 'string' ? reasoningText.length : 0,
        usage: turnResult.turn?.usage_json ?? turnResult.usage_json ?? null,
        provider: turnResult.turn?.provider ?? turnResult.provider ?? providerOptions.provider ?? null,
        model: turnResult.turn?.model ?? providerOptions.model ?? null,
        is_byok: turnResult.turn?.is_byok ?? null,
        trace_id: traceId,
      });
      markStreamCompleted();
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      console.error(`[turn_stream] Error:`, error);
      // 优先使用 error.provider，如果没有则使用请求中的 providerOptions.provider
      const errorProvider = error?.provider || providerOptions?.provider || 'unknown';
      const normalized = isLlmError(error)
        ? error
        : mapLlmError(error, { provider: errorProvider });
      writeSse(res, {
        type: 'error',
        error: {
          code: normalized.code || 'INTERNAL_ERROR',
          provider: normalized.provider,
          message: normalized.message,
        },
        trace_id: traceId,
      });
      markStreamCompleted();
      if (!res.writableEnded) {
        res.end();
      }
    } finally {
      if (activeTurnId) {
        removeStream(activeTurnId);
      }
      clearInterval(heartbeat);
    }
  });

  return router;
}
