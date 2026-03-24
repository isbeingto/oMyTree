
import express from 'express';
import { validate as uuidValidate } from 'uuid';
import { getNodeById, updateNodeText, softDeleteNode } from '../services/node/repo.js';
import { getNodeHint } from '../services/node/hints.js';
import { getNodeLocal } from '../services/node/local.js';
import { getNodeTimeline } from '../services/node/timeline.js';
import { withTraceId } from '../lib/trace.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { pool } from '../db/pool.js';

const router = express.Router();

function invalidId(res) {
  return res.status(422).json(
    withTraceId(res, {
      ok: false,
      error: 'INVALID_NODE_ID'
    })
  );
}

// 提示未完成子分支
router.get('/:id/hints', async (req, res) => {
  try {
    if (!uuidValidate(req.params.id)) {
      return invalidId(res);
    }
    const userId = await getAuthUserIdForRequest(req, pool);
    const hint = await getNodeHint(req.params.id, userId);
    return res.json(
      withTraceId(res, {
        ok: true,
        hint
      })
    );
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json(
      withTraceId(res, {
        ok: false,
        error: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to load node hint'
      })
    );
  }
});

// 局部片段视图（必须在 /:id 前）
router.get('/:id/local', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1';
    const userId = await getAuthUserIdForRequest(req, pool);
    if (!uuidValidate(req.params.id)) {
      return invalidId(res);
    }
    const local = await getNodeLocal(req.params.id, { includeDeleted, userId });
    if (!local) {
      return res.status(404).json({ 
        ok: false, 
        error: 'NODE_NOT_FOUND' 
      });
    }
    const payload = withTraceId(res, { ok: true, local });
    res.json(payload);
  } catch (e) {
    console.error('Error getting node local view:', e);
    res.status(500).json({ 
      ok: false, 
      error: 'INTERNAL_ERROR' 
    });
  }
});

router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidValidate(id)) {
      return invalidId(res);
    }

    const limitParam = req.query.limit;
    let limit = 30;
    if (limitParam !== undefined) {
      const parsed = Number.parseInt(String(limitParam), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(422).json(
          withTraceId(res, { ok: false, error: 'INVALID_LIMIT' })
        );
      }
      limit = Math.min(parsed, 60);
    }

    const orderParam =
      typeof req.query.order === 'string' ? req.query.order.toLowerCase() : 'desc';
    if (orderParam !== 'asc' && orderParam !== 'desc') {
      return res.status(422).json(
        withTraceId(res, { ok: false, error: 'INVALID_ORDER' })
      );
    }

    const userId = await getAuthUserIdForRequest(req, pool);
    const timeline = await getNodeTimeline(id, { limit, order: orderParam, userId });
    if (!timeline) {
      return res.status(404).json(
        withTraceId(res, { ok: false, error: 'NODE_NOT_FOUND' })
      );
    }

    return res.json(withTraceId(res, { ok: true, timeline }));
  } catch (error) {
    console.error('Error getting node timeline:', error);
    return res.status(500).json(
      withTraceId(res, { ok: false, error: 'INTERNAL_ERROR' })
    );
  }
});

// 读取（默认不含软删；?includeDeleted=1 可查看被软删节点）
router.get('/:id', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === '1';
    if (!uuidValidate(req.params.id)) {
      return invalidId(res);
    }
    const node = await getNodeById(req.params.id, { includeDeleted, userId });
    if (!node) {
      return res.status(404).json({ 
        ok: false, 
        error: 'NODE_NOT_FOUND' 
      });
    }
    const payload = withTraceId(res, { ok: true, node });
    res.json(payload);
  } catch (e) {
    console.error('Error getting node:', e);
    res.status(500).json({ 
      ok: false, 
      error: 'INTERNAL_ERROR' 
    });
  }
});

// 禁止改挂（统一拒绝）
router.patch('/:id/reparent', (_req, res) => {
  res.status(405).json({ 
    ok: false, 
    error: 'REPARENT_FORBIDDEN' 
  });
});

// 仅允许 text 更新
router.patch('/:id', express.json(), async (req, res) => {
  try {
    if (!uuidValidate(req.params.id)) {
      return invalidId(res);
    }
    const { text, who = 'system', why = 'edit', trace_id = null, ...rest } = req.body || {};
    
    // 检查是否试图修改禁止字段
    if (rest.parent_id || rest.tree_id || rest.level || rest.role) {
      return res.status(403).json({ 
        ok: false, 
        error: 'FIELD_FORBIDDEN' 
      });
    }
    
    // 验证 text
    if (typeof text !== 'string') {
      return res.status(422).json({ 
        ok: false, 
        error: 'INVALID_TEXT' 
      });
    }

    const userId = await getAuthUserIdForRequest(req, pool);
    const node = await updateNodeText(req.params.id, text, { who, why, trace_id, userId });
    if (!node) {
      return res.status(404).json({ 
        ok: false, 
        error: 'NODE_NOT_FOUND_OR_DELETED' 
      });
    }
    
    const payload = withTraceId(res, { ok: true, node });
    res.json(payload);
  } catch (e) {
    console.error('Error updating node:', e);
    res.status(500).json({ 
      ok: false, 
      error: 'INTERNAL_ERROR' 
    });
  }
});

// 软删
router.delete('/:id', async (req, res) => {
  try {
    if (!uuidValidate(req.params.id)) {
      return invalidId(res);
    }
    const userId = await getAuthUserIdForRequest(req, pool);
    const ok = await softDeleteNode(req.params.id, {
      who: req.query.who || 'system',
      why: req.query.why || 'soft_delete',
      trace_id: req.query.trace_id || null,
      userId,
    });
    
    if (!ok) {
      return res.status(404).json({ 
        ok: false, 
        error: 'NODE_NOT_FOUND_OR_DELETED' 
      });
    }
    
    const payload = withTraceId(res, { ok: true });
    res.json(payload);
  } catch (e) {
    console.error('Error deleting node:', e);
    res.status(500).json({ 
      ok: false, 
      error: 'INTERNAL_ERROR' 
    });
  }
});

export default router;
