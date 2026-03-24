import express from 'express';
import { createTreeWithRoot } from '../services/tree/create.js';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { recordTreeCreated } from '../services/telemetry.js';
import { HttpError } from '../lib/errors.js';
import { hasActiveUserProviders } from '../services/user_llm_providers.js';
import { pool } from '../db/pool.js';

const router = express.Router();

router.post('/api/tree', express.json(), async (req, res) => {
  try {
    const userId = await getAuthUserIdForRequest(req, pool);
    const { topic_text, created_by = 'system', dedupe = false, context_profile, memory_scope } = req.body || {};

    const userRow = await pool.query(
      'SELECT enable_advanced_context FROM users WHERE id = $1',
      [userId]
    );
    const advancedEnabled = Boolean(userRow.rows[0]?.enable_advanced_context);
    const allowedProfiles = new Set(['lite', 'standard', 'max']);
    const allowedScopes = new Set(['branch', 'tree']);

    let finalProfile = 'lite';
    let finalScope = 'branch';
    if (advancedEnabled) {
      if (!context_profile || !allowedProfiles.has(context_profile)) {
        throw new HttpError({
          status: 422,
          code: 'INVALID_CONTEXT_PROFILE',
          message: '请选择档位：lite / standard / max',
        });
      }
      finalProfile = context_profile;
      if (memory_scope) {
        if (!allowedScopes.has(memory_scope)) {
          throw new HttpError({
            status: 422,
            code: 'INVALID_MEMORY_SCOPE',
            message: '记忆范围仅支持 branch/tree',
          });
        }
        finalScope = memory_scope;
      }
      // T48-1: Max profile requires BYOK provider
      if (finalProfile === 'max') {
        const hasActive = await hasActiveUserProviders(userId);
        if (!hasActive) {
          throw new HttpError({
            status: 422,
            code: 'MAX_PROFILE_REQUIRES_BYOK',
            message: 'Max 档位仅支持自带模型 (BYOK)，请先在设置中配置您的 API Key',
            hint: '请前往设置页面配置至少一个模型提供商的 API Key',
          });
        }
      }
    }

    const { tree, root } = await createTreeWithRoot({
      topic_text,
      created_by,
      dedupe: !!dedupe,
      user_id: userId,
      context_profile: finalProfile,
      memory_scope: finalScope,
    });
    
    // Record telemetry event
    recordTreeCreated(userId, tree.id, topic_text);
    
    return res.status(201).json({
      ok: true,
      tree,
      root,
      // Keep a root_node alias for clients that follow the T2-1 contract
      root_node: root,
    });
  } catch (e) {
    console.error('Error creating tree:', e);
    if (e.status === 409) {
      return res.status(409).json({ ok: false, error: e.code || 'TREE_EXISTS' });
    }
    if (e.status === 422) {
      return res.status(422).json({ ok: false, error: e.code || 'INVALID_TOPIC' });
    }
    if (e.status) {
      return res.status(e.status).json({
        ok: false,
        error: e.code || 'REQUEST_FAILED',
        message: e.message,
        meta: e.meta || e.detail || null,
      });
    }
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
