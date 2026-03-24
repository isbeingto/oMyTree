/**
 * T32-0: OpenAI Native Driver
 * 
 * 封装官方 OpenAI API 的调用逻辑
 * 支持流式和非流式请求
 */

import {
  LLM_ERROR_CODES,
  createLLMError,
  createLLMResponse,
  createLLMErrorResponse,
} from '../types.js';
import { recordStreamCompletion } from '../streaming_metrics.js';
import {
  estimatePromptTokensFromMessages,
  isPromptCachingEnabled,
  recordPromptCacheMetrics,
} from '../prompt_cache.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes (matches typical official SDK defaults)

function normalizeOpenAIBaseUrl(baseUrl) {
  const fallback = OPENAI_API_BASE;
  const raw = (typeof baseUrl === 'string' && baseUrl.trim()) ? baseUrl.trim() : fallback;
  let base = raw.replace(/\/+$/, '');

  // If user/admin accidentally saved the full endpoint, normalize to API root.
  // e.g. https://api.openai.com/v1/chat/completions -> https://api.openai.com/v1
  // e.g. https://api.deepseek.com/v1/chat/completions -> https://api.deepseek.com/v1
  base = base.replace(/\/chat\/completions$/i, '');
  base = base.replace(/\/responses$/i, '');

  // Ensure official OpenAI/DeepSeek roots include /v1 when a bare host is provided.
  try {
    const url = new URL(base);
    const host = url.hostname;
    const path = (url.pathname || '').replace(/\/+$/, '');
    if ((host === 'api.openai.com' || host === 'api.deepseek.com') && !path.includes('/v1')) {
      url.pathname = `${path}/v1`;
      base = url.toString().replace(/\/+$/, '');
    }
  } catch {
    // ignore invalid URLs; downstream fetch will surface a better error
  }

  return base;
}

/**
 * OpenAI Native Driver
 * 
 * @param {import('../types.js').LLMRequest} request
 * @returns {Promise<import('../types.js').LLMResponse> | AsyncGenerator<import('../types.js').LLMChunk>}
 */
export async function openaiNativeDriver(request) {
  if (request.stream) {
    return streamOpenAI(request);
  }
  return callOpenAI(request);
}

/**
 * 非流式调用 OpenAI
 */
async function callOpenAI(request) {
  if (Array.isArray(request.attachments) && request.attachments.length > 0) {
    return callOpenAIResponses(request);
  }
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'openai',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/chat/completions');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = mergeSignals(signal, controller.signal);
  
  try {
    const body = buildRequestBody({ baseUrl, model, messages, temperature, stream: false });
    
    if (traceId) {
      console.log(`[openai_native] Request traceId=${traceId} model=${model} endpoint=${endpoint}`);
    }
    
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: mergedSignal,
    });
    
    let payload = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const error = mapHttpError(response.status, payload, isByok);
      console.error(`[openai_native] Error: status=${response.status}`, error.message);
      return createLLMErrorResponse(error);
    }
    
    const text = payload?.choices?.[0]?.message?.content?.trim() || '';
    const usage = mapUsage(payload?.usage);

    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'openai',
      model: payload?.model || model,
      usage,
      promptTokens: usage?.promptTokens ?? promptTokensEstimate,
      cacheApplied: cacheEnabled,
    });
    
    return createLLMResponse({
      text,
      usage,
      model: payload?.model || model,
      provider: 'openai',
      isByok,
    });
    
  } catch (err) {
    const error = mapError(err, isByok);
    console.error(`[openai_native] Exception:`, err.message);
    return createLLMErrorResponse(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 流式调用 OpenAI
 * 返回 AsyncGenerator<LLMChunk>
 */
async function* streamOpenAI(request) {
  if (Array.isArray(request.attachments) && request.attachments.length > 0) {
    yield* streamOpenAIResponses(request);
    return;
  }
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'openai',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/chat/completions');

  const baseLower = typeof baseUrl === 'string' ? baseUrl.toLowerCase() : '';
  const modelLower = typeof model === 'string' ? model.toLowerCase() : '';
  const isDeepSeekReasoningStream = baseLower.includes('deepseek.com') && modelLower.includes('reasoner');
  
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
    const body = buildRequestBody({ baseUrl, model, messages, temperature, stream: true });
    
    if (traceId) {
      console.log(`[openai_native_stream] Request traceId=${traceId} model=${model}`);
    }
    
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
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
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let fullReasoning = '';
    let totalUsage = null;
    let sawDoneEvent = false;
    let chunkCount = 0;  // T42-1: 统计chunk数量

    // DeepSeek 观测：不输出内容，只记录是否看到了 reasoning_content 以及首个 token 类型
    let deepseekFirstTokenType = null; // 'reasoning' | 'content'
    let deepseekReasoningDeltaCount = 0;
    let deepseekContentDeltaCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 每次收到数据就重置 idle timeout
      resetIdleTimeout();
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine === 'data: [DONE]') {
          console.log('[openai_native_stream] Received data: [DONE] signal');
          sawDoneEvent = true;
          break;
        }
        if (!trimmedLine.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(trimmedLine.slice(6));
          const choice = data?.choices?.[0];
          const delta = choice?.delta;
          const content = delta?.content;
          // DeepSeek/部分 OpenAI 兼容网关可能使用不同字段名承载“思考过程”
          // - deepseek-reasoner: delta.reasoning_content
          // - some gateways: delta.reasoning / delta.thinking / delta.thought
          const reasoningContent =
            (typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : null) ??
            (typeof delta?.reasoning === 'string' ? delta.reasoning : null) ??
            (typeof delta?.thinking === 'string' ? delta.thinking : null) ??
            (typeof delta?.thought === 'string' ? delta.thought : null);

          if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
            if (isDeepSeekReasoningStream) {
              deepseekReasoningDeltaCount++;
              if (!deepseekFirstTokenType) deepseekFirstTokenType = 'reasoning';
            }
            fullReasoning += reasoningContent;
            chunkCount++;
            yield {
              done: false,
              type: 'reasoning',
              reasoningText: reasoningContent,
            };
          }
          
          if (typeof content === 'string' && content.length > 0) {
            if (isDeepSeekReasoningStream) {
              deepseekContentDeltaCount++;
              if (!deepseekFirstTokenType) deepseekFirstTokenType = 'content';
            }
            fullText += content;
            chunkCount++;  // T42-1: 增加chunk计数
            yield {
              done: false,
              type: 'delta',
              deltaText: content,
            };
          }
          
          // 捕获 usage 信息 (stream_options 开启时)
          if (data?.usage) {
            totalUsage = mapUsage(data.usage);
          }
          
          // 部分兼容提供 finish_reason 的厂商（如 DeepSeek），收到结束信号后主动收尾
          if (choice?.finish_reason) {
            console.log(`[openai_native_stream] Received finish_reason: ${choice.finish_reason}`);
            sawDoneEvent = true;
            break;
          }
        } catch (parseErr) {
          // 忽略解析错误
        }
      }
      
      // 避免部分厂商在发送 [DONE]/finish_reason 后保持长连接导致流永不结束
      if (sawDoneEvent) {
        try {
          await reader.cancel();
        } catch (cancelErr) {
          // ignore cancellation errors
        }
        break;
      }
    }
    
    // T42-1: 记录streaming metrics
    try {
      recordStreamCompletion({
        provider: 'openai',
        model,
        chunkCount,
        textLength: fullText.length,
        truncationSuspected: false,  // OpenAI driver没有remaining buffer问题
      });
    } catch (metricsErr) {
      console.warn('[openai_native_stream] Failed to record metrics:', metricsErr.message);
    }
    
    // 发送最终结果
    console.log(
      `[openai_native_stream] Stream complete. sawDoneEvent=${sawDoneEvent}, fullReasoning.length=${fullReasoning.length}, fullText.length=${fullText.length}`
    );
    if (isDeepSeekReasoningStream) {
      console.log(
        `[openai_native_stream][deepseek] firstToken=${deepseekFirstTokenType || 'none'} reasoningDeltas=${deepseekReasoningDeltaCount} contentDeltas=${deepseekContentDeltaCount} fullReasoning.length=${fullReasoning.length} fullText.length=${fullText.length}`
      );
    }
    const mappedUsage = totalUsage ? mapUsage(totalUsage) : null;

    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'openai',
      model,
      usage: mappedUsage,
      promptTokens: mappedUsage?.promptTokens ?? promptTokensEstimate,
      cacheApplied: cacheEnabled,
    });

    yield {
      done: true,
      type: 'usage',
      fullText,
      fullReasoning,
      usage: mappedUsage,
    };
    
  } catch (err) {
    const error = mapError(err, isByok);
    yield { done: true, type: 'error', error };
  } finally {
    clearTimeout(idleTimeout);
  }
}

async function callOpenAIResponses(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'openai',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/responses');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = mergeSignals(signal, controller.signal);

  try {
    let fileBlocks = [];
    try {
      fileBlocks = await Promise.all(
        (request.attachments || []).map(async (att) => {
          const upload = await uploadOpenAIFile({
            apiKey,
            baseUrl,
            fileName: att.fileName,
            mimeType: att.mimeType,
            buffer: att.contentBytes,
          });
          // T-FIX-UPLOAD: file_id and filename are mutually exclusive in OpenAI Responses API.
          // When we have a file_id from a successful upload, do NOT include filename.
          return {
            type: 'input_file',
            file_id: upload.fileId,
          };
        })
      );
    } catch (uploadErr) {
      const error = createLLMError({
        code: LLM_ERROR_CODES.FILE_UPLOAD_FAILED,
        provider: 'openai',
        httpStatus: 400,
        message: uploadErr?.message || 'Failed to upload file to OpenAI',
        raw: uploadErr,
        isByok,
      });
      return createLLMErrorResponse(error);
    }

    const input = buildResponsesInput(messages, fileBlocks);
    const body = {
      model,
      input,
    };
    if (typeof temperature === 'number') {
      body.temperature = temperature;
    }

    if (traceId) {
      console.log(`[openai_responses] Request traceId=${traceId} model=${model} endpoint=${endpoint}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: mergedSignal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = mapHttpError(response.status, payload, isByok);
      console.error(`[openai_responses] Error: status=${response.status}`, error.message);
      return createLLMErrorResponse(error);
    }

    const text = typeof payload?.output_text === 'string'
      ? payload.output_text.trim()
      : extractTextFromResponses(payload);
    const usage = mapResponsesUsage(payload?.usage);

    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'openai',
      model: payload?.model || model,
      usage,
      promptTokens: usage?.promptTokens ?? promptTokensEstimate,
      cacheApplied: cacheEnabled,
    });

    return createLLMResponse({
      text,
      usage,
      model: payload?.model || model,
      provider: 'openai',
      isByok,
    });
  } catch (err) {
    const error = mapError(err, isByok);
    console.error(`[openai_responses] Exception:`, err.message);
    return createLLMErrorResponse(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function* streamOpenAIResponses(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;

  const promptTokensEstimate = estimatePromptTokensFromMessages(messages);
  const cacheEnabled = isPromptCachingEnabled({
    providerKind: request.providerKind,
    providerName: 'openai',
    promptTokens: promptTokensEstimate,
  });

  const isByok = request.providerSource === 'byok';
  const endpoint = buildEndpoint(baseUrl, '/responses');

  const controller = new AbortController();
  let idleTimeout = setTimeout(() => controller.abort(), timeoutMs);
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => controller.abort(), timeoutMs);
  };
  const mergedSignal = mergeSignals(signal, controller.signal);

  try {
    let fileBlocks = [];
    try {
      fileBlocks = await Promise.all(
        (request.attachments || []).map(async (att) => {
          const upload = await uploadOpenAIFile({
            apiKey,
            baseUrl,
            fileName: att.fileName,
            mimeType: att.mimeType,
            buffer: att.contentBytes,
          });
          // T-FIX-UPLOAD: file_id and filename are mutually exclusive in OpenAI Responses API.
          // When we have a file_id from a successful upload, do NOT include filename.
          return {
            type: 'input_file',
            file_id: upload.fileId,
          };
        })
      );
    } catch (uploadErr) {
      const error = createLLMError({
        code: LLM_ERROR_CODES.FILE_UPLOAD_FAILED,
        provider: 'openai',
        httpStatus: 400,
        message: uploadErr?.message || 'Failed to upload file to OpenAI',
        raw: uploadErr,
        isByok,
      });
      yield { done: true, type: 'error', error };
      return;
    }

    const input = buildResponsesInput(messages, fileBlocks);
    const body = {
      model,
      input,
      stream: true,
    };
    if (typeof temperature === 'number') {
      body.temperature = temperature;
    }

    if (traceId) {
      console.log(`[openai_responses_stream] Request traceId=${traceId} model=${model}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: mergedSignal,
    });

    resetIdleTimeout();

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = mapHttpError(response.status, payload, isByok);
      yield { done: true, type: 'error', error };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let fullReasoning = '';
    let totalUsage = null;
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimeout();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;
        try {
          const event = JSON.parse(dataStr);
          const type = event?.type;

          if (type === 'response.output_text.delta') {
            const delta = event?.delta || '';
            if (delta) {
              fullText += delta;
              chunkCount++;
              yield { done: false, type: 'delta', deltaText: delta };
            }
          }

          if (type === 'response.reasoning_text.delta') {
            const delta = event?.delta || '';
            if (delta) {
              fullReasoning += delta;
              chunkCount++;
              yield { done: false, type: 'reasoning', reasoningText: delta };
            }
          }

          if (type === 'response.completed') {
            const responseObj = event?.response || event;
            if (responseObj?.usage) {
              totalUsage = mapResponsesUsage(responseObj.usage);
            }
          }

          if (type === 'response.failed') {
            const error = createLLMError({
              code: LLM_ERROR_CODES.INTERNAL_ERROR,
              provider: 'openai',
              httpStatus: 500,
              message: event?.error?.message || 'OpenAI response failed',
              raw: event,
              isByok,
            });
            yield { done: true, type: 'error', error };
            return;
          }
        } catch (parseErr) {
          // ignore parse errors
        }
      }
    }

    try {
      recordStreamCompletion({
        provider: 'openai',
        model,
        chunkCount,
        textLength: fullText.length,
        truncationSuspected: false,
      });
    } catch (metricsErr) {
      console.warn('[openai_responses_stream] Failed to record metrics:', metricsErr.message);
    }

    recordPromptCacheMetrics({
      providerKind: request.providerKind,
      providerName: 'openai',
      model,
      usage: totalUsage,
      promptTokens: totalUsage?.promptTokens ?? promptTokensEstimate,
      cacheApplied: cacheEnabled,
    });

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

function extractTextFromResponses(payload) {
  const output = payload?.output;
  if (!Array.isArray(output)) return '';
  return output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((block) => block?.type === 'output_text' && typeof block?.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * 构建请求 endpoint
 */
function buildEndpoint(baseUrl, path) {
  const base = normalizeOpenAIBaseUrl(baseUrl);
  return `${base}${path}`;
}

/**
 * 构建请求头
 */
function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

async function uploadOpenAIFile({ apiKey, baseUrl, fileName, mimeType, buffer }) {
  const endpoint = buildEndpoint(baseUrl, '/files');
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('purpose', 'assistants');
  form.append('file', blob, fileName || 'upload');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI file upload failed (${response.status})`);
  }

  const fileId = payload?.id;
  if (!fileId) {
    throw new Error('OpenAI file id missing');
  }
  return { fileId };
}

function buildResponsesInput(messages, fileBlocks) {
  const normalized = messages.map((m) => {
    const role = m.role || 'user';
    const content = Array.isArray(m.content) ? m.content : (typeof m.content === 'string' ? m.content : '');
    return { role, content };
  });

  if (Array.isArray(fileBlocks) && fileBlocks.length > 0) {
    let idx = -1;
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      if (normalized[i]?.role === 'user') {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      normalized.push({ role: 'user', content: [...fileBlocks] });
      return normalized;
    }
    const target = { ...normalized[idx] };
    if (Array.isArray(target.content)) {
      target.content = [...target.content, ...fileBlocks];
    } else {
      const text = typeof target.content === 'string' ? target.content : '';
      target.content = [{ type: 'input_text', text }, ...fileBlocks];
    }
    normalized[idx] = target;
  }

  return normalized;
}

function mapResponsesUsage(usage) {
  if (!usage) return null;
  return {
    promptTokens: usage.input_tokens ?? null,
    completionTokens: usage.output_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedTokens:
      usage?.input_tokens_details?.cached_tokens ??
      usage?.prompt_tokens_details?.cached_tokens ??
      usage?.cached_tokens ??
      null,
    raw: usage,
  };
}

/**
 * 构建请求体
 */
function buildRequestBody({ baseUrl, model, messages, temperature, stream }) {
  const body = {
    model,
    messages: normalizeMessages(messages),
    stream,
  };
  
  if (typeof temperature === 'number') {
    body.temperature = temperature;
  }
  
  // 开启 stream_options 以获取 usage。
  // 注意：部分 OpenAI 兼容厂商/网关（尤其 DeepSeek reasoner）在启用 include_usage 后，
  // 可能导致 reasoning_content 不再按 delta 提前输出，而是在结束时一次性出现。
  // 为了实现“先思考、后回答”的流式体验，这里对 DeepSeek reasoner 默认关闭 include_usage。
  if (stream && shouldIncludeUsageStreamOptions(baseUrl, model)) {
    body.stream_options = { include_usage: true };
  }
  
  return body;
}

function shouldIncludeUsageStreamOptions(baseUrl, model) {
  const base = typeof baseUrl === 'string' ? baseUrl.toLowerCase() : '';
  const m = typeof model === 'string' ? model.toLowerCase() : '';
  const isDeepSeek = base.includes('deepseek.com');
  const isReasoner = m.includes('reasoner');
  if (isDeepSeek && isReasoner) return false;
  return true;
}

/**
 * 标准化消息格式
 */
function normalizeMessages(messages) {
  return messages.map((m) => ({
    role: m.role || 'user',
    content: m.content || '',
  }));
}

/**
 * 映射 usage 数据
 */
function mapUsage(usage) {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedTokens:
      usage?.prompt_tokens_details?.cached_tokens ??
      usage?.input_tokens_details?.cached_tokens ??
      usage?.cached_tokens ??
      null,
    raw: usage,
  };
}

/**
 * 合并多个 AbortSignal
 */
function mergeSignals(...signals) {
  const valid = signals.filter((sig) => sig instanceof AbortSignal);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  
  const controller = new AbortController();
  const abort = (reason) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };
  
  for (const sig of valid) {
    if (!sig) continue;
    if (sig.aborted) {
      abort(sig.reason);
      break;
    }
    sig.addEventListener('abort', () => abort(sig.reason), { once: true });
  }
  
  return controller.signal;
}

/**
 * 映射 HTTP 错误到 LLMError
 */
function mapHttpError(status, payload, isByok) {
  const message = payload?.error?.message || payload?.message || '';
  const lowerMsg = message.toLowerCase();
  const errorType = payload?.error?.type || '';
  const errorCode = payload?.error?.code || '';
  
  // 认证错误
  if (status === 401 || status === 403 || 
      lowerMsg.includes('invalid api key') || 
      lowerMsg.includes('unauthorized') ||
      lowerMsg.includes('incorrect api key') ||
      lowerMsg.includes('invalid token')) {
    return createLLMError({
      code: isByok ? LLM_ERROR_CODES.BYOK_INVALID_KEY : LLM_ERROR_CODES.INVALID_REQUEST,
      provider: 'openai',
      httpStatus: status,
      message: isByok ? undefined : message,
      raw: payload,
      isByok,
    });
  }
  
  // 额度不足
  if (status === 402 || 
      lowerMsg.includes('insufficient_quota') || 
      lowerMsg.includes('insufficient funds') ||
      lowerMsg.includes('billing')) {
    return createLLMError({
      code: LLM_ERROR_CODES.BYOK_INSUFFICIENT_QUOTA,
      provider: 'openai',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 速率限制
  if (status === 429 || lowerMsg.includes('rate limit')) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_RATE_LIMITED,
      provider: 'openai',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 模型不存在
  if (status === 404 || errorCode === 'model_not_found') {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_MODEL_NOT_FOUND,
      provider: 'openai',
      httpStatus: status,
      message,
      raw: payload,
      isByok,
    });
  }
  
  // 内容过滤
  if (errorType === 'content_filter' || lowerMsg.includes('content policy')) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_CONTENT_FILTERED,
      provider: 'openai',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 默认错误
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'openai',
    httpStatus: status,
    message,
    raw: payload,
    isByok,
  });
}

/**
 * 映射一般异常到 LLMError
 */
function mapError(err, isByok) {
  // 超时
  if (err.name === 'AbortError') {
    return createLLMError({
      code: LLM_ERROR_CODES.TIMEOUT,
      provider: 'openai',
      message: err.message,
      isByok,
    });
  }
  
  // 网络错误
  const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH']);
  if (networkCodes.has(err.code)) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'openai',
      message: err.message,
      isByok,
    });
  }
  
  // 默认
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'openai',
    message: err.message,
    isByok,
  });
}

export default openaiNativeDriver;
