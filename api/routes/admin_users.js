/**
 * Admin User Management Routes
 * T25-3: Auth UX Polish & Admin Hooks
 * T26-7: Add delete user functionality
 * 
 * POST /api/admin/users/:userId/resend-verification
 * DELETE /api/admin/users/:userId
 * 
 * 为管理员提供用户管理相关操作
 */

import express from 'express';
import { createVerificationCode, sendVerificationEmail, checkResendCooldown } from '../lib/email_verification.js';
import { respondWithError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit_log.js';

// 受保护的用户列表（不能被删除）
const PROTECTED_EMAILS = [
  'admin@fengnayun.com',
  'sj@unionsoft.cn'
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res.locals?.traceId || req.headers?.['x-trace-id'] || null;
}

function getAdminActorUserId(req) {
  const raw = req.headers?.['x-omytree-user-id'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

export default function createAdminUsersRouter(pool) {
  const router = express.Router();

  /**
   * POST /api/admin/users/:userId/resend-verification
   * Admin 触发重发验证码邮件
   */
  router.post('/users/:userId/resend-verification', async (req, res) => {
    const { userId } = req.params;

    const client = await pool.connect();
    try {
      // 获取用户信息
      const userRes = await client.query(
        'SELECT id, email, "emailVerified", preferred_language FROM users WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        return respondWithError(res, {
          status: 404,
          code: 'user_not_found',
          message: 'User not found'
        });
      }

      const user = userRes.rows[0];

      // 检查是否已验证
      if (user.emailVerified) {
        return respondWithError(res, {
          status: 400,
          code: 'already_verified',
          message: 'User email is already verified'
        });
      }

      // 检查冷却时间
      const cooldownResult = await checkResendCooldown(client, userId);
      if (!cooldownResult.canResend) {
        return respondWithError(res, {
          status: 429,
          code: 'cooldown',
          message: `Please wait ${cooldownResult.remainingSeconds} seconds before resending`,
          detail: {
            remainingSeconds: cooldownResult.remainingSeconds
          }
        });
      }

      // 创建新的验证码
      const { code } = await createVerificationCode(client, userId);
      const lang = user.preferred_language || 'en';

      // 发送验证码邮件
      const emailResult = await sendVerificationEmail(user.email, code, lang);

      if (!emailResult.ok) {
        return respondWithError(res, {
          status: 500,
          code: 'email_failed',
          message: 'Failed to send verification email'
        });
      }

      console.log(`[admin] Verification code sent to ${user.email} by admin`);

      await writeAuditLog(
        {
          actorUserId: getAdminActorUserId(req),
          actorRole: 'admin',
          action: 'admin.user.resend_verification',
          targetType: 'user',
          targetId: userId,
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: {
            email: user.email,
          },
        },
        client
      );

      res.json({
        ok: true,
        message: 'Verification code sent successfully',
        email: user.email
      });
    } catch (err) {
      console.error('[admin/resend-verification] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to resend verification email'
      });
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/admin/users/:userId
   * 删除用户及其所有相关数据
   */
  router.delete('/users/:userId', async (req, res) => {
    const { userId } = req.params;

    const client = await pool.connect();
    try {
      // 获取用户信息
      const userRes = await client.query(
        'SELECT id, email, name FROM users WHERE id = $1',
        [userId]
      );

      if (userRes.rows.length === 0) {
        return respondWithError(res, {
          status: 404,
          code: 'user_not_found',
          message: 'User not found'
        });
      }

      const user = userRes.rows[0];

      // 检查是否是受保护用户
      if (PROTECTED_EMAILS.includes(user.email.toLowerCase())) {
        return respondWithError(res, {
          status: 403,
          code: 'protected_user',
          message: 'This user cannot be deleted'
        });
      }

      // 开始事务
      await client.query('BEGIN');

      try {
        // 0. Workspaces: 删除个人工作区；团队工作区自动转移 owner 或删除空团队。
        // NOTE: workspaces.owner_user_id 对 users(id) 是 ON DELETE RESTRICT，必须在删用户前处理。
        const ownedWorkspacesRes = await client.query(
          `SELECT id, kind, name FROM workspaces WHERE owner_user_id = $1`,
          [userId]
        );

        for (const ws of ownedWorkspacesRes.rows) {
          if (ws.kind === 'personal') {
            await client.query(`DELETE FROM workspaces WHERE id = $1`, [ws.id]);
            continue;
          }

          // team workspace: prefer transferring ownership to an existing member.
          const nextOwnerRes = await client.query(
            `SELECT user_id
             FROM workspace_members
             WHERE workspace_id = $1 AND user_id <> $2
             ORDER BY
               CASE role
                 WHEN 'admin' THEN 0
                 WHEN 'member' THEN 1
                 ELSE 2
               END,
               created_at ASC
             LIMIT 1`,
            [ws.id, userId]
          );

          if (nextOwnerRes.rows.length === 0) {
            // no other members -> safe to delete workspace
            await client.query(`DELETE FROM workspaces WHERE id = $1`, [ws.id]);
            continue;
          }

          const nextOwnerId = nextOwnerRes.rows[0].user_id;
          await client.query(
            `UPDATE workspaces SET owner_user_id = $1, updated_at = NOW() WHERE id = $2`,
            [nextOwnerId, ws.id]
          );
          await client.query(
            `UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2`,
            [ws.id, nextOwnerId]
          );
        }

        // 1. 删除用户的 turns（通过 nodes -> trees -> user_id）
        await client.query(`
          DELETE FROM turns 
          WHERE node_id IN (
            SELECT n.id FROM nodes n
            JOIN trees t ON n.tree_id = t.id
            WHERE t.user_id = $1
          )
        `, [userId]);

        // 2. 删除用户的 nodes
        await client.query(`
          DELETE FROM nodes 
          WHERE tree_id IN (
            SELECT id FROM trees WHERE user_id = $1
          )
        `, [userId]);

        // 3. 删除用户的 trees
        await client.query('DELETE FROM trees WHERE user_id = $1', [userId]);

        // 4. 删除用户的 API keys
        await client.query('DELETE FROM user_api_keys WHERE user_id = $1', [userId]);

        // 5. 删除用户的 sessions
        await client.query('DELETE FROM sessions WHERE "userId" = $1', [userId]);

        // 6. 删除用户的 accounts
        await client.query('DELETE FROM accounts WHERE "userId" = $1', [userId]);

        // 7. 删除用户的 email verification tokens
        await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

        // 8. 删除用户的 password reset tokens
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

        // 9. 删除用户的 LLM usage events
        await client.query('DELETE FROM llm_usage_events WHERE user_id = $1', [userId]);

        // 10. 删除用户的 LLM daily usage rollups
        await client.query('DELETE FROM llm_usage_daily WHERE user_id = $1', [userId]);

        // 11. 最后删除用户
        await client.query('DELETE FROM users WHERE id = $1', [userId]);

        await client.query('COMMIT');

        console.log(`[admin] User deleted: ${user.email} (${userId}) by admin`);

        await writeAuditLog(
          {
            actorUserId: getAdminActorUserId(req),
            actorRole: 'admin',
            action: 'admin.user.delete',
            targetType: 'user',
            targetId: userId,
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: {
              email: user.email,
              name: user.name || null,
            },
          },
          client
        );

        res.json({
          ok: true,
          message: 'User deleted successfully',
          deleted: {
            id: userId,
            email: user.email,
            name: user.name
          }
        });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      }
    } catch (err) {
      console.error('[admin/delete-user] Error:', err);

      // Common FK restriction/violation errors when data dependencies exist.
      if (err && (err.code === '23001' || err.code === '23503')) {
        return respondWithError(res, {
          status: 409,
          code: 'delete_conflict',
          message: 'Cannot delete user due to dependent records',
          detail: {
            constraint: err.constraint,
            table: err.table,
            dbCode: err.code
          }
        });
      }

      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to delete user'
      });
    } finally {
      client.release();
    }
  });

  return router;
}
