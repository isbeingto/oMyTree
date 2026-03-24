/**
 * T32-0: Anthropic Claude Driver
 * 
 * 封装 Anthropic Messages API 的调用逻辑
 * 支持流式和非流式请求
 * 
 * API 文档: https://docs.anthropic.com/en/api/messages
 */

import {
  LLM_ERROR_CODES,
  createLLMError,
  createLLMResponse,
  createLLMErrorResponse,
} from '../types.js';
import { recordStreamCompletion } from '../streaming_metrics.js';
import { getCachedProviderFiles, cacheProviderFile } from '../../uploads/provider_file_cache.js';
import {
  estimatePromptTokensFromMessages,
  isPromptCachingEnabled,
  buildAnthropicSystemPayload,
  recordPromptCacheMetrics,
} from '../prompt_cache.js';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes (matches typical official SDK defaults)

/**
 * Anthropic Driver
 * 
 * @param {import('../types.js').LLMRequest} request
 * @returns {Promise<import('../types.js').LLMResponse> | AsyncGenerator<import('../types.js').LLMChunk>}
 */
export async function anthropicDriver(request) {
  if (request.stream) {
    return streamAnthropic(request);
  }
  return callAnthropic(request);
}

/**
 * 非流式调用 Anthropic
 */
async function callAnthropic(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    maxTokens = 4096,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'anthropic',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/messages');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = mergeSignals(signal, controller.signal);
  
  try {
    const { messages: processedMessages, filesApiEnabled } = await processAllAttachments({
      apiKey,
      baseUrl,
      messages,
      currentAttachments: request.attachments,
      isByok,
    });

    const { body, cacheApplied } = buildRequestBody({
      model,
      messages: processedMessages,
      maxTokens,
      temperature,
      stream: false,
      cacheEnabled,
    });
    
    if (traceId) {
      console.log(`[anthropic] Request traceId=${traceId} model=${model} endpoint=${endpoint}`);
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey, { filesApiEnabled }),
      body: JSON.stringify(body),
      signal: mergedSignal,
    });
    
    const payload = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const error = mapHttpError(response.status, payload, isByok);
      console.error(`[anthropic] Error: status=${response.status}`, error.message);
      return createLLMErrorResponse(error);
    }
    
    const text = extractTextFromResponse(payload);
    const reasoning = extractThinkingFromResponse(payload);
    const usage = mapUsage(payload?.usage);

    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'anthropic',
      model: payload?.model || model,
      usage,
      promptTokens: usage?.promptTokens ?? promptTokensEstimate,
      cacheApplied,
    });
    
    const result = createLLMResponse({
      text,
      usage,
      model: payload?.model || model,
      provider: 'anthropic',
      isByok,
    });
    if (reasoning) {
      result.reasoning = reasoning;
    }
    return result;
    
  } catch (err) {
    const error = mapError(err, isByok);
    console.error(`[anthropic] Exception:`, err.message);
    return createLLMErrorResponse(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 流式调用 Anthropic
 * 返回 AsyncGenerator<LLMChunk>
 * 
 * Claude 流式响应格式 (SSE):
 * - event: message_start
 *   data: {"type":"message_start","message":{...}}
 * - event: content_block_start
 *   data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
 * - event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
 * - event: content_block_stop
 *   data: {"type":"content_block_stop","index":0}
 * - event: message_delta
 *   data: {"type":"message_delta","delta":{...},"usage":{"output_tokens":...}}
 * - event: message_stop
 *   data: {"type":"message_stop"}
 */
async function* streamAnthropic(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    maxTokens = 4096,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'anthropic',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/messages');
  
  const controller = new AbortController();
  // 使用 idle timeout（空闲超时）而非固定超时
  // 每次收到数据就重置计时器，允许长内容生成
  let idleTimeout = setTimeout(() => controller.abort(), timeoutMs);
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => controller.abort(), timeoutMs);
  };
  const mergedSignal = mergeSignals(signal, controller.signal);
  
  try {
    const { messages: processedMessages, filesApiEnabled } = await processAllAttachments({
      apiKey,
      baseUrl,
      messages,
      currentAttachments: request.attachments,
      isByok,
    });

    const { body, cacheApplied } = buildRequestBody({
      model,
      messages: processedMessages,
      maxTokens,
      temperature,
      stream: true,
      cacheEnabled,
    });
    
    if (traceId) {
      console.log(`[anthropic_stream] Request traceId=${traceId} model=${model}`);
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey, { filesApiEnabled }),
      body: JSON.stringify(body),
      signal: mergedSignal,
    });
    
    // 收到响应头，重置超时
    resetIdleTimeout();
    
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = mapHttpError(response.status, payload, isByok);
      yield { done: true, type: 'error', error };
      return;
    }
    
    let fullText = '';
    let fullReasoning = '';
    let totalUsage = null;
    let chunkCount = 0;
    
    for await (const chunk of parseAnthropicStream(response, resetIdleTimeout)) {
      chunkCount++;
      
      // 每次收到数据重置 idle timeout
      resetIdleTimeout();
      
      if (chunk.type === 'delta' && chunk.text) {
        fullText += chunk.text;
        yield {
          done: false,
          type: 'delta',
          deltaText: chunk.text,
        };
      }

      // Extended thinking (Claude 3.7+, Claude 4)
      if (chunk.type === 'reasoning' && chunk.text) {
        fullReasoning += chunk.text;
        yield {
          done: false,
          type: 'reasoning',
          reasoningText: chunk.text,
        };
      }
      
      if (chunk.type === 'usage') {
        totalUsage = chunk.usage;
      }
    }
    
    console.log(`[anthropic_stream] Stream ended after ${chunkCount} chunks, text=${fullText.length}ch, reasoning=${fullReasoning.length}ch`);
    
    // T42-1: 记录streaming metrics
    try {
      recordStreamCompletion({
        provider: 'anthropic',
        model,
        chunkCount,
        textLength: fullText.length,
        truncationSuspected: false,
      });
    } catch (metricsErr) {
      console.warn('[anthropic_stream] Failed to record metrics:', metricsErr.message);
    }
    
    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'anthropic',
      model,
      usage: totalUsage,
      promptTokens: totalUsage?.promptTokens ?? promptTokensEstimate,
      cacheApplied,
    });

    // 发送最终结果
    yield {
      done: true,
      type: 'usage',
      fullText,
      fullReasoning: fullReasoning || undefined,
      usage: totalUsage,
    };
    
  } catch (err) {
    const error = mapError(err, isByok);
    yield { done: true, type: 'error', error };
  } finally {
    clearTimeout(idleTimeout);
  }
}

/**
 * 解析 Anthropic 流式响应
 * 使用 SSE 格式
 * 
 * @param {Response} response
 * @param {Function} [resetIdleTimeout] - 可选的 idle timeout 重置函数
 */
async function* parseAnthropicStream(response, resetIdleTimeout) {
  if (!response?.body) {
    console.warn(`[anthropic_stream] No response body`);
    return;
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = null;
  let outputTokens = null;
  // Track current content block type for extended thinking
  let currentBlockType = null;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 每次从网络读取数据时重置 idle timeout
      if (resetIdleTimeout) {
        resetIdleTimeout();
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      // 按行解析 SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      let currentEvent = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }
        
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;
          
          try {
            const data = JSON.parse(dataStr);
            
            // 处理 message_start - 获取 input_tokens
            if (data.type === 'message_start' && data.message?.usage?.input_tokens) {
              inputTokens = data.message.usage.input_tokens;
            }

            // 处理 content_block_start - track block type (text or thinking)
            if (data.type === 'content_block_start' && data.content_block) {
              currentBlockType = data.content_block.type; // 'text' | 'thinking'
            }

            // 处理 content_block_stop
            if (data.type === 'content_block_stop') {
              currentBlockType = null;
            }
            
            // 处理 content_block_delta - 文本增量或思维链增量
            if (data.type === 'content_block_delta') {
              const delta = data.delta;
              // Standard text delta
              if (delta?.type === 'text_delta' && delta?.text) {
                yield { type: 'delta', text: delta.text };
              }
              // Extended thinking delta (Claude 3.7+, Claude 4)
              if (delta?.type === 'thinking_delta' && delta?.thinking) {
                yield { type: 'reasoning', text: delta.thinking };
              }
            }
            
            // 处理 message_delta - 获取 output_tokens
            if (data.type === 'message_delta' && data.usage?.output_tokens) {
              outputTokens = data.usage.output_tokens;
            }
            
            // 处理 message_stop - 发送 usage
            if (data.type === 'message_stop') {
              if (inputTokens || outputTokens) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: inputTokens,
                    completionTokens: outputTokens,
                    totalTokens: (inputTokens || 0) + (outputTokens || 0),
                    raw: { input_tokens: inputTokens, output_tokens: outputTokens },
                  },
                };
              }
            }
            
          } catch (parseErr) {
            // 忽略解析错误
            console.warn(`[anthropic_stream] Parse error:`, parseErr.message);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 构建请求端点
 */
function buildEndpoint(customBaseUrl, path) {
  const base = normalizeAnthropicBaseUrl(customBaseUrl || ANTHROPIC_API_BASE);
  return `${base.replace(/\/+$/, '')}${path}`;
}

function normalizeAnthropicBaseUrl(input) {
  if (!input) return ANTHROPIC_API_BASE;
  let base = String(input).trim();
  if (!base) return ANTHROPIC_API_BASE;

  // Strip trailing slashes
  base = base.replace(/\/+$/, '');

  // If a full endpoint was saved, normalize to API root.
  base = base.replace(/\/v1\/messages$/i, '/v1');
  base = base.replace(/\/messages$/i, '');
  base = base.replace(/\/v1\/models$/i, '/v1');
  base = base.replace(/\/models$/i, '');

  // If user saved host-only (e.g. https://api.anthropic.com), append /v1.
  if (!/\/v1(\/|$)/i.test(base)) {
    base = `${base}/v1`;
  }

  return base;
}

/**
 * 构建请求头
 */
function buildHeaders(apiKey, { filesApiEnabled = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (filesApiEnabled) {
    headers['anthropic-beta'] = 'files-api-2025-04-14';
  }
  return headers;
}

function resolveContentBlockType(mimeType) {
  const normalized = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (normalized.startsWith('image/')) return 'image';
  return 'document';
}

/**
 * 处理所有消息中的附件（包括当前请求和历史记录）
 * 
 * Optimization: Uses provider_file_cache to avoid redundant uploads within TTL.
 */
async function processAllAttachments({
  apiKey,
  baseUrl,
  messages,
  currentAttachments,
  isByok,
}) {
  let filesApiEnabled = false;
  const processedMessages = [];

  // Collect all uploadIds that have an 'id' field (history attachments)
  const allAttachmentsWithIds = [];
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return i;
    }
    return Math.max(0, messages.length - 1);
  })();
  
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user' && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att.id) {
          allAttachmentsWithIds.push({ msgIdx: i, att });
        }
      }
    }
  }
  // Also include current request attachments if they have IDs
  if (Array.isArray(currentAttachments)) {
    for (const att of currentAttachments) {
      if (att.id) {
        allAttachmentsWithIds.push({ msgIdx: lastUserIdx, att, isCurrent: true });
      }
    }
  }

  // Batch lookup cached file IDs
  const uploadIdsToCheck = allAttachmentsWithIds.filter(x => x.att.id).map(x => x.att.id);
  let cacheMap = new Map();
  if (uploadIdsToCheck.length > 0) {
    try {
      cacheMap = await getCachedProviderFiles(uploadIdsToCheck, 'anthropic');
    } catch (err) {
      console.warn('[anthropic] Failed to check file cache:', err.message);
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastUserMessage = i === lastUserIdx;
    const attachments = isLastUserMessage
      ? currentAttachments || msg.attachments
      : msg.attachments;

    if (Array.isArray(attachments) && attachments.length > 0) {
      filesApiEnabled = true;

      try {
        const fileBlocks = await Promise.all(
          attachments.map(async (att) => {
            // Check cache first
            if (att.id && cacheMap.has(att.id)) {
              const cached = cacheMap.get(att.id);
              console.log(`[anthropic] Using cached file_id for upload ${att.id}`);
              return {
                type: resolveContentBlockType(cached.mime_type || att.mimeType),
                source: {
                  type: 'file',
                  file_id: cached.provider_file_id,
                },
              };
            }
            
            // Upload and cache
            const upload = await uploadAnthropicFile({
              apiKey,
              baseUrl,
              fileName: att.fileName,
              mimeType: att.mimeType,
              buffer: att.contentBytes,
            });
            
            // Cache the result if we have an uploadId
            if (att.id) {
              try {
                await cacheProviderFile({
                  uploadId: att.id,
                  provider: 'anthropic',
                  providerFileId: upload.fileId,
                  mimeType: att.mimeType,
                });
              } catch (cacheErr) {
                console.warn('[anthropic] Failed to cache file_id:', cacheErr.message);
              }
            }
            
            return {
              type: resolveContentBlockType(att.mimeType),
              source: {
                type: 'file',
                file_id: upload.fileId,
              },
            };
          })
        );

        // 将附件块添加到消息内容中
        const content = typeof msg.content === 'string'
          ? [{ type: 'text', text: msg.content }, ...fileBlocks]
          : Array.isArray(msg.content)
            ? [...msg.content, ...fileBlocks]
            : [...fileBlocks];

        processedMessages.push({ ...msg, content });
      } catch (uploadErr) {
        throw createLLMError({
          code: LLM_ERROR_CODES.FILE_UPLOAD_FAILED,
          provider: 'anthropic',
          httpStatus: 400,
          message: uploadErr?.message || 'Failed to upload file to Anthropic',
          raw: uploadErr,
          isByok,
        });
      }
    } else {
      processedMessages.push(msg);
    }
  }

  return { messages: processedMessages, filesApiEnabled };
}

async function uploadAnthropicFile({ apiKey, baseUrl, fileName, mimeType, buffer }) {
  const endpoint = buildEndpoint(baseUrl, '/files');
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, fileName || 'upload');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': 'files-api-2025-04-14',
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Anthropic file upload failed (${response.status})`);
  }
  const fileId = payload?.id || payload?.file?.id;
  if (!fileId) {
    throw new Error('Anthropic file id missing');
  }
  return { fileId };
}

/**
 * 构建请求体
 * 
 * Anthropic Messages API 格式:
 * {
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: [
 *     { role: "user", content: "Hello" }
 *   ]
 * }
 */
function buildRequestBody({ model, messages, maxTokens, temperature, stream, cacheEnabled }) {
  // 转换消息格式 - Anthropic 不支持 system 作为 message role
  // system 消息需要单独作为 system 参数
  let systemMessage = null;
  const anthropicMessages = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      // 合并所有 system 消息
      systemMessage = systemMessage 
        ? `${systemMessage}\n\n${msg.content}` 
        : msg.content;
    } else {
      const content = Array.isArray(msg.content)
        ? msg.content
        : typeof msg.content === 'string'
          ? msg.content
          : '';
      anthropicMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content,
      });
    }
  }
  
  // Determine if extended thinking should be enabled for this model
  // Only Claude 4.x models are whitelisted; all support thinking.
  const modelLower = typeof model === 'string' ? model.toLowerCase() : '';
  const supportsThinking = modelLower.includes('claude-opus-4') ||
    modelLower.includes('claude-sonnet-4') ||
    modelLower.includes('claude-haiku-4');

  // Claude Opus 4.6+ uses adaptive thinking (manual "enabled" is deprecated)
  const useAdaptiveThinking = modelLower.includes('claude-opus-4-6') ||
    modelLower.includes('claude-opus-4-7') ||
    modelLower.includes('claude-opus-5');

  const body = {
    model,
    max_tokens: maxTokens || 8192,
    messages: anthropicMessages,
  };

  // Enable extended thinking for supported models
  if (supportsThinking) {
    if (useAdaptiveThinking) {
      // Opus 4.6+: adaptive thinking — model decides when and how much to think
      body.thinking = { type: 'adaptive' };
    } else {
      // Claude 3.7 / 4 / Sonnet 4 / Haiku 4.5: classic budget-based thinking
      body.thinking = { type: 'enabled', budget_tokens: Math.min(body.max_tokens, 10000) };
    }
    // When thinking is enabled, temperature must be 1 per Anthropic API rules
    // and max_tokens must cover both thinking + output
    body.max_tokens = Math.max(body.max_tokens, 16000);
  }

  let cacheApplied = false;
  if (systemMessage) {
    const payload = buildAnthropicSystemPayload(systemMessage, cacheEnabled);
    body.system = payload.system;
    cacheApplied = payload.cacheApplied;
  }
  
  if (!supportsThinking && typeof temperature === 'number' && temperature >= 0 && temperature <= 1) {
    body.temperature = temperature;
  }
  
  if (stream) {
    body.stream = true;
  }
  
  return { body, cacheApplied };
}

/**
 * 从响应中提取文本
 */
function extractTextFromResponse(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) return '';
  
  // 合并所有 text 类型的 content block
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
}

/**
 * 从响应中提取思维链（extended thinking）
 */
function extractThinkingFromResponse(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) return null;
  
  const thinking = content
    .filter(block => block.type === 'thinking')
    .map(block => block.thinking)
    .join('')
    .trim();
  return thinking || null;
}

/**
 * 映射 usage 数据
 */
function mapUsage(usage) {
  if (!usage) return null;
  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    cachedTokens:
      usage?.cache_read_input_tokens ??
      usage?.cache_read_tokens ??
      null,
    raw: usage,
  };
}

/**
 * 映射 HTTP 错误
 */
function mapHttpError(status, payload, isByok) {
  const errorType = payload?.error?.type || 'unknown';
  const errorMessage = payload?.error?.message || `HTTP ${status}`;
  
  // 401 - Invalid API Key
  if (status === 401) {
    return createLLMError({
      code: isByok ? LLM_ERROR_CODES.BYOK_INVALID_KEY : LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'anthropic',
      httpStatus: status,
      message: isByok 
        ? 'Your Claude API key is invalid. Please check your settings.' 
        : 'Anthropic API key is invalid.',
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // 403 - Permission denied / suspended
  if (status === 403) {
    return createLLMError({
      code: isByok ? LLM_ERROR_CODES.BYOK_KEY_SUSPENDED : LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'anthropic',
      httpStatus: status,
      message: isByok
        ? 'Your Claude API key has been suspended or lacks permission.'
        : 'Anthropic API permission denied.',
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // 429 - Rate limited or insufficient credits
  if (status === 429) {
    const isQuota = errorType === 'insufficient_quota' || 
                    errorMessage.toLowerCase().includes('credit') ||
                    errorMessage.toLowerCase().includes('quota');
    return createLLMError({
      code: isQuota 
        ? (isByok ? LLM_ERROR_CODES.BYOK_INSUFFICIENT_QUOTA : LLM_ERROR_CODES.PROVIDER_RATE_LIMITED)
        : LLM_ERROR_CODES.PROVIDER_RATE_LIMITED,
      provider: 'anthropic',
      httpStatus: status,
      message: isQuota
        ? (isByok ? 'Your Claude API credits are exhausted.' : 'Anthropic API quota exceeded.')
        : 'Claude API rate limited. Please try again later.',
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // 404 - Model not found
  if (status === 404 || errorType === 'not_found_error') {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_MODEL_NOT_FOUND,
      provider: 'anthropic',
      httpStatus: status,
      message: isByok 
        ? `Claude model not found: ${errorMessage}. This may be due to API key access restrictions. Try selecting a different model (e.g., Claude Sonnet 4 or Claude 3.5 Haiku).`
        : `Claude model not found: ${errorMessage}`,
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // 400 - Bad request (content filtered, etc.)
  if (status === 400) {
    const isContentFiltered = errorType === 'invalid_request_error' &&
      (errorMessage.toLowerCase().includes('content') || 
       errorMessage.toLowerCase().includes('safety'));
    
    return createLLMError({
      code: isContentFiltered 
        ? LLM_ERROR_CODES.PROVIDER_CONTENT_FILTERED 
        : LLM_ERROR_CODES.INVALID_REQUEST,
      provider: 'anthropic',
      httpStatus: status,
      message: isContentFiltered
        ? 'Your message was filtered by Claude\'s safety system.'
        : `Invalid request: ${errorMessage}`,
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // 5xx - Server errors
  if (status >= 500) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'anthropic',
      httpStatus: status,
      message: `Anthropic API server error: ${errorMessage}`,
      raw: JSON.stringify(payload),
      isByok,
    });
  }
  
  // Default
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'anthropic',
    httpStatus: status,
    message: errorMessage,
    raw: JSON.stringify(payload),
    isByok,
  });
}

/**
 * 映射异常错误
 */
function mapError(err, isByok) {
  if (err.name === 'AbortError') {
    return createLLMError({
      code: LLM_ERROR_CODES.TIMEOUT,
      provider: 'anthropic',
      message: 'Request timed out or was cancelled',
      isByok,
    });
  }
  
  // Network errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'anthropic',
      message: 'Unable to connect to Anthropic API',
      isByok,
    });
  }
  
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'anthropic',
    message: err.message || 'Unknown error',
    isByok,
  });
}

/**
 * 合并多个 AbortSignal
 */
function mergeSignals(signal1, signal2) {
  if (!signal1) return signal2;
  if (!signal2) return signal1;
  
  const controller = new AbortController();
  
  const abort = () => controller.abort();
  
  signal1.addEventListener('abort', abort);
  signal2.addEventListener('abort', abort);
  
  if (signal1.aborted || signal2.aborted) {
    controller.abort();
  }
  
  return controller.signal;
}

export default anthropicDriver;
