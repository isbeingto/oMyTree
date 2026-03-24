/**
 * 日志邮件发送器
 * T25-0: Mail Transport Baseline
 * 
 * 开发/测试环境使用，仅打印日志不真实发送
 */

/**
 * 通过日志"发送"邮件（实际不发送）
 * @param {Object} options - 邮件选项
 * @param {string} options.to - 收件人
 * @param {string} options.subject - 主题
 * @param {string} [options.text] - 纯文本
 * @param {string} [options.html] - HTML
 * @returns {Promise<Object>} 发送结果
 */
export async function sendViaLog(options) {
  const { to, subject, text, html } = options;

  const fromAddress = process.env.MAIL_FROM_ADDRESS || 'noreply@omytree.com';
  const fromName = process.env.MAIL_FROM_NAME || 'OMyTree';

  const logEntry = {
    timestamp: new Date().toISOString(),
    provider: 'log',
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject,
    hasText: !!text,
    hasHtml: !!html,
    textPreview: text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : null,
    htmlPreview: html ? html.substring(0, 100) + (html.length > 100 ? '...' : '') : null
  };

  console.log('[logProvider] ========== EMAIL (not sent) ==========');
  console.log(JSON.stringify(logEntry, null, 2));
  console.log('[logProvider] ========================================');

  // 生成一个假的 messageId 用于测试
  const fakeMessageId = `<log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@omytree.local>`;

  return {
    ok: true,
    provider: 'log',
    messageId: fakeMessageId,
    note: 'Email logged but not sent (MAIL_PROVIDER=log)'
  };
}
