/**
 * SMTP 邮件发送器
 * T25-0: Mail Transport Baseline
 * 
 * 使用 nodemailer 通过 SMTP 发送邮件
 */

import nodemailer from 'nodemailer';

let transporter = null;

/**
 * 获取或创建 SMTP transporter
 * @returns {Object} nodemailer transporter
 */
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = process.env.MAIL_SMTP_HOST;
  const port = parseInt(process.env.MAIL_SMTP_PORT || '465', 10);
  const secure = process.env.MAIL_SMTP_SECURE !== 'false'; // 默认 true
  const user = process.env.MAIL_SMTP_USER;
  const pass = process.env.MAIL_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration incomplete: missing MAIL_SMTP_HOST, MAIL_SMTP_USER, or MAIL_SMTP_PASS');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    // 连接超时设置
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000
  });

  return transporter;
}

/**
 * 通过 SMTP 发送邮件
 * @param {Object} options - 邮件选项
 * @param {string} options.to - 收件人
 * @param {string} options.subject - 主题
 * @param {string} [options.text] - 纯文本
 * @param {string} [options.html] - HTML
 * @returns {Promise<Object>} 发送结果
 */
export async function sendViaSMTP(options) {
  const { to, subject, text, html } = options;

  try {
    const transport = getTransporter();

    const fromAddress = process.env.MAIL_FROM_ADDRESS || 'noreply@omytree.com';
    const fromName = process.env.MAIL_FROM_NAME || 'OMyTree';

    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text,
      html
    };

    console.log(`[smtpProvider] Sending email to: ${to}, subject: "${subject}"`);

    const info = await transport.sendMail(mailOptions);

    console.log(`[smtpProvider] Email sent successfully. MessageId: ${info.messageId}`);

    return {
      ok: true,
      provider: 'smtp',
      messageId: info.messageId
    };
  } catch (err) {
    console.error('[smtpProvider] Failed to send email:', err.message);
    return {
      ok: false,
      provider: 'smtp',
      error: err.message
    };
  }
}

/**
 * 验证 SMTP 连接
 * @returns {Promise<Object>}
 */
export async function verifySMTPConnection() {
  try {
    const transport = getTransporter();
    await transport.verify();
    return { ok: true, message: 'SMTP connection verified' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
