/**
 * Admin 调试端点 - 邮件测试
 * T25-0: Mail Transport Baseline
 * 
 * POST /api/admin/debug/send-test-mail
 * 
 * 注意：此端点仅在 ACCEPT_DEV_ENDPOINTS=1 时可用
 */

import express from 'express';
import { sendAppMail, getMailConfig } from '../lib/mail/sendAppMail.js';
import { verifySMTPConnection } from '../lib/mail/providers/smtpProvider.js';
import { respondWithError } from '../lib/errors.js';

const router = express.Router();

/**
 * GET /api/admin/debug/mail-config
 * 获取当前邮件配置（敏感信息脱敏）
 */
router.get('/mail-config', async (req, res) => {
  // 检查开发模式
  if (process.env.ACCEPT_DEV_ENDPOINTS !== '1') {
    return respondWithError(res, {
      status: 403,
      code: 'debug_disabled',
      message: 'Debug endpoints are disabled in production'
    });
  }

  const config = getMailConfig();
  res.json({
    ok: true,
    config
  });
});

/**
 * POST /api/admin/debug/send-test-mail
 * 发送测试邮件
 * 
 * Body:
 * {
 *   "to": "test@example.com",
 *   "subject": "Test Email",      // 可选，默认 "OMyTree Test Email"
 *   "message": "Hello World"      // 可选，默认测试消息
 * }
 */
router.post('/send-test-mail', async (req, res) => {
  // 检查开发模式
  if (process.env.ACCEPT_DEV_ENDPOINTS !== '1') {
    return respondWithError(res, {
      status: 403,
      code: 'debug_disabled',
      message: 'Debug endpoints are disabled in production'
    });
  }

  const { to, subject, message } = req.body;

  if (!to) {
    return respondWithError(res, {
      status: 400,
      code: 'missing_recipient',
      message: 'Missing "to" email address'
    });
  }

  const testSubject = subject || 'OMyTree Test Email';
  const testMessage = message || `This is a test email from OMyTree.\n\nSent at: ${new Date().toISOString()}`;

  const result = await sendAppMail({
    to,
    subject: testSubject,
    text: testMessage,
    html: `<html><body><p>${testMessage.replace(/\n/g, '<br>')}</p></body></html>`
  });

  res.json({
    ...result,
    testDetails: {
      to,
      subject: testSubject,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/admin/debug/verify-smtp
 * 验证 SMTP 连接（仅当 MAIL_PROVIDER=smtp 时有意义）
 */
router.post('/verify-smtp', async (req, res) => {
  // 检查开发模式
  if (process.env.ACCEPT_DEV_ENDPOINTS !== '1') {
    return respondWithError(res, {
      status: 403,
      code: 'debug_disabled',
      message: 'Debug endpoints are disabled in production'
    });
  }

  const provider = process.env.MAIL_PROVIDER || 'log';

  if (provider !== 'smtp') {
    return res.json({
      ok: false,
      message: `SMTP verification skipped: current provider is "${provider}"`,
      hint: 'Set MAIL_PROVIDER=smtp to enable SMTP sending'
    });
  }

  const result = await verifySMTPConnection();
  res.json(result);
});

export default router;
