/**
 * 设置密码路由
 * 用于Google-only用户设置首个密码
 * 
 * 端点：
 * - POST /api/auth/set-password - 设置首个密码（仅限password_hash为NULL的用户）
 */

import express from 'express';
import bcrypt from 'bcrypt';
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
import { wrapAsync, HttpError } from '../lib/errors.js';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/**
 * 验证密码强度
 * @param {string} password - 密码
 * @returns {Object} {valid: boolean, error?: string}
 */
function validatePasswordStrength(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
    };
  }

  // 检查是否包含至少一个数字、大写字母、小写字母
  const hasNumber = /\d/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/.test(password);

  if (!(hasNumber && (hasUpperCase || hasLowerCase))) {
    return {
      valid: false,
      error: 'Password must contain at least one number and at least one letter',
    };
  }

  return { valid: true };
}

/**
 * 创建设置密码路由
 * @param {import('pg').Pool} pool - PostgreSQL 连接池
 */
export default function createSetPasswordRouter(pool) {
  const router = express.Router();

  /**
   * POST /api/auth/set-password
   * 为Google-only用户设置首个密码
   * 
   * 请求体：
   * {
   *   password: string (必需)
   * }
   * 
   * 响应：
   * {
   *   ok: true,
   *   message: "Password set successfully"
   * }
   */
  router.post(
    '/set-password',
    wrapAsync(async (req, res) => {
      const { password } = req.body;

      // 获取认证用户ID
      const userId = await getAuthUserIdForRequest(req, pool);
      if (!userId) {
        throw new HttpError({
          status: 401,
          code: 'unauthorized',
          message: 'You must be logged in to set a password',
        });
      }

      // 验证密码参数
      if (!password || typeof password !== 'string') {
        throw new HttpError({
          status: 400,
          code: 'missing_password',
          message: 'Password is required',
        });
      }

      // 验证密码强度
      const validation = validatePasswordStrength(password);
      if (!validation.valid) {
        throw new HttpError({
          status: 400,
          code: 'weak_password',
          message: validation.error,
        });
      }

      // 获取用户信息，检查是否已有密码
      const userResult = await pool.query(
        'SELECT id, password_hash, email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: 'user_not_found',
          message: 'User not found',
        });
      }

      const user = userResult.rows[0];

      // 检查用户是否已有密码（change-password情况）
      if (user.password_hash !== null) {
        console.log(`[set-password] User ${userId} already has a password, should use change-password instead`);
        throw new HttpError({
          status: 400,
          code: 'password_already_exists',
          message: 'You already have a password. Use change-password to update it.',
          hint: 'Use the change password option in settings instead',
        });
      }

      // 生成密码哈希
      console.log(`[set-password] Generating password hash for user ${userId}`);
      const passwordHash = await bcrypt.hash(password, 10);

      // 更新用户密码
      const updateResult = await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email',
        [passwordHash, userId]
      );

      if (updateResult.rows.length === 0) {
        throw new HttpError({
          status: 500,
          code: 'update_failed',
          message: 'Failed to update password',
        });
      }

      console.log(`[set-password] Password set successfully for user ${userId}`);

      return res.json({
        ok: true,
        message: 'Password set successfully',
      });
    })
  );

  /**
   * GET /api/auth/password-status
   * 获取用户密码状态
   * 
   * 响应：
   * {
   *   hasPassword: boolean,
   *   email: string
   * }
   */
  router.get(
    '/password-status',
    wrapAsync(async (req, res) => {
      const userId = await getAuthUserIdForRequest(req, pool);
      if (!userId) {
        throw new HttpError({
          status: 401,
          code: 'unauthorized',
          message: 'You must be logged in',
        });
      }

      const result = await pool.query(
        'SELECT id, password_hash, email FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new HttpError({
          status: 404,
          code: 'user_not_found',
          message: 'User not found',
        });
      }

      const user = result.rows[0];

      return res.json({
        hasPassword: user.password_hash !== null,
        email: user.email,
      });
    })
  );

  return router;
}
