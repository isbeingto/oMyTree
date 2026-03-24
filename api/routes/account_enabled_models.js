/**
 * User Enabled Models API (T29-QA-5)
 * 
 * Endpoints:
 *   GET    /api/account/enabled-models              - List enabled models for all providers
 *   GET    /api/account/enabled-models/:provider    - List enabled models for a provider
 *   POST   /api/account/enabled-models              - Enable/disable models (batch)
 *   DELETE /api/account/enabled-models/:provider    - Delete all enabled models for a provider
 * 
 * All endpoints require authenticated user
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getStrictAuthUserId, isDemoUserId } from '../lib/auth_user.js';
import { withTraceId } from '../lib/trace.js';

const VALID_PROVIDERS = new Set(['openai', 'google']);

function invalid(res, status, code, message) {
  return res.status(status).json(
    withTraceId(res, {
      ok: false,
      error: code,
      message: message || code,
    })
  );
}

export default function createEnabledModelsRouter() {
  const router = express.Router();

  /**
   * GET /api/account/enabled-models
   * List all enabled models for the current user (grouped by provider)
   */
  router.get('/api/account/enabled-models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      
      // Demo users use platform default only
      if (isDemoUserId(userId)) {
        return res.json(withTraceId(res, {
          ok: true,
          models: {},
          is_demo: true,
          message: 'Demo users use platform default models',
        }));
      }

      const { rows } = await client.query(
        `SELECT id, provider, model_id, model_name, model_description, enabled, created_at, updated_at
         FROM user_enabled_models
         WHERE user_id = $1
         ORDER BY provider, created_at DESC`,
        [userId]
      );

      // Group by provider
      const models = {};
      for (const row of rows) {
        if (!models[row.provider]) {
          models[row.provider] = [];
        }
        models[row.provider].push({
          id: row.id,
          model_id: row.model_id,
          model_name: row.model_name,
          model_description: row.model_description,
          enabled: row.enabled,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }

      return res.json(withTraceId(res, {
        ok: true,
        models,
      }));
    } catch (error) {
      console.error('[enabled-models] GET failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/account/enabled-models/:provider
   * List enabled models for a specific provider
   */
  router.get('/api/account/enabled-models/:provider', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const provider = req.params.provider?.toLowerCase();
      
      if (!provider || !VALID_PROVIDERS.has(provider)) {
        return invalid(res, 422, 'INVALID_PROVIDER', `Provider must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
      }
      
      // Demo users use platform default only
      if (isDemoUserId(userId)) {
        return res.json(withTraceId(res, {
          ok: true,
          provider,
          models: [],
          is_demo: true,
        }));
      }

      const { rows } = await client.query(
        `SELECT id, model_id, model_name, model_description, enabled, created_at, updated_at
         FROM user_enabled_models
         WHERE user_id = $1 AND provider = $2
         ORDER BY created_at DESC`,
        [userId, provider]
      );

      return res.json(withTraceId(res, {
        ok: true,
        provider,
        models: rows.map(row => ({
          id: row.id,
          model_id: row.model_id,
          model_name: row.model_name,
          model_description: row.model_description,
          enabled: row.enabled,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      }));
    } catch (error) {
      console.error('[enabled-models] GET by provider failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/enabled-models
   * Enable/disable models for a provider (batch upsert)
   * 
   * Body: {
   *   provider: "openai" | "google",
   *   models: [
   *     { model_id: string, model_name?: string, model_description?: string, enabled: boolean },
   *     ...
   *   ]
   * }
   */
  router.post('/api/account/enabled-models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      
      // Demo users cannot configure models
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot configure models');
      }

      const body = req.body || {};
      const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
      const models = Array.isArray(body.models) ? body.models : [];

      // Validate provider
      if (!provider || !VALID_PROVIDERS.has(provider)) {
        return invalid(res, 422, 'INVALID_PROVIDER', `Provider must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
      }

      // Validate models array
      if (models.length === 0) {
        return invalid(res, 422, 'EMPTY_MODELS', 'At least one model is required');
      }

      if (models.length > 50) {
        return invalid(res, 422, 'TOO_MANY_MODELS', 'Cannot save more than 50 models at once');
      }

      // Validate each model
      for (const model of models) {
        if (!model.model_id || typeof model.model_id !== 'string') {
          return invalid(res, 422, 'INVALID_MODEL_ID', 'Each model must have a valid model_id');
        }
        if (typeof model.enabled !== 'boolean') {
          return invalid(res, 422, 'INVALID_ENABLED', 'Each model must have an enabled boolean');
        }
      }

      await client.query('BEGIN');

      const results = [];
      for (const model of models) {
        const { rows } = await client.query(
          `INSERT INTO user_enabled_models (user_id, provider, model_id, model_name, model_description, enabled)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, provider, model_id) DO UPDATE SET
             model_name = EXCLUDED.model_name,
             model_description = EXCLUDED.model_description,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()
           RETURNING id, model_id, model_name, model_description, enabled, created_at, updated_at`,
          [
            userId,
            provider,
            model.model_id,
            model.model_name || null,
            model.model_description || null,
            model.enabled,
          ]
        );
        results.push(rows[0]);
      }

      await client.query('COMMIT');

      console.log(`[enabled-models] User ${userId.slice(0, 8)}... updated ${results.length} models for ${provider}`);

      return res.json(withTraceId(res, {
        ok: true,
        provider,
        models: results.map(row => ({
          id: row.id,
          model_id: row.model_id,
          model_name: row.model_name,
          model_description: row.model_description,
          enabled: row.enabled,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[enabled-models] POST failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/account/enabled-models/:provider
   * Delete all enabled models for a provider
   */
  router.delete('/api/account/enabled-models/:provider', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const provider = req.params.provider?.toLowerCase();
      
      if (!provider || !VALID_PROVIDERS.has(provider)) {
        return invalid(res, 422, 'INVALID_PROVIDER', `Provider must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
      }
      
      // Demo users cannot configure models
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot configure models');
      }

      const { rowCount } = await client.query(
        `DELETE FROM user_enabled_models
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );

      console.log(`[enabled-models] User ${userId.slice(0, 8)}... deleted ${rowCount} models for ${provider}`);

      return res.json(withTraceId(res, {
        ok: true,
        provider,
        deleted_count: rowCount,
      }));
    } catch (error) {
      console.error('[enabled-models] DELETE failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  return router;
}
