/**
 * 密码重置服务
 * T25-2: Password Reset Flow
 * 
 * 提供：
 * - 生成密码重置 token
 * - 发送重置邮件
 * - 验证 token 并重置密码
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sendAppMail } from './mail/sendAppMail.js';

// Token 有效期：24 小时
const TOKEN_EXPIRY_HOURS = 24;
// 重发冷却时间：5 分钟
const RESEND_COOLDOWN_MINUTES = 5;
// bcrypt rounds
const BCRYPT_ROUNDS = 10;

/**
 * 生成安全随机 token
 * @returns {string} 64 字符的十六进制字符串
 */
export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 创建密码重置 token 记录
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @returns {Promise<{token: string, expiresAt: Date}>}
 */
export async function createResetToken(client, userId) {
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await client.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );

  return { token, expiresAt };
}

/**
 * 检查是否可以发送重置邮件（冷却时间检查）
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @returns {Promise<{canSend: boolean, remainingSeconds?: number}>}
 */
export async function checkResetCooldown(client, userId) {
  const cooldownTime = new Date(Date.now() - RESEND_COOLDOWN_MINUTES * 60 * 1000);
  
  const res = await client.query(
    `SELECT created_at FROM password_reset_tokens
     WHERE user_id = $1 AND created_at > $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, cooldownTime]
  );

  if (res.rows.length === 0) {
    return { canSend: true };
  }

  const lastTokenTime = new Date(res.rows[0].created_at);
  const remainingMs = (RESEND_COOLDOWN_MINUTES * 60 * 1000) - (Date.now() - lastTokenTime.getTime());
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return {
    canSend: false,
    remainingSeconds
  };
}

/**
 * 验证重置 token 并返回结果
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} token - 重置 token
 * @returns {Promise<{status: 'ok'|'invalid'|'expired'|'used', userId?: string}>}
 */
export async function verifyResetToken(client, token) {
  // 查找 token
  const tokenRes = await client.query(
    `SELECT id, user_id, expires_at, used_at 
     FROM password_reset_tokens 
     WHERE token = $1`,
    [token]
  );

  if (tokenRes.rows.length === 0) {
    return { status: 'invalid' };
  }

  const tokenRecord = tokenRes.rows[0];

  // 检查是否已使用
  if (tokenRecord.used_at) {
    return { status: 'used' };
  }

  // 检查是否过期
  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { status: 'expired' };
  }

  return { status: 'ok', userId: tokenRecord.user_id, tokenId: tokenRecord.id };
}

/**
 * 执行密码重置
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} token - 重置 token
 * @param {string} newPassword - 新密码（明文）
 * @returns {Promise<{status: 'ok'|'invalid'|'expired'|'used'|'weak_password', error?: string}>}
 */
export async function resetPassword(client, token, newPassword) {
  // 校验密码强度（与注册一致）
  if (!newPassword || newPassword.length < 6) {
    return { status: 'weak_password', error: 'Password must be at least 6 characters' };
  }

  // 验证 token
  const verifyResult = await verifyResetToken(client, token);
  if (verifyResult.status !== 'ok') {
    return { status: verifyResult.status };
  }

  const { userId, tokenId } = verifyResult;

  // Hash 新密码
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // 更新用户密码
  await client.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, userId]
  );

  // 标记 token 为已使用
  await client.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenId]
  );

  // 可选：清除该用户其他未用的 reset token
  await client.query(
    `UPDATE password_reset_tokens SET used_at = NOW() 
     WHERE user_id = $1 AND used_at IS NULL AND id != $2`,
    [userId, tokenId]
  );

  return { status: 'ok' };
}

/**
 * 构建密码重置 URL
 * @param {string} token - 重置 token
 * @returns {string}
 */
export function buildResetUrl(token) {
  const baseUrl = process.env.APP_PUBLIC_URL || 'https://www.omytree.com';
  return `${baseUrl}/auth/reset-password?token=${token}`;
}

/**
 * 发送密码重置邮件
 * @param {string} email - 收件人邮箱
 * @param {string} token - 重置 token
 * @param {string} [lang='en'] - 语言偏好
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendResetEmail(email, token, lang = 'en') {
  const resetUrl = buildResetUrl(token);
  const isZh = lang === 'zh-CN';
  
  const subject = isZh ? '[oMyTree] 重置您的密码' : '[oMyTree] Reset Your Password';
  
  const text = isZh 
    ? `
您好，

我们收到了重置 oMyTree 账号密码的请求。

请点击下方链接设置新密码：
${resetUrl}

该链接将在 ${TOKEN_EXPIRY_HOURS} 小时内有效。

如果您没有请求过重置密码，可以放心忽略此邮件。您的密码将保持不变。

oMyTree 团队
`.trim()
    : `
Hi there,

We received a request to reset your password for oMyTree.

Click the link below to set a new password:
${resetUrl}

This link will expire in ${TOKEN_EXPIRY_HOURS} hours.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

The oMyTree Team
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 64px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Accent Line -->
          <tr>
            <td style="background-color: #10b981; height: 6px; line-height: 6px; font-size: 1px;">&nbsp;</td>
          </tr>
          
          <tr>
            <td style="padding: 56px 40px;">
              <!-- Header -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 40px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                      <tr>
                        <td align="center" style="width: 52px; height: 52px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px; box-shadow: 0 8px 16px rgba(16, 185, 129, 0.2);">
                          <div style="font-size: 28px; line-height: 52px;">🌳</div>
                        </td>
                      </tr>
                    </table>
                    <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em;">oMyTree</div>
                  </td>
                </tr>
              </table>
              
              <!-- Content -->
              <div style="text-align: center;">
                <h1 style="margin: 0 0 16px; font-size: 30px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; line-height: 1.2;">
                  ${isZh ? '重置您的密码' : 'Reset Your Password'}
                </h1>
                <p style="margin: 0 0 36px; font-size: 16px; line-height: 1.6; color: #64748b; max-width: 360px; margin-left: auto; margin-right: auto;">
                  ${isZh ? '我们收到了重置您 oMyTree 账号密码的请求。此操作将确保您的账户安全。' : 'We received a request to reset your password for oMyTree. This will help keep your account secure.'}
                </p>
                
                <!-- Action Button -->
                <div style="margin-bottom: 32px;">
                  <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 18px 36px; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); text-align: center;">
                    ${isZh ? '重置我的密码' : 'Reset My Password'}
                  </a>
                </div>
                
                <!-- URL fallback -->
                <div style="margin-bottom: 40px;">
                  <p style="margin: 0 0 8px; font-size: 13px; color: #94a3b8;">
                    ${isZh ? '或者复制并粘贴此链接：' : 'Or copy and paste this link:'}
                  </p>
                  <a href="${resetUrl}" style="font-size: 13px; color: #059669; text-decoration: none; word-break: break-all; font-weight: 500;">${resetUrl}</a>
                </div>
                
                <!-- Timer Info -->
                <div style="display: inline-block; padding: 8px 16px; background-color: #f8fafc; border-radius: 100px; border: 1px solid #e2e8f0; margin-bottom: 48px;">
                  <span style="font-size: 14px; color: #64748b; font-weight: 500;">
                    ⏱️ ${isZh ? `链接将在 ${TOKEN_EXPIRY_HOURS} 小时内有效` : `Link expires in ${TOKEN_EXPIRY_HOURS} hours`}
                  </span>
                </div>
                
                <div style="height: 1px; background-color: #f1f5f9; margin-bottom: 40px;"></div>
                
                <!-- Security Tip -->
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                  ${isZh ? '如果您未曾请求此操作，可以放心地忽略此邮件。' : 'If you didn\'t request this, you can safely ignore this email.'}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Bottom Footer -->
          <tr>
            <td align="center" style="padding: 0 40px 48px;">
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #64748b;">
                oMyTree
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase;">
                ${isZh ? '构建您的 AI 知识资产' : 'Building Your AI Knowledge Assets'}
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Subtle Footer Links -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 500px; margin-top: 32px;">
          <tr>
            <td align="center">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                © 2026 oMyTree Inc. • Shanghai • Singapore
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return await sendAppMail({ to: email, subject, text, html });
}


/**
 * 根据邮箱查找用户
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} email - 邮箱
 * @returns {Promise<{id: string, email: string, preferred_language: string}|null>}
 */
export async function findUserByEmail(client, email) {
  const res = await client.query(
    `SELECT id, email, preferred_language FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  
  if (res.rows.length === 0) {
    return null;
  }
  
  return res.rows[0];
}
