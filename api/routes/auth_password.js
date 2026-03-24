/**
 * 密码重置路由
 * T25-2: Password Reset Flow
 * 
 * 端点：
 * - POST /api/auth/forgot-password - 请求重置密码（发送邮件）
 * - POST /api/auth/reset-password  - 执行密码重置
 */

import express from 'express';
import {
  createResetToken,
  checkResetCooldown,
  resetPassword,
  sendResetEmail,
  findUserByEmail
} from '../lib/password_reset.js';
import { respondWithError } from '../lib/errors.js';

/**
 * 创建密码重置路由
 * @param {import('pg').Pool} pool - PostgreSQL 连接池
 */
export default function createPasswordResetRouter(pool) {
  const router = express.Router();

  /**
   * POST /api/auth/forgot-password
   * 请求重置密码邮件
   * Body: { email: string }
   */
  router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return respondWithError(res, {
        status: 400,
        code: 'missing_email',
        message: 'Email is required'
      });
    }

    // 基本邮箱格式校验
    if (!email.includes('@') || email.length < 5) {
      return respondWithError(res, {
        status: 400,
        code: 'invalid_email',
        message: 'Please provide a valid email address'
      });
    }

    const client = await pool.connect();
    try {
      // 查找用户
      const user = await findUserByEmail(client, email);

      // 即使用户不存在也返回成功，防止邮箱探测
      if (!user) {
        console.log(`[forgot-password] User not found for email: ${email.substring(0, 3)}...`);
        return res.json({
          ok: true,
          message: 'If an account with that email exists, we have sent a password reset link.'
        });
      }

      // 检查冷却时间
      const cooldown = await checkResetCooldown(client, user.id);
      if (!cooldown.canSend) {
        return respondWithError(res, {
          status: 429,
          code: 'rate_limited',
          message: `Please wait ${Math.ceil(cooldown.remainingSeconds / 60)} minutes before requesting another reset email`,
          detail: { remainingSeconds: cooldown.remainingSeconds }
        });
      }

      // 创建 token 并发送邮件
      const { token } = await createResetToken(client, user.id);
      const mailResult = await sendResetEmail(user.email, token, user.preferred_language);

      if (!mailResult.ok) {
        console.error('[forgot-password] Failed to send email:', mailResult.error);
        // 仍然返回成功以防探测
      } else {
        console.log(`[forgot-password] Reset email sent to: ${user.email.substring(0, 3)}...`);
      }

      res.json({
        ok: true,
        message: 'If an account with that email exists, we have sent a password reset link.'
      });
    } catch (err) {
      console.error('[forgot-password] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to process password reset request'
      });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/auth/reset-password
   * 执行密码重置
   * Body: { token: string, newPassword: string }
   */
  router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return respondWithError(res, {
        status: 400,
        code: 'missing_token',
        message: 'Reset token is required'
      });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return respondWithError(res, {
        status: 400,
        code: 'missing_password',
        message: 'New password is required'
      });
    }

    const client = await pool.connect();
    try {
      const result = await resetPassword(client, token, newPassword);

      if (result.status === 'ok') {
        console.log('[reset-password] Password reset successful');
        return res.json({
          ok: true,
          message: 'Password has been reset successfully'
        });
      }

      // 处理各种错误状态
      const errorMessages = {
        invalid: { status: 400, message: 'Invalid reset link. Please request a new password reset.' },
        expired: { status: 400, message: 'This reset link has expired. Please request a new password reset.' },
        used: { status: 400, message: 'This reset link has already been used. Please request a new password reset.' },
        weak_password: { status: 400, message: result.error || 'Password is too weak' }
      };

      const errorInfo = errorMessages[result.status] || { status: 400, message: 'Invalid request' };
      
      return respondWithError(res, {
        status: errorInfo.status,
        code: result.status,
        message: errorInfo.message
      });
    } catch (err) {
      console.error('[reset-password] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to reset password'
      });
    } finally {
      client.release();
    }
  });

  return router;
}
