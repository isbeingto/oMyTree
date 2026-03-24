const ERROR_CODES = {
  BYOK_INVALID_KEY: 'byok_invalid_key',
  BYOK_INSUFFICIENT_QUOTA: 'byok_insufficient_quota',
  PROVIDER_UNREACHABLE: 'provider_unreachable',
  PROVIDER_RATE_LIMITED: 'provider_rate_limited',
  FILE_UPLOAD_FAILED: 'file_upload_failed',
  FILE_TYPE_UNSUPPORTED: 'file_type_unsupported',
  TIMEOUT: 'timeout',
  INTERNAL_ERROR: 'internal_error',
};

const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH']);

function providerLabel(id = 'provider') {
  const normalized = typeof id === 'string' ? id.toLowerCase() : '';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'google' || normalized === 'gemini') return 'Google Gemini';
  if (normalized === 'anthropic' || normalized === 'claude') return 'Anthropic Claude';
  if (normalized === 'deepseek') return 'DeepSeek';
  if (normalized === 'omytree-default') return 'oMyTree Default';
  if (normalized === 'mock') return 'Mock';
  if (normalized.startsWith('user-')) return providerLabel(normalized.replace(/^user-/, ''));
  return id || 'provider';
}

function baseMessageForCode(code, provider) {
  const label = providerLabel(provider);
  switch (code) {
    case ERROR_CODES.BYOK_INVALID_KEY:
      return `The provided ${label} API key is invalid or has been revoked.`;
    case ERROR_CODES.BYOK_INSUFFICIENT_QUOTA:
      return `Your ${label} account has insufficient balance or quota.`;
    case ERROR_CODES.PROVIDER_UNREACHABLE:
      return `Cannot connect to ${label} right now. Please try again or switch models.`;
    case ERROR_CODES.PROVIDER_RATE_LIMITED:
      return `Requests to ${label} are being rate limited. Please slow down and retry.`;
    case ERROR_CODES.FILE_UPLOAD_FAILED:
      return `Failed to upload file to ${label}. Please retry or switch models.`;
    case ERROR_CODES.FILE_TYPE_UNSUPPORTED:
      return `${label} does not support the selected file type. Please upload a supported file.`;
    case ERROR_CODES.TIMEOUT:
      return `${label} did not respond in time. Please retry or switch providers.`;
    default:
      return `Unexpected error from ${label}. Please retry shortly.`;
  }
}

function serializeRaw(raw) {
  if (raw === null || typeof raw === 'undefined') return null;
  if (typeof raw === 'string') return raw.slice(0, 2000);
  try {
    const serialized = JSON.stringify(raw);
    return serialized.slice(0, 2000);
  } catch (err) {
    return String(raw).slice(0, 2000);
  }
}

export class LlmError extends Error {
  constructor({ code, provider = 'unknown', status = 500, message, raw = null, isByok = false } = {}) {
    super(message || baseMessageForCode(code, provider));
    this.name = 'LlmError';
    this.code = code || ERROR_CODES.INTERNAL_ERROR;
    this.provider = provider || 'unknown';
    this.status = status || 500;
    this.raw = serializeRaw(raw);
    this.isByok = Boolean(isByok);
    this.isLlmError = true;
  }
}

export function isLlmError(error) {
  return Boolean(error && (error instanceof LlmError || error.isLlmError));
}

export function mapHttpError({ provider = 'unknown', status, payload = null, isByok = false }) {
  const message = typeof payload?.error?.message === 'string'
    ? payload.error.message
    : typeof payload?.message === 'string'
      ? payload.message
      : '';
  const lowerMsg = message.toLowerCase();
  if (isByok && (status === 401 || status === 403 || lowerMsg.includes('invalid api key') || lowerMsg.includes('unauthorized') || lowerMsg.includes('incorrect api key'))) {
    return new LlmError({
      code: ERROR_CODES.BYOK_INVALID_KEY,
      provider,
      status: 400,
      raw: payload || message,
      message: baseMessageForCode(ERROR_CODES.BYOK_INVALID_KEY, provider),
      isByok,
    });
  }

  if (isByok && (status === 402 || lowerMsg.includes('insufficient_quota') || lowerMsg.includes('insufficient funds') || lowerMsg.includes('insufficient balance'))) {
    return new LlmError({
      code: ERROR_CODES.BYOK_INSUFFICIENT_QUOTA,
      provider,
      status: 402,
      raw: payload || message,
      message: baseMessageForCode(ERROR_CODES.BYOK_INSUFFICIENT_QUOTA, provider),
      isByok,
    });
  }

  if (status === 429 || lowerMsg.includes('rate limit')) {
    return new LlmError({
      code: ERROR_CODES.PROVIDER_RATE_LIMITED,
      provider,
      status: 429,
      raw: payload || message,
      message: baseMessageForCode(ERROR_CODES.PROVIDER_RATE_LIMITED, provider),
      isByok,
    });
  }

  if (status === 408 || status === 504) {
    return new LlmError({
      code: ERROR_CODES.TIMEOUT,
      provider,
      status: 504,
      raw: payload || message,
      message: baseMessageForCode(ERROR_CODES.TIMEOUT, provider),
      isByok,
    });
  }

  if (status >= 500) {
    return new LlmError({
      code: ERROR_CODES.PROVIDER_UNREACHABLE,
      provider,
      status: 503,
      raw: payload || message,
      message: baseMessageForCode(ERROR_CODES.PROVIDER_UNREACHABLE, provider),
      isByok,
    });
  }

  return new LlmError({
    code: ERROR_CODES.INTERNAL_ERROR,
    provider,
    status: status || 500,
    raw: payload || message,
    message: baseMessageForCode(ERROR_CODES.INTERNAL_ERROR, provider),
    isByok,
  });
}

export function mapLlmError(error, { provider = 'unknown', isByok = false } = {}) {
  if (isLlmError(error)) {
    return error;
  }

  const netCode = error?.code || error?.cause?.code;
  const message = typeof error?.message === 'string' ? error.message : '';
  if (error?.name === 'AbortError' || message.toLowerCase().includes('timeout')) {
    return new LlmError({
      code: ERROR_CODES.TIMEOUT,
      provider,
      status: 504,
      raw: message,
      message: baseMessageForCode(ERROR_CODES.TIMEOUT, provider),
      isByok,
    });
  }

  if (netCode && NETWORK_ERROR_CODES.has(netCode)) {
    return new LlmError({
      code: ERROR_CODES.PROVIDER_UNREACHABLE,
      provider,
      status: 503,
      raw: message || netCode,
      message: baseMessageForCode(ERROR_CODES.PROVIDER_UNREACHABLE, provider),
      isByok,
    });
  }

  if (typeof message === 'string' && (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('EHOSTUNREACH'))) {
    return new LlmError({
      code: ERROR_CODES.PROVIDER_UNREACHABLE,
      provider,
      status: 503,
      raw: message,
      message: baseMessageForCode(ERROR_CODES.PROVIDER_UNREACHABLE, provider),
      isByok,
    });
  }

  return new LlmError({
    code: ERROR_CODES.INTERNAL_ERROR,
    provider,
    status: 500,
    raw: error?.stack || message || String(error),
    message: baseMessageForCode(ERROR_CODES.INTERNAL_ERROR, provider),
    isByok,
  });
}

export async function recordLlmErrorEvent({ pool, userId = null, treeId = null, provider = 'unknown', errorCode = ERROR_CODES.INTERNAL_ERROR, message = null, rawError = null, isByok = false, traceId = null } = {}) {
  if (!pool) {
    return;
  }
  const safeMessage = message || baseMessageForCode(errorCode, provider);
  const safeRaw = serializeRaw(rawError);
  try {
    await pool.query(
      `INSERT INTO llm_error_events (user_id, tree_id, provider, error_code, message, raw_error, is_byok, trace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId || null, treeId || null, provider || 'unknown', errorCode, safeMessage, safeRaw, isByok, traceId || null]
    );
  } catch (err) {
    console.warn('[llm] failed to record error event:', err.message);
  }
}

export { ERROR_CODES as LLM_ERROR_CODES, providerLabel };
