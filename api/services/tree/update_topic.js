import { validate as uuidValidate } from 'uuid';

import { getTopicSemanticGuard } from '../llm/index.js';
import { pool } from '../../db/pool.js';

const TOPIC_MAX_LENGTH = Math.max(1, parseInt(process.env.ROOT_TOPIC_MAX_LENGTH || '256', 10));
const UPDATED_BY_MAX_LENGTH = Math.max(4, parseInt(process.env.ROOT_TOPIC_UPDATED_BY_MAX || '64', 10));
const SCORE_THRESHOLD_RAW = Number.parseFloat(process.env.ROOT_TOPIC_SEMANTIC_THRESHOLD || '0.8');
const SCORE_THRESHOLD = Number.isFinite(SCORE_THRESHOLD_RAW)
  ? Math.min(Math.max(SCORE_THRESHOLD_RAW, 0), 1)
  : 0.8;
const DIFF_SUMMARY_LIMIT = 400;
const MAX_BREADCRUMB_ITEMS = 8;
const MAX_BREADCRUMB_LENGTH = 120;

export class TopicSemanticGuardError extends Error {
  constructor(message, { code, status = 500, guard = null } = {}) {
    super(message);
    this.name = 'TopicSemanticGuardError';
    this.code = code;
    this.status = status;
    this.guard = guard;
  }
}

function clampText(value, limit) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!limit || trimmed.length <= limit) {
    return trimmed;
  }
  return trimmed.slice(0, limit);
}

function sanitizeUpdatedBy(value) {
  if (typeof value !== 'string') {
    return 'system';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'system';
  }
  return clampText(trimmed, UPDATED_BY_MAX_LENGTH);
}

function sanitizeBreadcrumb(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const sanitized = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = clampText(item, MAX_BREADCRUMB_LENGTH);
    if (!trimmed) {
      continue;
    }
    sanitized.push(trimmed);
    if (sanitized.length >= MAX_BREADCRUMB_ITEMS) {
      break;
    }
  }
  return sanitized;
}

function normalizeTraceId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function sanitizeGuard(guard) {
  if (!guard || typeof guard !== 'object') {
    return {
      equivalent: false,
      score: 0,
      diff_summary: '',
      source: null,
      provider: null,
      usage_json: null,
    };
  }

  const numericScore = Number.isFinite(guard.score) ? guard.score : 0;
  return {
    equivalent: Boolean(guard.equivalent),
    score: Math.min(Math.max(numericScore, 0), 1),
    diff_summary: clampText(guard.diff_summary ?? '', DIFF_SUMMARY_LIMIT),
    source: typeof guard.source === 'string' ? guard.source : null,
    provider: typeof guard.provider === 'string' ? guard.provider : null,
    usage_json: guard.usage_json ?? null,
  };
}

async function recordSemanticGuardEvent(client, {
  treeId,
  rootId,
  createdBy,
  originalText,
  newText,
  breadcrumb,
  result,
  guard,
  reason = null,
  traceId = null,
}) {
  const sanitizedGuard = sanitizeGuard(guard);
  const payload = {
    old_topic: originalText,
    new_topic: newText,
    breadcrumb,
    result,
    equivalent: sanitizedGuard.equivalent,
    score: sanitizedGuard.score,
    diff_summary: sanitizedGuard.diff_summary,
    source: sanitizedGuard.source,
    provider: sanitizedGuard.provider,
    usage_json: sanitizedGuard.usage_json,
    created_by: createdBy,
    reason: reason ? clampText(reason, 200) : null,
  };

  await client.query(
    `INSERT INTO events(event_type, tree_id, node_id, payload, trace_id)
     VALUES ('tree.semantic_guard', $1, $2, $3::jsonb, COALESCE($4::uuid, uuid_generate_v4()))`,
    [treeId, rootId, JSON.stringify(payload), normalizeTraceId(traceId)]
  );
}

async function fetchTreeWithRoot(client, treeId, userId) {
  const { rows } = await client.query(
    `SELECT t.id, t.topic, n.id AS root_id, n.text AS root_text
       FROM trees t
       INNER JOIN nodes n ON n.tree_id = t.id AND n.parent_id IS NULL AND n.level = 0
      WHERE t.id = $1
        AND t.user_id = $2
      LIMIT 1
      FOR UPDATE OF t, n`,
    [treeId, userId]
  );

  return rows[0] || null;
}

export async function updateRootTopic({
  treeId,
  topicText,
  updatedBy = 'system',
  breadcrumb = [],
  providerOverride = null,
  traceId = null,
  userId = null,
}) {
  const normalizedTreeId = typeof treeId === 'string' ? treeId.trim() : '';
  if (!normalizedTreeId) {
    throw new TopicSemanticGuardError('tree_id is required', {
      code: 'INVALID_TREE_ID',
      status: 422,
    });
  }
  if (!userId || typeof userId !== 'string') {
    throw new TopicSemanticGuardError('user_id is required', {
      code: 'INVALID_USER_ID',
      status: 422,
    });
  }

  if (!uuidValidate(normalizedTreeId)) {
    throw new TopicSemanticGuardError('tree_id must be a valid UUID', {
      code: 'INVALID_TREE_ID',
      status: 422,
    });
  }

  const normalizedTopic = typeof topicText === 'string' ? topicText.trim() : '';
  if (!normalizedTopic) {
    throw new TopicSemanticGuardError('topic_text is required', {
      code: 'INVALID_TOPIC',
      status: 422,
    });
  }

  if (normalizedTopic.length > TOPIC_MAX_LENGTH) {
    throw new TopicSemanticGuardError(`topic_text exceeds ${TOPIC_MAX_LENGTH} characters`, {
      code: 'INVALID_TOPIC',
      status: 422,
    });
  }

  const normalizedUpdatedBy = sanitizeUpdatedBy(updatedBy);
  const sanitizedBreadcrumb = sanitizeBreadcrumb(breadcrumb);

  const client = await pool.connect();
  let transactionCompleted = false;
  try {
    await client.query('BEGIN');
    const tree = await fetchTreeWithRoot(client, normalizedTreeId, userId);
    if (!tree) {
      throw new TopicSemanticGuardError('tree not found', {
        code: 'TREE_NOT_FOUND',
        status: 404,
      });
    }
    if (!tree.root_id) {
      throw new TopicSemanticGuardError('tree root not found', {
        code: 'TREE_ROOT_NOT_FOUND',
        status: 404,
      });
    }

    const originalText = tree.root_text || '';

    let guardResult = null;
    let shouldUpdate = true;

    if (normalizedTopic === originalText.trim()) {
      guardResult = {
        equivalent: true,
        score: 1,
        diff_summary: '未检测到文本变化',
        source: 'rules',
        provider: 'short_circuit',
        usage_json: null,
      };
      shouldUpdate = false;
    } else {
      try {
        guardResult = await getTopicSemanticGuard(
          {
            original_text: originalText,
            new_text: normalizedTopic,
            tree_topic: tree.topic || '',
            breadcrumb: sanitizedBreadcrumb,
          },
          { providerOverride, userId }
        );
      } catch (error) {
        const guardPayload = {
          equivalent: false,
          score: 0,
          diff_summary: clampText(error.message || 'LLM unavailable', 120),
          source: 'fallback',
          provider: providerOverride || 'fallback',
          usage_json: null,
        };
        await recordSemanticGuardEvent(client, {
          treeId: normalizedTreeId,
          rootId: tree.root_id,
          createdBy: normalizedUpdatedBy,
          originalText,
          newText: normalizedTopic,
          breadcrumb: sanitizedBreadcrumb,
          result: 'error',
          guard: guardPayload,
          reason: error.code || error.message || 'LLM failure',
          traceId,
        });
        await client.query('COMMIT');
        transactionCompleted = true;
        throw new TopicSemanticGuardError(
          '主题语义守卫暂不可用，请稍后重试或联系维护者。',
          {
            code: 'ROOT_TOPIC_GUARD_UNAVAILABLE',
            status: 503,
            guard: guardPayload,
          }
        );
      }
    }

    const guardScore = Number.isFinite(guardResult.score) ? guardResult.score : 0;
    if (!guardResult.equivalent || guardScore < SCORE_THRESHOLD) {
      await recordSemanticGuardEvent(client, {
        treeId: normalizedTreeId,
        rootId: tree.root_id,
        createdBy: normalizedUpdatedBy,
        originalText,
        newText: normalizedTopic,
        breadcrumb: sanitizedBreadcrumb,
        result: 'drift',
        guard: guardResult,
        reason: 'semantic_drift',
        traceId,
      });
      await client.query('COMMIT');
      transactionCompleted = true;
      throw new TopicSemanticGuardError('主题语义变更过大，已拒绝保存', {
        code: 'ROOT_TOPIC_SEMANTIC_DRIFT',
        status: 422,
        guard: guardResult,
      });
    }

    if (shouldUpdate) {
      await client.query('UPDATE trees SET topic = $2 WHERE id = $1', [
        normalizedTreeId,
        normalizedTopic,
      ]);
      await client.query('UPDATE nodes SET text = $2 WHERE id = $1', [
        tree.root_id,
        normalizedTopic,
      ]);
    }

    await recordSemanticGuardEvent(client, {
      treeId: normalizedTreeId,
      rootId: tree.root_id,
      createdBy: normalizedUpdatedBy,
      originalText,
      newText: normalizedTopic,
      breadcrumb: sanitizedBreadcrumb,
      result: 'equivalent',
      guard: guardResult,
      reason: shouldUpdate ? null : 'noop',
      traceId,
    });

    await client.query('COMMIT');
    transactionCompleted = true;

    return {
      tree_id: normalizedTreeId,
      root_id: tree.root_id,
      topic_text: normalizedTopic,
      guard: guardResult,
      updated: shouldUpdate,
    };
  } catch (error) {
    if (!transactionCompleted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[tree.update_topic] rollback failed', rollbackError);
      }
    }

    if (error instanceof TopicSemanticGuardError) {
      throw error;
    }

    console.error('[tree.update_topic] unexpected error', error);
    throw new TopicSemanticGuardError('内部错误', {
      code: 'ROOT_TOPIC_UPDATE_FAILED',
      status: 500,
      guard: null,
    });
  } finally {
    client.release();
  }
}
