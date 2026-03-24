/**
 * 邮箱验证路由
 * T25-1: Email Verification Flow (重构为验证码模式)
 * 
 * 端点：
 * - POST /api/auth/send-verification     - 发送验证码邮件（需要 userId）
 * - POST /api/auth/resend-verification   - 重发验证码邮件（需要 userId）
 * - POST /api/auth/verify-code           - 验证验证码
 * - GET  /api/auth/verify-email?token=xxx - 保留旧的链接验证（向后兼容）
 */

import express from 'express';
import {
  createVerificationCode,
  verifyEmailCode,
  verifyEmailToken,
  sendVerificationEmail,
  checkResendCooldown,
  getUserEmailStatus
} from '../lib/email_verification.js';
import { respondWithError } from '../lib/errors.js';

/**
 * 创建邮箱验证路由
 * @param {import('pg').Pool} pool - PostgreSQL 连接池
 */
export default function createEmailVerificationRouter(pool) {
  const router = express.Router();

  /**
   * GET /api/auth/verify-email?token=xxx
   * 保留旧的链接验证（向后兼容）
   */
  router.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      const baseUrl = process.env.APP_PUBLIC_URL || 'https://www.omytree.com';
      return res.redirect(`${baseUrl}/auth/verify-email/result?status=invalid`);
    }

    const client = await pool.connect();
    try {
      const result = await verifyEmailToken(client, token);
      const baseUrl = process.env.APP_PUBLIC_URL || 'https://www.omytree.com';

      if (result.status === 'ok') {
        return res.redirect(`${baseUrl}/auth/verify-email/result?status=ok`);
      } else if (result.status === 'expired') {
        return res.redirect(`${baseUrl}/auth/verify-email/result?status=expired`);
      } else if (result.status === 'used') {
        return res.redirect(`${baseUrl}/auth/verify-email/result?status=ok`);
      } else {
        return res.redirect(`${baseUrl}/auth/verify-email/result?status=invalid`);
      }
    } catch (err) {
      console.error('[verify-email] Error:', err);
      const baseUrl = process.env.APP_PUBLIC_URL || 'https://www.omytree.com';
      return res.redirect(`${baseUrl}/auth/verify-email/result?status=error`);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/auth/verify-code
   * 验证验证码
   * Body: { userId: string, code: string }
   */
  router.post('/verify-code', async (req, res) => {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return respondWithError(res, {
        status: 400,
        code: 'missing_params',
        message: 'userId and code are required'
      });
    }

    // 验证码格式检查：必须是6位数字
    if (!/^\d{6}$/.test(code)) {
      return respondWithError(res, {
        status: 400,
        code: 'invalid_code_format',
        message: 'Invalid verification code format'
      });
    }

    const client = await pool.connect();
    try {
      const result = await verifyEmailCode(client, userId, code);

      if (result.status === 'ok') {
        return res.json({
          ok: true,
          message: 'Email verified successfully'
        });
      } else if (result.status === 'expired') {
        return respondWithError(res, {
          status: 400,
          code: 'code_expired',
          message: 'Verification code has expired. Please request a new one.'
        });
      } else {
        return respondWithError(res, {
          status: 400,
          code: 'invalid_code',
          message: 'Invalid verification code'
        });
      }
    } catch (err) {
      console.error('[verify-code] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to verify code'
      });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/auth/send-verification
   * 发送验证码邮件（注册后调用）
   * Body: { userId: string }
   */
  router.post('/send-verification', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return respondWithError(res, {
        status: 400,
        code: 'missing_user_id',
        message: 'userId is required'
      });
    }

    const client = await pool.connect();
    try {
      // 获取用户信息
      const userStatus = await getUserEmailStatus(client, userId);
      if (!userStatus) {
        return respondWithError(res, {
          status: 404,
          code: 'user_not_found',
          message: 'User not found'
        });
      }

      // 如果已验证，不需要发送
      if (userStatus.emailVerified) {
        return res.json({
          ok: true,
          alreadyVerified: true,
          message: 'Email is already verified'
        });
      }

      // 创建验证码并发送邮件
      const { code } = await createVerificationCode(client, userId);
      const lang = userStatus.preferred_language || 'en';
      const mailResult = await sendVerificationEmail(userStatus.email, code, lang);

      if (!mailResult.ok) {
        return respondWithError(res, {
          status: 500,
          code: 'mail_send_failed',
          message: 'Failed to send verification email',
          detail: mailResult.error
        });
      }

      res.json({
        ok: true,
        message: 'Verification code sent',
        email: userStatus.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // 隐藏部分邮箱
      });
    } catch (err) {
      console.error('[send-verification] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to send verification email'
      });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/auth/resend-verification
   * 重发验证码邮件
   * Body: { userId: string }
   */
  router.post('/resend-verification', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return respondWithError(res, {
        status: 400,
        code: 'missing_user_id',
        message: 'userId is required'
      });
    }

    const client = await pool.connect();
    try {
      // 获取用户信息
      const userStatus = await getUserEmailStatus(client, userId);
      if (!userStatus) {
        return respondWithError(res, {
          status: 404,
          code: 'user_not_found',
          message: 'User not found'
        });
      }

      // 如果已验证，不需要发送
      if (userStatus.emailVerified) {
        return res.json({
          ok: true,
          alreadyVerified: true,
          message: 'Email is already verified'
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

      // 创建新验证码并发送邮件
      const { code } = await createVerificationCode(client, userId);
      const lang = userStatus.preferred_language || 'en';
      const mailResult = await sendVerificationEmail(userStatus.email, code, lang);

      if (!mailResult.ok) {
        return respondWithError(res, {
          status: 500,
          code: 'mail_send_failed',
          message: 'Failed to send verification email',
          detail: mailResult.error
        });
      }

      res.json({
        ok: true,
        message: 'Verification code resent',
        email: userStatus.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
      });
    } catch (err) {
      console.error('[resend-verification] Error:', err);
      return respondWithError(res, {
        status: 500,
        code: 'internal_error',
        message: 'Failed to resend verification email'
      });
    } finally {
      client.release();
    }
  });

  return router;
}
