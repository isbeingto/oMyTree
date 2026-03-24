/**
 * User API Keys API (BYOK - Bring Your Own Key)
 * 
 * Endpoints:
 *   GET    /api/account/api-keys     - List user's API keys (masked)
 *   POST   /api/account/api-keys     - Add or update an API key
 *   DELETE /api/account/api-keys/:id - Delete an API key
 * 
 * All endpoints require authenticated user (x-omytree-user-id header)
 */

import express from 'express';
import { validate as uuidValidate } from 'uuid';
import { pool } from '../db/pool.js';
import { getStrictAuthUserId, isDemoUserId } from '../lib/auth_user.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../lib/api_key_crypto.js';
import { withTraceId } from '../lib/trace.js';
import { recordByokBound } from '../services/telemetry.js';
import { writeAuditLog } from '../lib/audit_log.js';

const VALID_PROVIDERS = new Set(['openai', 'google']);

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res?.locals?.traceId ?? req?.headers?.['x-trace-id'] ?? null;
}

function invalid(res, status, code, message) {
  return res.status(status).json(
    withTraceId(res, {
      ok: false,
      error: code,
      message: message || code,
    })
  );
}

export default function createUserApiKeysRouter() {
  const router = express.Router();

  /**
   * GET /api/account/api-keys
   * List all API keys for the current user (with masked values)
   */
  router.get('/api/account/api-keys', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      
      // Demo users cannot have API keys (should not reach here with strict auth)
      if (isDemoUserId(userId)) {
        return res.json(withTraceId(res, {
          ok: true,
          keys: [],
          message: 'Demo users cannot configure API keys',
        }));
      }

      const { rows } = await client.query(
        `SELECT id, provider, label, api_key_encrypted, created_at, updated_at
         FROM user_api_keys
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      const keys = rows.map(row => {
        // Decrypt and mask the API key
        let maskedKey = '****';
        try {
          const plainKey = decryptApiKey(row.api_key_encrypted);
          maskedKey = maskApiKey(plainKey);
        } catch (err) {
          console.warn(`[api-keys] Failed to decrypt key ${row.id}:`, err.message);
        }

        return {
          id: row.id,
          provider: row.provider,
          label: row.label || null,
          api_key_masked: maskedKey,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });

      return res.json(withTraceId(res, {
        ok: true,
        keys,
      }));
    } catch (error) {
      console.error('[api-keys] GET failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/api-keys
   * Add or update an API key for a provider
   * 
   * Body: { provider: "openai" | "google", api_key: string, label?: string }
   */
  router.post('/api/account/api-keys', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      
      // Demo users cannot have API keys (should not reach here with strict auth)
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot configure API keys');
      }

      const body = req.body || {};
      const provider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : '';
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
      const label = typeof body.label === 'string' ? body.label.trim() : null;

      // Validate provider
      if (!provider || !VALID_PROVIDERS.has(provider)) {
        return invalid(res, 422, 'INVALID_PROVIDER', `Provider must be one of: ${[...VALID_PROVIDERS].join(', ')}`);
      }

      // Validate API key
      if (!apiKey) {
        return invalid(res, 422, 'INVALID_API_KEY', 'API key is required');
      }
      if (apiKey.length < 10) {
        return invalid(res, 422, 'INVALID_API_KEY', 'API key is too short');
      }
      if (apiKey.length > 500) {
        return invalid(res, 422, 'INVALID_API_KEY', 'API key is too long');
      }

      // Encrypt the API key
      const encryptedKey = encryptApiKey(apiKey);

      const existing = await client.query(
        `SELECT id FROM user_api_keys WHERE user_id = $1 AND provider = $2 LIMIT 1`,
        [userId, provider]
      );

      // Upsert the key (one key per user per provider)
      const { rows } = await client.query(
        `INSERT INTO user_api_keys (user_id, provider, label, api_key_encrypted)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           label = EXCLUDED.label,
           api_key_encrypted = EXCLUDED.api_key_encrypted,
           updated_at = NOW()
         RETURNING id, provider, label, created_at, updated_at`,
        [userId, provider, label, encryptedKey]
      );

      const row = rows[0];
      const masked = maskApiKey(apiKey);

      // Record telemetry event for BYOK binding
      recordByokBound(userId, provider);

      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: 'user',
          action: existing.rowCount === 0 ? 'user.api_key.create' : 'user.api_key.update',
          targetType: 'api_key',
          targetId: row.id,
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: {
            provider: provider,
            last4: masked,
          },
        },
        client
      );

      return res.json(withTraceId(res, {
        ok: true,
        key: {
          id: row.id,
          provider: row.provider,
          label: row.label || null,
          api_key_masked: masked,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      }));
    } catch (error) {
      console.error('[api-keys] POST failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/account/api-keys/:id
   * Delete an API key
   */
  router.delete('/api/account/api-keys/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      
      // Demo users cannot have API keys (should not reach here with strict auth)
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot configure API keys');
      }

      const keyId = req.params.id;
      if (!keyId || !uuidValidate(keyId)) {
        return invalid(res, 422, 'INVALID_KEY_ID', 'Invalid key ID');
      }

      const existingKey = await client.query(
        `SELECT id, provider, api_key_encrypted FROM user_api_keys WHERE id = $1 AND user_id = $2`,
        [keyId, userId]
      );

      if (existingKey.rowCount === 0) {
        return invalid(res, 404, 'KEY_NOT_FOUND', 'API key not found or not owned by this user');
      }

      const existingRow = existingKey.rows[0];
      let masked = '****';
      try {
        const plainKey = decryptApiKey(existingRow.api_key_encrypted);
        masked = maskApiKey(plainKey);
      } catch (err) {
        console.warn('[api-keys] Failed to decrypt key for audit', err?.message);
      }

      // Delete the key (only if owned by this user)
      const { rowCount } = await client.query(
        `DELETE FROM user_api_keys
         WHERE id = $1 AND user_id = $2`,
        [keyId, userId]
      );

      if (rowCount === 0) {
        return invalid(res, 404, 'KEY_NOT_FOUND', 'API key not found or not owned by this user');
      }

      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: 'user',
          action: 'user.api_key.delete',
          targetType: 'api_key',
          targetId: keyId,
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: {
            provider: existingRow.provider,
            last4: masked,
          },
        },
        client
      );

      return res.json(withTraceId(res, {
        ok: true,
        deleted: true,
      }));
    } catch (error) {
      console.error('[api-keys] DELETE failed:', error);
      const status = error.status || 500;
      const code = error.code || 'INTERNAL_ERROR';
      return invalid(res, status, code, error.message);
    } finally {
      client.release();
    }
  });

  return router;
}
