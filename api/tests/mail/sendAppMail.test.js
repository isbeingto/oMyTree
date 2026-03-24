/**
 * sendAppMail 单元测试
 * T25-0: Mail Transport Baseline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAppMail, getMailConfig } from '../../lib/mail/sendAppMail.js';

describe('sendAppMail', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 重置为 log provider
    process.env.MAIL_PROVIDER = 'log';
    process.env.MAIL_FROM_ADDRESS = 'test@omytree.com';
    process.env.MAIL_FROM_NAME = 'Test OMyTree';
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  describe('parameter validation', () => {
    it('should reject missing "to" address', async () => {
      const result = await sendAppMail({
        subject: 'Test',
        text: 'Hello'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('to');
    });

    it('should reject missing "subject"', async () => {
      const result = await sendAppMail({
        to: 'test@example.com',
        text: 'Hello'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('subject');
    });

    it('should reject missing content (both text and html)', async () => {
      const result = await sendAppMail({
        to: 'test@example.com',
        subject: 'Test'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('content');
    });
  });

  describe('log provider', () => {
    it('should successfully "send" via log provider with text content', async () => {
      const result = await sendAppMail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello, this is a test email.'
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('log');
      expect(result.messageId).toBeDefined();
      expect(result.note).toContain('not sent');
    });

    it('should successfully "send" via log provider with html content', async () => {
      const result = await sendAppMail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Hello, this is a test email.</p>'
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('log');
    });

    it('should successfully "send" via log provider with both text and html', async () => {
      const result = await sendAppMail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Plain text version',
        html: '<p>HTML version</p>'
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('log');
    });
  });

  describe('provider selection', () => {
    it('should use log provider by default', async () => {
      delete process.env.MAIL_PROVIDER;

      const result = await sendAppMail({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello'
      });

      expect(result.provider).toBe('log');
    });

    it('should use log provider when MAIL_PROVIDER=log', async () => {
      process.env.MAIL_PROVIDER = 'log';

      const result = await sendAppMail({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello'
      });

      expect(result.provider).toBe('log');
    });

    it('should use smtp provider when MAIL_PROVIDER=smtp (but fail without config)', async () => {
      process.env.MAIL_PROVIDER = 'smtp';
      // 清除 SMTP 配置
      delete process.env.MAIL_SMTP_HOST;
      delete process.env.MAIL_SMTP_USER;
      delete process.env.MAIL_SMTP_PASS;

      const result = await sendAppMail({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Hello'
      });

      expect(result.provider).toBe('smtp');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('SMTP configuration incomplete');
    });
  });
});

describe('getMailConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return current mail configuration', () => {
    process.env.MAIL_PROVIDER = 'smtp';
    process.env.MAIL_FROM_ADDRESS = 'noreply@example.com';
    process.env.MAIL_FROM_NAME = 'Example App';
    process.env.MAIL_SMTP_HOST = 'smtp.example.com';
    process.env.MAIL_SMTP_PORT = '587';
    process.env.MAIL_SMTP_SECURE = 'false';
    process.env.MAIL_SMTP_USER = 'user@example.com';
    process.env.MAIL_SMTP_PASS = 'secret';

    const config = getMailConfig();

    expect(config.provider).toBe('smtp');
    expect(config.from.address).toBe('noreply@example.com');
    expect(config.from.name).toBe('Example App');
    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtp.port).toBe('587');
    expect(config.smtp.secure).toBe(false);
    expect(config.smtp.user).toBe('(set)');  // 敏感信息脱敏
    expect(config.smtp.pass).toBe('(set)');  // 敏感信息脱敏
  });

  it('should show "(not set)" for missing SMTP credentials', () => {
    delete process.env.MAIL_SMTP_USER;
    delete process.env.MAIL_SMTP_PASS;

    const config = getMailConfig();

    expect(config.smtp.user).toBe('(not set)');
    expect(config.smtp.pass).toBe('(not set)');
  });
});
