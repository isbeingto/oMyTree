/**
 * 邮箱验证服务单元测试
 * T25-1: Email Verification Flow (验证码模式)
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  generateVerificationCode,
  generateVerificationToken,
  createVerificationCode,
  checkResendCooldown,
  verifyEmailCode,
  verifyEmailToken,
  getUserEmailStatus
} from '../lib/email_verification.js';

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'omytree',
  password: process.env.PGPASSWORD || 'test_password',
  database: process.env.PGDATABASE || 'omytree',
});

async function createTestUser() {
  const email = `verify+${Date.now()}@test.com`;
  const res = await pool.query(
    `INSERT INTO users (email, created_at, updated_at) 
     VALUES ($1, NOW(), NOW()) 
     RETURNING id, email`,
    [email]
  );
  return res.rows[0];
}

async function cleanupTestUser(userId) {
  await pool.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

describe('generateVerificationCode', () => {
  it('should generate a 6-digit numeric string', () => {
    const code = generateVerificationCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('should generate codes in range 100000-999999', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVerificationCode();
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

describe('generateVerificationToken', () => {
  it('should generate a 32-character hex string', () => {
    const token = generateVerificationToken();
    expect(token).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should generate unique tokens', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateVerificationToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe('email verification flow', () => {
  let testUser;
  let client;

  beforeEach(async () => {
    testUser = await createTestUser();
    client = await pool.connect();
  });

  afterEach(async () => {
    if (client) client.release();
    if (testUser?.id) await cleanupTestUser(testUser.id);
  });

  describe('createVerificationCode', () => {
    it('should create a new code record', async () => {
      const { code, token, expiresAt } = await createVerificationCode(client, testUser.id);
      
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
      expect(token).toHaveLength(32);
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      
      // Verify in database
      const res = await client.query(
        `SELECT * FROM email_verification_tokens WHERE token = $1`,
        [token]
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].user_id).toBe(testUser.id);
      expect(res.rows[0].verification_code).toBe(code);
      expect(res.rows[0].used_at).toBeNull();
    });
  });

  describe('checkResendCooldown', () => {
    it('should allow resend when no recent code exists', async () => {
      const result = await checkResendCooldown(client, testUser.id);
      expect(result.canResend).toBe(true);
    });

    it('should block resend when code was recently created', async () => {
      await createVerificationCode(client, testUser.id);
      
      const result = await checkResendCooldown(client, testUser.id);
      expect(result.canResend).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(60);
    });
  });

  describe('verifyEmailCode', () => {
    it('should return invalid for non-existent code', async () => {
      const result = await verifyEmailCode(client, testUser.id, '000000');
      expect(result.status).toBe('invalid');
    });

    it('should verify valid code and update user emailVerified', async () => {
      const { code } = await createVerificationCode(client, testUser.id);
      
      const result = await verifyEmailCode(client, testUser.id, code);
      expect(result.status).toBe('ok');
      expect(result.userId).toBe(testUser.id);
      
      // Check user emailVerified is set
      const userRes = await client.query(
        `SELECT "emailVerified" FROM users WHERE id = $1`,
        [testUser.id]
      );
      expect(userRes.rows[0].emailVerified).not.toBeNull();
    });

    it('should return invalid for already-used code', async () => {
      const { code } = await createVerificationCode(client, testUser.id);
      
      // First verification
      await verifyEmailCode(client, testUser.id, code);
      
      // Second verification attempt - returns invalid because used codes are not found
      const result = await verifyEmailCode(client, testUser.id, code);
      expect(result.status).toBe('invalid');
    });

    it('should return expired for expired code', async () => {
      const { code, token } = await createVerificationCode(client, testUser.id);
      // Manually expire the code
      await client.query(
        `UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token = $1`,
        [token]
      );
      
      const result = await verifyEmailCode(client, testUser.id, code);
      expect(result.status).toBe('expired');
    });
  });

  describe('verifyEmailToken (backward compat)', () => {
    it('should return invalid for non-existent token', async () => {
      const result = await verifyEmailToken(client, 'non-existent-token');
      expect(result.status).toBe('invalid');
    });

    it('should verify valid token and update user emailVerified', async () => {
      const { token } = await createVerificationCode(client, testUser.id);
      
      const result = await verifyEmailToken(client, token);
      expect(result.status).toBe('ok');
      expect(result.userId).toBe(testUser.id);
      
      // Check user emailVerified is set
      const userRes = await client.query(
        `SELECT "emailVerified" FROM users WHERE id = $1`,
        [testUser.id]
      );
      expect(userRes.rows[0].emailVerified).not.toBeNull();
      
      // Check token is marked as used
      const tokenRes = await client.query(
        `SELECT used_at FROM email_verification_tokens WHERE token = $1`,
        [token]
      );
      expect(tokenRes.rows[0].used_at).not.toBeNull();
    });
  });

  describe('getUserEmailStatus', () => {
    it('should return user email status', async () => {
      const status = await getUserEmailStatus(client, testUser.id);
      
      expect(status.email).toBe(testUser.email);
      expect(status.emailVerified).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      // Use a random UUID that doesn't exist
      const fakeUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const status = await getUserEmailStatus(client, fakeUuid);
      expect(status).toBeNull();
    });
  });
});

afterAll(async () => {
  await pool.end();
});
