import express from 'express';
import { validate as uuidValidate } from 'uuid';
import { evaluateRelevance } from '../services/llm/relevance.js';
import { getAnswer, getSummaries } from '../services/llm/index.js';
import { withTraceId } from '../lib/trace.js';
import { applyRateQuotaHeaders } from '../lib/rate_quota_headers.js';
import { isLlmError, mapLlmError } from '../services/llm/errors.js';

function invalid(res, status, message, kind = null) {
  if (kind) {
    applyRateQuotaHeaders(res, kind);
  }
  return res.status(status).json(
    withTraceId(res, {
      ok: false,
      error: message,
    }),
  );
}

function respondLlmError(res, error, { kind = null } = {}) {
  const normalized = mapLlmError(error, { provider: error.provider });
  if (kind) {
    applyRateQuotaHeaders(res, kind);
  }
  return res.status(normalized.status).json(
    withTraceId(res, {
      ok: false,
      error: {
        code: normalized.code,
        provider: normalized.provider,
        message: normalized.message,
      },
    })
  );
}

const VALID_CLASSIFICATIONS = new Set(['in', 'side', 'new']);
const VALID_PROVIDERS = new Set(['mock', 'openai']);

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeParentSummary(body) {
  const summary = { path_summary: '', parent_summary: '' };

  if (body && typeof body.parent_summary === 'object' && body.parent_summary !== null) {
    summary.path_summary = normalizeString(body.parent_summary.path_summary ?? '');
    summary.parent_summary = normalizeString(body.parent_summary.parent_summary ?? '');
  } else if (typeof body?.parent_summary === 'string') {
    summary.parent_summary = normalizeString(body.parent_summary);
  }

  const pathSummary = normalizeString(body?.path_summary);
  if (pathSummary) {
    summary.path_summary = pathSummary;
  }

  return summary;
}

function normalizeBreadcrumb(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeChoice(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : '';
}

export default function createLlmRouter() {
  const router = express.Router();

  router.post('/api/llm/answer', async (req, res) => {
    try {
      const body = req.body || {};
      const treeId = typeof body.tree_id === 'string' ? body.tree_id.trim() : '';
      const userText = typeof body.user_text === 'string' ? body.user_text.trim() : '';

      if (!treeId) {
        return invalid(res, 422, 'INVALID_TREE_ID');
      }

      if (!userText) {
        return invalid(res, 422, 'INVALID_USER_TEXT');
      }

      const nodeId = typeof body.node_id === 'string' ? body.node_id.trim() : '';
      const pathSummary = typeof body.path_summary === 'string' ? body.path_summary.trim() : '';
      const parentSummary =
        typeof body.parent_summary === 'string' ? body.parent_summary.trim() : '';

      const payload = {
        tree_id: treeId,
        node_id: nodeId || null,
        user_text: userText,
        path_summary: pathSummary || null,
        parent_summary: parentSummary || null,
      };

      const result = await getAnswer(payload);
      const aiText = typeof result?.ai_text === 'string' ? result.ai_text.trim() : '';
      const usageJson = result?.usage_json ?? null;

      return res.json(
        withTraceId(res, {
          ok: true,
          ai_text: aiText,
          usage_json: usageJson,
        })
      );
    } catch (error) {
      if (isLlmError(error)) {
        return respondLlmError(res, error);
      }
      console.error('[LLM Answer] POST failed:', error);
      return invalid(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.post('/api/llm/summarize', async (req, res) => {
    try {
      const body = req.body || {};
      const treeId = normalizeString(body.tree_id);
      if (!treeId) {
        return invalid(res, 422, 'INVALID_TREE_ID', 'summarize');
      }

      const nodeIdRaw = typeof body.node_id === 'string' ? body.node_id.trim() : '';
      if (!nodeIdRaw || !uuidValidate(nodeIdRaw)) {
        return invalid(res, 422, 'INVALID_NODE_ID', 'summarize');
      }

      const providerOverrideRaw = normalizeChoice(req.query.provider);
      if (providerOverrideRaw && !VALID_PROVIDERS.has(providerOverrideRaw)) {
        return invalid(res, 422, 'INVALID_PROVIDER', 'summarize');
      }

      const userText = normalizeString(body.user_text);
      const pathSummary = normalizeString(body.path_summary);
      const parentSummary = normalizeString(body.parent_summary);
      const breadcrumb = normalizeBreadcrumb(body.breadcrumb);
      const topic = normalizeString(body.topic || body.root_topic);
      const parentText = normalizeString(body.parent_text);
      const recentTurns = Array.isArray(body.recent_turns) ? body.recent_turns : [];

      const summaries = await getSummaries(
        {
          tree_id: treeId,
          node_id: nodeIdRaw,
          user_text: userText,
          path_summary: pathSummary,
          parent_summary: parentSummary,
          breadcrumb,
          topic,
          parent_text: parentText,
          recent_turns: recentTurns,
        },
        {
          providerOverride: providerOverrideRaw || undefined,
        }
      );

      applyRateQuotaHeaders(res, 'summarize');
      return res.json(
        withTraceId(res, {
          ok: true,
          summaries: {
            path_summary: summaries.path_summary,
            parent_summary: summaries.parent_summary,
          },
          usage_json: summaries.usage_json ?? null,
          meta: {
            provider: summaries.provider ?? null,
            source: summaries.source ?? 'fallback',
            trace_id: res.locals?.traceId ?? null,
          },
        })
      );
    } catch (error) {
      if (error?.code === 'INVALID_TREE_ID' || error?.code === 'INVALID_NODE_ID') {
        return invalid(res, 422, error.code, 'summarize');
      }
      if (isLlmError(error)) {
        return respondLlmError(res, error, { kind: 'summarize' });
      }
      console.error('[LLM Summaries] POST failed:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'summarize');
    }
  });

  router.post('/api/llm/relevance', async (req, res) => {
    try {
      const body = req.body || {};
      const treeId = normalizeString(body.tree_id);
      const nodeId = typeof body.node_id === 'string' ? body.node_id.trim() : null;
      const userText = normalizeString(body.user_text);

      if (!treeId) {
        return invalid(res, 422, 'INVALID_TREE_ID', 'relevance');
      }

      if (!userText) {
        return invalid(res, 422, 'INVALID_USER_TEXT', 'relevance');
      }

      const forceParam = normalizeChoice(req.query.force);
      if (forceParam && !VALID_CLASSIFICATIONS.has(forceParam)) {
        return invalid(res, 422, 'INVALID_FORCE_VALUE', 'relevance');
      }

      const providerOverrideRaw = normalizeChoice(req.query.provider);
      if (providerOverrideRaw && !VALID_PROVIDERS.has(providerOverrideRaw)) {
        return invalid(res, 422, 'INVALID_PROVIDER', 'relevance');
      }

      if (forceParam) {
        console.info(
          `[LLM Relevance] tree=${treeId} node=${nodeId ?? 'root'} forced=${forceParam}`
        );
        applyRateQuotaHeaders(res, 'relevance');
        return res.json(
          withTraceId(res, {
            ok: true,
            classification: forceParam,
            confidence: 1,
            source: 'forced',
            usage_json: null,
            meta: {
              tree_id: treeId,
              node_id: nodeId,
              rule_hits: [],
              provider: null,
              rule_score: 1,
            },
          }),
        );
      }

      const parentSummary = normalizeParentSummary(body);
      const breadcrumb = normalizeBreadcrumb(body.breadcrumb);
      const rootTopic = normalizeString(body.root_topic);

      const relevance = await evaluateRelevance(
        {
          rootTopic,
          breadcrumb,
          parentSummary,
          userText,
        },
        {
          providerOverride: providerOverrideRaw || undefined,
          traceId: res.locals?.traceId,
        }
      );

      const confidenceLog = Number.isFinite(relevance.confidence)
        ? relevance.confidence.toFixed(3)
        : 'n/a';

      console.info(
        `[LLM Relevance] tree=${treeId} node=${nodeId ?? 'root'} classified=${relevance.classification} source=${relevance.source} conf=${confidenceLog}`
      );

      applyRateQuotaHeaders(res, 'relevance');
      return res.json(
        withTraceId(res, {
          ok: true,
          classification: relevance.classification,
          confidence: relevance.confidence,
          source: relevance.source,
          usage_json: relevance.usage_json ?? null,
          meta: {
            tree_id: treeId,
            node_id: nodeId,
            rule_hits: relevance.meta?.rule_hits ?? [],
            provider: relevance.meta?.provider ?? null,
            rule_score: relevance.meta?.rule_score ?? 0,
            rule_raw_score: relevance.meta?.rule_raw_score ?? 0,
          },
        }),
      );
    } catch (error) {
      if (isLlmError(error)) {
        return respondLlmError(res, error, { kind: 'relevance' });
      }
      console.error('[RelevanceRoute] POST failed:', error);
      applyRateQuotaHeaders(res, 'relevance');
      return res.json(
        withTraceId(res, {
          ok: false,
          error: 'RELEVANCE_EVALUATION_FAILED',
          message: error.message,
        })
      );
    }
  });

  return router;
}
