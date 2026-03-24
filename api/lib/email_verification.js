/**
 * 邮箱验证服务
 * T25-1: Email Verification Flow (重构为验证码模式)
 * 
 * 提供：
 * - 生成 6 位验证码
 * - 发送验证码邮件
 * - 校验验证码
 */

import crypto from 'crypto';
import { sendAppMail } from './mail/sendAppMail.js';

// 验证码有效期：15 分钟
const CODE_EXPIRY_MINUTES = 15;
// 重发冷却时间：60 秒
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * 生成 6 位数字验证码
 * @returns {string} 6 位数字验证码
 */
export function generateVerificationCode() {
  // 生成 100000-999999 之间的随机数
  return String(Math.floor(100000 + crypto.randomInt(900000)));
}

/**
 * 生成安全随机 token (用于内部标识)
 * @returns {string} 32 字符的十六进制字符串
 */
export function generateVerificationToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 创建验证码记录
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @returns {Promise<{code: string, token: string, expiresAt: Date}>}
 */
export async function createVerificationCode(client, userId) {
  const code = generateVerificationCode();
  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  // 先使旧的未使用验证码失效
  await client.query(
    `UPDATE email_verification_tokens 
     SET used_at = NOW() 
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  // 创建新验证码记录
  await client.query(
    `INSERT INTO email_verification_tokens (user_id, token, verification_code, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, token, code, expiresAt]
  );

  return { code, token, expiresAt };
}

/**
 * 检查是否可以重新发送验证码（冷却时间检查）
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @returns {Promise<{canResend: boolean, remainingSeconds?: number}>}
 */
export async function checkResendCooldown(client, userId) {
  const cooldownTime = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);
  
  const res = await client.query(
    `SELECT created_at FROM email_verification_tokens
     WHERE user_id = $1 AND created_at > $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, cooldownTime]
  );

  if (res.rows.length === 0) {
    return { canResend: true };
  }

  const lastTokenTime = new Date(res.rows[0].created_at);
  const remainingMs = (RESEND_COOLDOWN_SECONDS * 1000) - (Date.now() - lastTokenTime.getTime());
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return {
    canResend: false,
    remainingSeconds
  };
}

/**
 * 验证验证码
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @param {string} code - 验证码
 * @returns {Promise<{status: 'ok'|'invalid'|'expired', userId?: string}>}
 */
export async function verifyEmailCode(client, userId, code) {
  // 查找该用户最新的未使用验证码
  const tokenRes = await client.query(
    `SELECT id, user_id, verification_code, expires_at, used_at 
     FROM email_verification_tokens 
     WHERE user_id = $1 AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (tokenRes.rows.length === 0) {
    return { status: 'invalid' };
  }

  const tokenRecord = tokenRes.rows[0];

  // 检查是否过期
  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { status: 'expired' };
  }

  // 验证码比对
  if (tokenRecord.verification_code !== code) {
    return { status: 'invalid' };
  }

  // 标记验证码为已使用
  await client.query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenRecord.id]
  );

  // 更新用户的 emailVerified
  await client.query(
    `UPDATE users SET "emailVerified" = NOW() WHERE id = $1 AND "emailVerified" IS NULL`,
    [tokenRecord.user_id]
  );

  return { status: 'ok', userId: tokenRecord.user_id };
}

/**
 * 发送验证码邮件
 * @param {string} email - 收件人邮箱
 * @param {string} code - 验证码
 * @param {string} lang - 语言 'zh-CN' | 'en'
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function sendVerificationEmail(email, code, lang = 'en') {
  const isZh = lang === 'zh-CN';
  const expiryMinutes = CODE_EXPIRY_MINUTES;
  
  const subject = isZh 
    ? `[oMyTree] 你的验证码是 ${code}` 
    : `[oMyTree] Your verification code is ${code}`;
  
  const text = isZh 
    ? `
欢迎使用 oMyTree！

你的邮箱验证码是：${code}

验证码将在 ${expiryMinutes} 分钟后过期。

如果你没有注册 oMyTree 账号，请忽略此邮件。

oMyTree 团队
`.trim()
    : `
Welcome to oMyTree!

Your verification code is: ${code}

This code will expire in ${expiryMinutes} minutes.

If you did not create an account, you can safely ignore this email.

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
                  ${isZh ? '验证您的邮箱' : 'Verify Your Email'}
                </h1>
                <p style="margin: 0 0 40px; font-size: 16px; line-height: 1.6; color: #64748b; max-width: 360px; margin-left: auto; margin-right: auto;">
                  ${isZh ? '感谢选择 oMyTree。请在下方获取您的验证码以继续。' : 'Welcome to oMyTree. Use the verification code below to complete your setup.'}
                </p>
                
                <!-- Code Box -->
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 40px;">
                  <tr>
                    <td style="background-color: #f1f5f9; border-radius: 20px; padding: 24px 40px; border: 1px solid #e2e8f0;">
                      <div style="font-size: 48px; font-weight: 800; letter-spacing: 0.2em; color: #059669; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-indent: 0.2em;">
                        ${code}
                      </div>
                    </td>
                  </tr>
                </table>
                
                <!-- Timer Info -->
                <div style="display: inline-block; padding: 8px 16px; background-color: #f8fafc; border-radius: 100px; border: 1px solid #e2e8f0; margin-bottom: 48px;">
                  <span style="font-size: 14px; color: #64748b; font-weight: 500;">
                    ⏱️ ${isZh ? `该验证码将在 ${expiryMinutes} 分钟内有效` : `Useful for the next ${expiryMinutes} minutes`}
                  </span>
                </div>
                
                <div style="height: 1px; background-color: #f1f5f9; margin-bottom: 40px;"></div>
                
                <!-- Security Tip -->
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                  ${isZh ? '如果您未曾请求此代码，请忽略此邮件。' : 'If you didn\'t request this code, you can safely ignore this email.'}
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
 * 获取用户邮箱验证状态
 * @param {import('pg').PoolClient} client - 数据库连接
 * @param {string} userId - 用户 ID
 * @returns {Promise<{email: string, emailVerified: Date|null, preferred_language: string|null}>}
 */
export async function getUserEmailStatus(client, userId) {
  const res = await client.query(
    `SELECT email, "emailVerified", preferred_language FROM users WHERE id = $1`,
    [userId]
  );
  
  if (res.rows.length === 0) {
    return null;
  }
  
  return {
    email: res.rows[0].email,
    emailVerified: res.rows[0].emailVerified,
    preferred_language: res.rows[0].preferred_language
  };
}

// 保留旧的 token 验证函数用于向后兼容（链接验证）
export async function verifyEmailToken(client, token) {
  const tokenRes = await client.query(
    `SELECT id, user_id, expires_at, used_at 
     FROM email_verification_tokens 
     WHERE token = $1`,
    [token]
  );

  if (tokenRes.rows.length === 0) {
    return { status: 'invalid' };
  }

  const tokenRecord = tokenRes.rows[0];

  if (tokenRecord.used_at) {
    return { status: 'used' };
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { status: 'expired' };
  }

  await client.query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenRecord.id]
  );

  await client.query(
    `UPDATE users SET "emailVerified" = NOW() WHERE id = $1 AND "emailVerified" IS NULL`,
    [tokenRecord.user_id]
  );

  return { status: 'ok', userId: tokenRecord.user_id };
}
