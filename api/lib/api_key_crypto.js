/**
 * API Key 加密/解密工具
 * 
 * 使用 AES-256-GCM 加密，密钥来自环境变量 API_KEY_ENCRYPTION_SECRET
 * 
 * 安全要求：
 * - 生产环境必须配置 API_KEY_ENCRYPTION_SECRET（至少 32 字节）
 * - 开发/测试环境可使用 base64 fallback（仅用于本地开发，绝不可用于生产）
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// 检测是否为生产环境
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * 验证加密密钥配置
 * 生产环境启动时必须有有效密钥，否则拒绝启动
 */
function validateEncryptionConfig() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  
  if (IS_PRODUCTION) {
    if (!secret) {
      throw new Error(
        '[FATAL] API_KEY_ENCRYPTION_SECRET is required in production. ' +
        'Please set a 32+ byte random string before starting the service.'
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `[FATAL] API_KEY_ENCRYPTION_SECRET must be at least 32 bytes (got ${secret.length}). ` +
        'Please generate a secure random string: openssl rand -base64 32'
      );
    }
    console.log('[crypto] Production encryption key validated ✓');
  } else if (!secret || secret.length < 32) {
    // 开发/测试环境警告
    console.warn(
      '[crypto] ⚠️  WARNING: API_KEY_ENCRYPTION_SECRET not configured or too short. ' +
      'Using base64 encoding (INSECURE - DO NOT USE IN PRODUCTION)'
    );
  }
}

// 模块加载时验证配置
validateEncryptionConfig();

/**
 * 获取加密密钥
 * @returns {Buffer|null}
 */
function getEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  // 使用 SHA-256 确保密钥长度为 32 字节
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * 加密 API Key
 * @param {string} plaintext - 原始 API Key
 * @returns {string} - 加密后的字符串（base64 格式）
 */
export function encryptApiKey(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();
  
  if (!key) {
    // 开发模式：仅 base64 编码
    // ⚠️ 这是不安全的！仅用于本地开发，绝不可用于生产环境
    if (IS_PRODUCTION) {
      throw new Error('Cannot encrypt without API_KEY_ENCRYPTION_SECRET in production');
    }
    console.warn('[crypto] Using base64 encoding (INSECURE - dev only)');
    return `base64:${Buffer.from(plaintext).toString('base64')}`;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // 格式: iv + authTag + encrypted (all base64)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return `enc:${combined.toString('base64')}`;
}

/**
 * 解密 API Key
 * @param {string} ciphertext - 加密后的字符串
 * @returns {string} - 原始 API Key
 */
export function decryptApiKey(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') {
    throw new Error('ciphertext must be a non-empty string');
  }

  // 检查是否是 base64 编码（开发模式）
  if (ciphertext.startsWith('base64:')) {
    return Buffer.from(ciphertext.slice(7), 'base64').toString('utf8');
  }

  if (!ciphertext.startsWith('enc:')) {
    throw new Error('Invalid ciphertext format');
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('API_KEY_ENCRYPTION_SECRET not configured, cannot decrypt');
  }

  const combined = Buffer.from(ciphertext.slice(4), 'base64');
  
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * 脱敏 API Key，只显示最后 4 位
 * @param {string} apiKey - 原始 API Key
 * @returns {string} - 脱敏后的显示文本
 */
export function maskApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return '****';
  }
  if (apiKey.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.min(apiKey.length - 4, 20))}${apiKey.slice(-4)}`;
}

export default {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
};
