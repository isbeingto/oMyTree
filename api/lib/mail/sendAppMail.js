/**
 * 应用邮件发送入口
 * T25-0: Mail Transport Baseline
 * 
 * 根据 MAIL_PROVIDER 环境变量选择发送策略：
 * - "log": 仅打印日志（开发/测试）
 * - "smtp": 使用 SMTP 真实发送
 */

import { sendViaSMTP } from './providers/smtpProvider.js';
import { sendViaLog } from './providers/logProvider.js';

/**
 * @typedef {Object} MailOptions
 * @property {string} to - 收件人邮箱
 * @property {string} subject - 邮件主题
 * @property {string} [text] - 纯文本内容
 * @property {string} [html] - HTML 内容
 */

/**
 * @typedef {Object} MailResult
 * @property {boolean} ok - 发送是否成功
 * @property {string} provider - 使用的发送器 ("log" | "smtp")
 * @property {string} [messageId] - 邮件 ID（仅 SMTP）
 * @property {string} [error] - 错误信息
 */

/**
 * 发送应用邮件
 * @param {MailOptions} options - 邮件选项
 * @returns {Promise<MailResult>}
 */
export async function sendAppMail(options) {
  const { to, subject, text, html } = options;

  // 参数校验
  if (!to || typeof to !== 'string') {
    return { ok: false, provider: 'none', error: 'Missing or invalid "to" address' };
  }
  if (!subject || typeof subject !== 'string') {
    return { ok: false, provider: 'none', error: 'Missing or invalid "subject"' };
  }
  if (!text && !html) {
    return { ok: false, provider: 'none', error: 'Either "text" or "html" content is required' };
  }

  const provider = (process.env.MAIL_PROVIDER || 'log').toLowerCase();

  try {
    if (provider === 'smtp') {
      return await sendViaSMTP(options);
    } else {
      // 默认使用 log provider
      return await sendViaLog(options);
    }
  } catch (err) {
    console.error('[sendAppMail] Unexpected error:', err);
    return {
      ok: false,
      provider,
      error: err.message || 'Unknown error'
    };
  }
}

/**
 * 获取当前邮件配置状态（用于调试）
 * @returns {Object}
 */
export function getMailConfig() {
  return {
    provider: process.env.MAIL_PROVIDER || 'log',
    from: {
      address: process.env.MAIL_FROM_ADDRESS || 'noreply@omytree.com',
      name: process.env.MAIL_FROM_NAME || 'OMyTree'
    },
    smtp: {
      host: process.env.MAIL_SMTP_HOST || '(not set)',
      port: process.env.MAIL_SMTP_PORT || '465',
      secure: process.env.MAIL_SMTP_SECURE === 'true',
      user: process.env.MAIL_SMTP_USER ? '(set)' : '(not set)',
      pass: process.env.MAIL_SMTP_PASS ? '(set)' : '(not set)'
    }
  };
}
