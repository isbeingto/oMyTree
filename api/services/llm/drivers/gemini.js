/**
 * T32-0: Gemini Driver
 * 
 * 封装 Google Gemini API 的调用逻辑
 * 支持流式和非流式请求
 */

import {
  LLM_ERROR_CODES,
  createLLMError,
  createLLMResponse,
  createLLMErrorResponse,
} from '../types.js';
import { recordStreamCompletion } from '../streaming_metrics.js';
import { recordGeminiCacheUsage } from '../gemini_cache_metrics.js';
import { getCachedProviderFiles, cacheProviderFile } from '../../uploads/provider_file_cache.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes (matches typical official SDK defaults)

/**
 * Gemini Driver
 * 
 * @param {import('../types.js').LLMRequest} request
 * @returns {Promise<import('../types.js').LLMResponse> | AsyncGenerator<import('../types.js').LLMChunk>}
 */
export async function geminiDriver(request) {
  if (request.stream) {
    return streamGemini(request);
  }
  return callGemini(request);
}

/**
 * 非流式调用 Gemini
 */
async function callGemini(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    maxTokens,
    temperature,
    responseSchema,
    responseMimeType,
    enableGrounding,
    tools,
    toolChoice,
    functionResults,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;
  
  const isByok = request.providerSource === 'byok';
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = mergeSignals(signal, controller.signal);
  
  try {
    // T85-Native: Process attachments for ALL messages in history
    let effectiveMessages;
    try {
      effectiveMessages = await processAllAttachments({
        apiKey,
        baseUrl,
        messages,
        requestAttachments: request.attachments,
      });
    } catch (uploadErr) {
      const error = createLLMError({
        code: LLM_ERROR_CODES.FILE_UPLOAD_FAILED,
        provider: 'gemini',
        httpStatus: 400,
        message: uploadErr?.message || 'Failed to process file attachments for Gemini',
        raw: uploadErr,
        isByok,
      });
      return createLLMErrorResponse(error);
    }

    const endpoint = buildEndpoint(baseUrl, model, 'generateContent');
    const body = buildRequestBody({
      messages: effectiveMessages,
      model,
      maxTokens,
      temperature,
      responseSchema,
      responseMimeType,
      enableGrounding,
      tools,
      toolChoice,
      functionResults,
    });
    
    if (traceId) {
      console.log(`[gemini] Request traceId=${traceId} model=${model} endpoint=${endpoint}`);
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
      console.error(`[gemini] Error: status=${response.status}`, error.message);
      return createLLMErrorResponse(error);
    }
    
    const text = extractTextFromResponse(payload);
    const usage = mapUsage(payload?.usageMetadata);
    const groundingMetadata = extractGroundingMetadata(payload);
    const functionCalls = extractFunctionCalls(payload);
    const images = extractImagesFromResponse(payload);

    // Phase 4.1: record Gemini implicit caching metrics
    try {
      recordGeminiCacheUsage({ model, usage });
      if (usage?.cachedTokens && usage.cachedTokens > 0) {
        console.log(`[gemini] Cache hit: model=${model} cachedTokens=${usage.cachedTokens}`);
      }
    } catch (metricsErr) {
      console.warn('[gemini] Failed to record cache metrics:', metricsErr.message);
    }
    
    return createLLMResponse({
      text,
      usage,
      model,
      provider: 'gemini',
      isByok,
      groundingMetadata,
      functionCalls,
      images,
    });
    
  } catch (err) {
    const error = mapError(err, isByok);
    console.error(`[gemini] Exception:`, err.message);
    return createLLMErrorResponse(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 流式调用 Gemini
 * 返回 AsyncGenerator<LLMChunk>
 */
async function* streamGemini(request) {
  const {
    apiKey,
    baseUrl,
    model,
    messages,
    maxTokens,
    temperature,
    responseSchema,
    responseMimeType,
    enableGrounding,
    tools,
    toolChoice,
    functionResults,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    traceId,
  } = request;
  
  const isByok = request.providerSource === 'byok';
  
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
    // T85-Native: Process attachments for ALL messages in history
    let effectiveMessages;
    try {
      effectiveMessages = await processAllAttachments({
        apiKey,
        baseUrl,
        messages,
        requestAttachments: request.attachments,
      });
    } catch (uploadErr) {
      const error = createLLMError({
        code: LLM_ERROR_CODES.FILE_UPLOAD_FAILED,
        provider: 'gemini',
        httpStatus: 400,
        message: uploadErr?.message || 'Failed to process file attachments for Gemini',
        raw: uploadErr,
        isByok,
      });
      yield { done: true, type: 'error', error };
      return;
    }

    const endpoint = buildEndpoint(baseUrl, model, 'streamGenerateContent', true);
    const body = buildRequestBody({
      messages: effectiveMessages,
      model,
      maxTokens,
      temperature,
      responseSchema,
      responseMimeType,
      enableGrounding,
      tools,
      toolChoice,
      functionResults,
    });
    
    // 用于打字机效果的配置
    // Gemini 2.5 Thinking 模型倾向于一次性返回完整回答，需要在后端模拟逐字输出
    const typing = getTypingEffectConfigForModel(model);
    const CHUNK_SIZE = typing.chunkSize; // 每次输出的字符数
    const DELAY_MS = typing.delayMs;  // 每个 chunk 之间的延迟（毫秒）
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const response = await fetch(endpoint, {
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
    
    let fullText = '';
    let fullReasoning = '';
    let thoughtSignature = null;  // Gemini 3 thought signature for multi-turn
    /** @type {Array<{name: string, args: Object, thoughtSignature: (string|null)}>} */
    let functionCalls = [];
    let totalUsage = null;
    let groundingMetadata = null;  // Phase 4.3: Grounding metadata
    /** @type {Array<{ mimeType: string, dataBase64: string }>} */
    let images = [];
    let chunkCount = 0;  // T42-1: 统计chunk数量
    let truncationSuspected = false;  // T42-1: 检测截断嫌疑
    
    for await (const chunk of parseGeminiStream(response, resetIdleTimeout)) {
      // 每次收到数据重置 idle timeout
      resetIdleTimeout();

      if (chunk.type === 'reasoning' && chunk.text) {
        const reasoningText = chunk.text;
        fullReasoning += reasoningText;
        chunkCount++;

        // 不对 reasoning 施加额外延迟，避免“思维链”反向阻塞答案。
        // 但仍做小块切分，提升前端渲染刷新频率。
        for (let i = 0; i < reasoningText.length; i += CHUNK_SIZE) {
          const smallChunk = reasoningText.slice(i, i + CHUNK_SIZE);
          yield {
            done: false,
            type: 'reasoning',
            reasoningText: smallChunk,
          };
        }
      }
      
      if (chunk.type === 'delta' && chunk.text) {
        const text = chunk.text;
        fullText += text;
        chunkCount++;  // T42-1: 增加chunk计数
        
        // 将文本拆分成小块，每个块之间添加延迟来模拟打字机效果
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          const smallChunk = text.slice(i, i + CHUNK_SIZE);
          yield {
            done: false,
            type: 'delta',
            deltaText: smallChunk,
          };
          // 添加真正的异步延迟实现打字机效果
          if (i + CHUNK_SIZE < text.length) {
            await delay(DELAY_MS);
          }
        }
      }
      if (chunk.type === 'usage') {
        totalUsage = chunk.usage;
      }

      // Image model: capture inline image data (base64) if present
      if (chunk.type === 'image' && chunk.image) {
        images.push(chunk.image);
      }
      // Phase 5.3: Stream function calls
      if (chunk.type === 'function_call' && chunk.functionCall) {
        functionCalls.push(chunk.functionCall);
        yield {
          done: false,
          type: 'function_call',
          functionCalls: [chunk.functionCall],
        };
      }
      // Capture thought signature if present
      if (chunk.type === 'signature' && chunk.thoughtSignature) {
        thoughtSignature = chunk.thoughtSignature;
      }
      // Phase 4.3: Capture grounding metadata from final response
      if (chunk.type === 'grounding' && chunk.groundingMetadata) {
        groundingMetadata = chunk.groundingMetadata;
      }
      // T42-1: 检测remaining buffer警告
      if (chunk.type === 'warning' && chunk.warning === 'remaining_buffer_found') {
        truncationSuspected = true;
      }
    }
    
    // T42-1: 记录streaming metrics
    try {
      recordStreamCompletion({
        provider: 'gemini',
        model,
        chunkCount,
        textLength: fullText.length,
        truncationSuspected,
      });
    } catch (metricsErr) {
      console.warn('[gemini_stream] Failed to record metrics:', metricsErr.message);
    }
    
    // 发送最终结果
    // Phase 4.1: record Gemini implicit caching metrics
    try {
      recordGeminiCacheUsage({ model, usage: totalUsage });
      if (totalUsage?.cachedTokens && totalUsage.cachedTokens > 0) {
        console.log(`[gemini] Cache hit: model=${model} cachedTokens=${totalUsage.cachedTokens}`);
      }
    } catch (metricsErr) {
      console.warn('[gemini_stream] Failed to record cache metrics:', metricsErr.message);
    }

    const finalChunk = {
      done: true,
      type: 'usage',
      fullText,
      fullReasoning,
      thoughtSignature,
      usage: totalUsage,
    };

    if (Array.isArray(images) && images.length > 0) {
      finalChunk.images = images;
    }
    
    // Phase 4.3: Include grounding metadata if present (non-invasive)
    if (groundingMetadata && typeof groundingMetadata === 'object') {
      finalChunk.groundingMetadata = groundingMetadata;
    }

    // Phase 5.3: Include accumulated function calls if present (non-invasive)
    if (Array.isArray(functionCalls) && functionCalls.length > 0) {
      finalChunk.functionCalls = functionCalls;
    }
    
    yield finalChunk;
    
  } catch (err) {
    const error = mapError(err, isByok);
    yield { done: true, type: 'error', error };
  } finally {
    clearTimeout(idleTimeout);
  }
}

/**
 * 解析 Gemini 流式响应
 * 使用 alt=sse 参数后，Gemini 返回真正的 SSE 格式:
 * data: {...json...}
 * 
 * data: {...json...}
 * 
 * @param {Response} response - fetch 响应对象
 * @param {Function} [resetIdleTimeout] - 可选的 idle timeout 重置函数
 */
async function* parseGeminiStream(response, resetIdleTimeout) {
  if (!response?.body) {
    console.log(`[gemini_stream] No response body, falling back to text read`);
    // Fallback: 尝试读取完整响应
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const parts = item?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            // Gemini Thinking:
            // - Legacy shape: { thought: "..." }
            // - Gemini 3 includeThoughts shape: { text: "...", thought: true }
            if (typeof part?.thought === 'string' && part.thought.length > 0) {
              yield { type: 'reasoning', text: part.thought };
            } else if (part?.thought === true && typeof part?.text === 'string' && part.text.length > 0) {
              yield { type: 'reasoning', text: part.text };
            } else if (typeof part?.text === 'string' && part.text.length > 0) {
              yield { type: 'delta', text: part.text };
            }

            // Image output (Gemini image models): inline image data
            const inline = part?.inlineData || part?.inline_data;
            const inlineMimeType = inline?.mimeType || inline?.mime_type;
            const inlineData = inline?.data;
            if (typeof inlineMimeType === 'string' && typeof inlineData === 'string' && inlineData.length > 0) {
              yield {
                type: 'image',
                image: {
                  mimeType: inlineMimeType,
                  dataBase64: inlineData,
                },
              };
            }
            // Phase 5.3: Capture functionCall in fallback path
            if (part && typeof part.functionCall === 'object' && part.functionCall.name) {
              yield {
                type: 'function_call',
                functionCall: {
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                  thoughtSignature: part.thoughtSignature || part.thought_signature || null,
                },
              };
            }
            // Capture thoughtSignature in fallback path
            if (part?.thoughtSignature || part?.thought_signature) {
              yield { type: 'signature', thoughtSignature: part.thoughtSignature || part.thought_signature };
            }
          }
        } else {
          const textContent = extractTextFromResponse(item);
          if (textContent) {
            yield { type: 'delta', text: textContent };
          }
        }
        if (item?.usageMetadata) {
          yield { type: 'usage', usage: mapUsage(item.usageMetadata) };
        }

        // Phase 4.3: Extract grounding metadata in fallback path too
        const grounding = extractGroundingMetadata(item);
        if (grounding) {
          yield { type: 'grounding', groundingMetadata: grounding };
        }
      }
    } catch (err) {
      console.error(`[gemini_stream] Failed to parse response:`, err.message);
    }
    return;
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = response.body.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    
    // 每次从网络读取数据时重置 idle timeout
    if (resetIdleTimeout) {
      resetIdleTimeout();
    }
    
    const rawChunk = decoder.decode(value, { stream: true });
    
    buffer += rawChunk;
    
    // SSE 格式: data: {...}\n\n
    // 按行分割处理
    const lines = buffer.split('\n');
    // 保留最后一个可能不完整的行
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // 跳过空行
      
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim(); // 移除 "data:" 前缀
        if (!jsonStr) continue;
        
        try {
          const obj = JSON.parse(jsonStr);

          const parts = obj?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              // Gemini Thinking:
              // - Legacy shape: { thought: "..." }
              // - Gemini 3 includeThoughts shape: { text: "...", thought: true }
              if (typeof part?.thought === 'string' && part.thought.length > 0) {
                yield { type: 'reasoning', text: part.thought };
              } else if (part?.thought === true && typeof part?.text === 'string' && part.text.length > 0) {
                yield { type: 'reasoning', text: part.text };
              } else if (typeof part?.text === 'string' && part.text.length > 0) {
                yield { type: 'delta', text: part.text };
              }

              // Image output (Gemini image models): inline image data
              const inline = part?.inlineData || part?.inline_data;
              const inlineMimeType = inline?.mimeType || inline?.mime_type;
              const inlineData = inline?.data;
              if (typeof inlineMimeType === 'string' && typeof inlineData === 'string' && inlineData.length > 0) {
                yield {
                  type: 'image',
                  image: {
                    mimeType: inlineMimeType,
                    dataBase64: inlineData,
                  },
                };
              }
              // Phase 5.3: Capture functionCall in SSE path
              if (part && typeof part.functionCall === 'object' && part.functionCall.name) {
                yield {
                  type: 'function_call',
                  functionCall: {
                    name: part.functionCall.name,
                    args: part.functionCall.args || {},
                    thoughtSignature: part.thoughtSignature || part.thought_signature || null,
                  },
                };
              }
              // Capture thoughtSignature (usually in the last part with empty text)
              if (part?.thoughtSignature || part?.thought_signature) {
                yield { type: 'signature', thoughtSignature: part.thoughtSignature || part.thought_signature };
              }
            }
          } else {
            // 极少数情况下 parts 可能缺失，fallback 到旧逻辑
            const textContent = extractTextFromResponse(obj);
            if (textContent) {
              yield { type: 'delta', text: textContent };
            }
          }

          if (obj?.usageMetadata) {
            yield { type: 'usage', usage: mapUsage(obj.usageMetadata) };
          }
          
          // Phase 4.3: Extract grounding metadata from response
          const grounding = extractGroundingMetadata(obj);
          if (grounding) {
            yield { type: 'grounding', groundingMetadata: grounding };
          }
        } catch (err) {
          // JSON 解析失败，可能是不完整的数据
          // 将其放回 buffer 等待更多数据
          if (buffer) {
            buffer = trimmed + '\n' + buffer;
          } else {
            buffer = trimmed;
          }
        }
      }
    }
  }
  
  // 处理剩余的 buffer
  // 注意: 不在这里直接 yield,而是记录警告
  // 所有 delta 应该已经在主循环中被处理和累加
  if (buffer.trim()) {
    console.warn(`[gemini_stream] Remaining buffer at end: ${buffer.length} chars, content: ${buffer.substring(0, 100)}...`);
    // 尝试解析并记录,但不yield delta(避免丢失fullText累积)
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr) {
        try {
          const obj = JSON.parse(jsonStr);
          const textContent = extractTextFromResponse(obj);
          if (textContent) {
            console.warn(`[gemini_stream] WARNING: Found text in remaining buffer that was not yielded: "${textContent}"`);
            // T42-1: yield warning类型以便上层记录truncation_suspected
            yield { type: 'warning', warning: 'remaining_buffer_found', text: textContent };
          }
        } catch (err) {
          console.error(`[gemini_stream] Failed to parse remaining buffer:`, err.message);
        }
      }
    }
  }
}

/**
 * 从 buffer 中提取完整的 JSON 对象
 */
function extractJsonObjects(text) {
  const objects = [];
  let remaining = text;
  
  // 移除开头的 [ 和空白
  remaining = remaining.replace(/^\s*\[\s*/, '');
  
  while (remaining.length > 0) {
    // 跳过空白和逗号
    remaining = remaining.replace(/^[\s,]+/, '');
    if (!remaining || remaining === ']') break;
    
    // 查找完整的 JSON 对象
    let braceCount = 0;
    let objectStart = -1;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < remaining.length; i++) {
      const char = remaining[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') {
        if (braceCount === 0) {
          objectStart = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && objectStart >= 0) {
          const objectStr = remaining.slice(objectStart, i + 1);
          try {
            objects.push(JSON.parse(objectStr));
          } catch (err) {
            // 忽略解析错误
          }
          remaining = remaining.slice(i + 1);
          break;
        }
      }
    }
    
    // 如果没有找到完整对象，退出
    if (braceCount !== 0) {
      break;
    }
  }
  
  return { objects, remaining };
}

/**
 * 构建请求 endpoint
 */
function buildEndpoint(baseUrl, model, action, isStream = false) {
  const base = (baseUrl || GEMINI_API_BASE).replace(/\/+$/, '');
  // 流式请求需要添加 ?alt=sse 参数以获得真正的 SSE 格式
  const params = isStream ? '?alt=sse' : '';
  return `${base}/${model}:${action}${params}`;
}

/**
 * 构建请求头
 */
function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function resolveGeminiRoot(baseUrl) {
  const base = (baseUrl || GEMINI_API_BASE).replace(/\/+$/, '');
  return base.replace(/\/v1beta\/models\/?$/, '');
}

async function uploadGeminiFile({ apiKey, baseUrl, fileName, mimeType, buffer }) {
  const root = resolveGeminiRoot(baseUrl);
  const uploadInitEndpoint = `${root}/upload/v1beta/files`;
  const initResponse = await fetch(uploadInitEndpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': `${buffer.length}`,
      'X-Goog-Upload-Header-Content-Type': mimeType || 'application/octet-stream',
    },
    body: JSON.stringify({ file: { display_name: fileName || 'upload' } }),
  });

  if (!initResponse.ok) {
    const payload = await initResponse.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Gemini file init failed (${initResponse.status})`);
  }

  const uploadUrl = initResponse.headers.get('x-goog-upload-url') || initResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('Gemini upload URL missing');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': `${buffer.length}`,
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });

  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error(uploadPayload?.error?.message || `Gemini file upload failed (${uploadResponse.status})`);
  }

  const fileUri = uploadPayload?.file?.uri;
  if (!fileUri) {
    throw new Error('Gemini file URI missing');
  }
  return { fileUri, mimeType: uploadPayload?.file?.mime_type || mimeType };
}

function appendGeminiFileParts(messages, fileParts) {
  if (!Array.isArray(fileParts) || fileParts.length === 0) return messages;
  const cloned = messages.map((m) => ({ ...m }));
  let idx = -1;
  for (let i = cloned.length - 1; i >= 0; i -= 1) {
    if (cloned[i]?.role === 'user') {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    cloned.push({ role: 'user', parts: [...fileParts] });
    return cloned;
  }

  const target = { ...cloned[idx] };
  if (Array.isArray(target.parts)) {
    target.parts = [...target.parts, ...fileParts];
  } else if (Array.isArray(target.content)) {
    target.content = [...target.content, ...fileParts];
  } else {
    const text = typeof target.content === 'string' ? target.content : '';
    target.parts = [{ text }, ...fileParts];
    delete target.content;
  }
  cloned[idx] = target;
  return cloned;
}

/**
 * T85-Native: Process and upload attachments for a set of messages.
 * This ensures multi-turn multimodal conversations work by re-uploading
 * attachments from history messages when needed.
 * 
 * Optimization: Uses provider_file_cache to avoid redundant uploads within TTL.
 */
async function processAllAttachments({ apiKey, baseUrl, messages, requestAttachments }) {
  const resultMessages = [];
  
  // Find the index of the last user message to attach current request attachments
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  // Collect all uploadIds that have an 'id' field (history attachments)
  const allAttachmentsWithIds = [];
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
  if (Array.isArray(requestAttachments)) {
    for (const att of requestAttachments) {
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
      cacheMap = await getCachedProviderFiles(uploadIdsToCheck, 'gemini');
    } catch (err) {
      console.warn('[gemini] Failed to check file cache:', err.message);
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    let attachmentsToProcess = [];

    if (m.role === 'user') {
      // 1. Existing attachments in this history message (hydrated as contentBytes)
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        attachmentsToProcess = [...m.attachments];
      }
      // 2. Attachments for the current request (added to the last user message)
      if (i === lastUserIdx && Array.isArray(requestAttachments) && requestAttachments.length > 0) {
        attachmentsToProcess = [...attachmentsToProcess, ...requestAttachments];
      }
    }

    if (attachmentsToProcess.length > 0) {
      const fileParts = await Promise.all(
        attachmentsToProcess.map(async (att) => {
          // Check cache first
          if (att.id && cacheMap.has(att.id)) {
            const cached = cacheMap.get(att.id);
            console.log(`[gemini] Using cached file_uri for upload ${att.id}`);
            return { file_data: { mime_type: cached.mime_type || att.mimeType, file_uri: cached.provider_file_id } };
          }
          
          // Upload and cache
          const upload = await uploadGeminiFile({
            apiKey,
            baseUrl,
            fileName: att.fileName || 'file',
            mimeType: att.mimeType || 'application/octet-stream',
            buffer: att.contentBytes,
          });
          
          // Cache the result if we have an uploadId
          if (att.id) {
            try {
              await cacheProviderFile({
                uploadId: att.id,
                provider: 'gemini',
                providerFileId: upload.fileUri,
                mimeType: upload.mimeType || att.mimeType,
              });
            } catch (cacheErr) {
              console.warn('[gemini] Failed to cache file_uri:', cacheErr.message);
            }
          }
          
          return { file_data: { mime_type: upload.mimeType || att.mimeType, file_uri: upload.fileUri } };
        })
      );
      // Create a copy of the message and append parts
      const modifiedMessage = appendGeminiFileParts([m], fileParts)[0];
      resultMessages.push(modifiedMessage);
    } else {
      resultMessages.push(m);
    }
  }

  return resultMessages;
}

/**
 * 构建请求体
 */
function buildRequestBody({
  messages,
  model,
  maxTokens,
  temperature,
  responseSchema,
  responseMimeType,
  enableGrounding,
  tools,
  toolChoice,
  functionResults,
}) {
  // Debug: 打印发送给 Gemini 的消息
  console.log('[gemini] buildRequestBody messages count:', messages.length);

  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents = chatMessages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';

    // Allow callers to provide native Gemini parts directly.
    if (Array.isArray(m.parts) && m.parts.length > 0) {
      return { role, parts: m.parts };
    }

    // Handle multi-modal content array (OpneAI-style or custom)
    if (Array.isArray(m.content)) {
      const parts = m.content.map(p => {
        if (typeof p === 'string') return { text: p };
        if (p.type === 'text') return { text: p.text };
        if (p.type === 'image_url' && p.image_url?.url) {
          const url = p.image_url.url;
          if (url.startsWith('data:')) {
            const [mimeInfo, base64Data] = url.split(';base64,');
            const mimeType = mimeInfo.replace('data:', '');
            return { inline_data: { mime_type: mimeType, data: base64Data } };
          }
        }
        // Native Gemini parts wrapped in content array
        if (p.inline_data || p.file_data || p.text || p.thought) return p;
        return null;
      }).filter(Boolean);

      return { role, parts };
    }

    const text = typeof m.content === 'string' ? m.content : '';

    // Gemini 3 thought signatures: attach signature to a thought part in the model history.
    const thoughtSignature =
      typeof m.thoughtSignature === 'string' ? m.thoughtSignature :
        typeof m.thought_signature === 'string' ? m.thought_signature :
          null;
    const reasoningText =
      typeof m.reasoningText === 'string' ? m.reasoningText :
        typeof m.reasoning_content === 'string' ? m.reasoning_content :
          '';

    if (role === 'model' && thoughtSignature) {
      // Build thought part with signature
      const thoughtPart = {
        thought: true,
        thoughtSignature,
      };
      // Only include text in thought part if we have reasoning content
      if (reasoningText) {
        thoughtPart.text = reasoningText;
      }
      
      return {
        role,
        parts: [thoughtPart, { text }],
      };
    }

    return {
      role,
      parts: [{ text }],
    };
  });

  // Phase 5.4: Append tool outputs as functionResponse parts.
  // ... (keep tool logic)
  if (Array.isArray(functionResults) && functionResults.length > 0) {
    const parts = functionResults
      .filter((r) => r && typeof r.name === 'string')
      .map((r) => {
        const ts =
          typeof r.thoughtSignature === 'string' ? r.thoughtSignature :
            typeof r.thought_signature === 'string' ? r.thought_signature :
              null;

        /** @type {any} */
        const part = {
          functionResponse: {
            name: r.name,
            response: r.response,
          },
        };

        if (typeof r.id === 'string' && r.id.length > 0) {
          part.functionResponse.id = r.id;
        }
        if (ts) {
          part.thoughtSignature = ts;
        }

        return part;
      });

    if (parts.length > 0) {
      contents.push({ role: 'user', parts });
    }
  }
  
  // Thinking models 需要更大的 token 限制
  const modelLower = typeof model === 'string' ? model.toLowerCase() : '';
  const isGemini3 = modelLower.includes('gemini-3') || modelLower.includes('-3-');
  const isThinkingModel = model && (
    isGemini3 ||
    model.includes('thinking') ||
    model.includes('2.5-pro') ||
    model.includes('2-5-pro') ||
    model.includes('2.5-flash') ||
    model.includes('2-5-flash')
  );
  
  const thinkingMinTokens = 8192;
  const defaultMaxTokens = isThinkingModel ? 65536 : 4096;
  
  let resolvedMaxTokens;
  if (typeof maxTokens === 'number' && maxTokens > 0) {
    if (isThinkingModel && maxTokens < thinkingMinTokens) {
      resolvedMaxTokens = defaultMaxTokens;
    } else {
      resolvedMaxTokens = maxTokens;
    }
  } else {
    resolvedMaxTokens = defaultMaxTokens;
  }
  
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: resolvedMaxTokens,
    },
  };
  
  if (systemMessages.length > 0) {
    body.system_instruction = {
      parts: systemMessages.flatMap(m => {
        if (Array.isArray(m.parts) && m.parts.length > 0) return m.parts;
        return [{ text: typeof m.content === 'string' ? m.content : '' }];
      })
    };
  }

  if (typeof temperature === 'number') {
    body.generationConfig.temperature = temperature;
  }
  
  // Thinking 支持：尽量不改变现有默认行为，只做渐进增强。
  // - Gemini 2.5: 使用 thinkingBudget（现有逻辑）
  // - Gemini 3: 支持 thinkingLevel/includeThoughts（但图片生成模型不支持）
  if (modelLower) {
    const isImageModel = modelLower.includes('-image-') || modelLower.includes('image-preview');
    const isGemini25 = modelLower.includes('2.5') || modelLower.includes('2-5');

    if (isGemini25) {
      // Docs: Gemini 2.5 uses thinkingBudget (budget applies to raw thoughts).
      // 2.5 Pro benefits from a higher default budget for complex reasoning.
      const isGemini25Pro = modelLower.includes('2.5-pro') || modelLower.includes('2-5-pro');
      body.generationConfig.thinkingConfig = {
        thinkingBudget: isGemini25Pro ? 4096 : 1024,
        // Official docs (2025-2026): request thought summaries via includeThoughts.
        // Note: best-effort; response may omit thought parts even when enabled.
        includeThoughts: true,
      };
    } else if (isGemini3 && !isImageModel) {
      // Image generation models don't support thinking config
      body.generationConfig.thinkingConfig = {
        thinkingLevel: 'HIGH',
        includeThoughts: true,
      };
    }
  }

  // Structured Output (JSON schema)
  // Docs: https://ai.google.dev/gemini-api/docs/structured-output
  // Only attach when a schema is provided to keep behavior non-invasive.
  if (responseSchema && typeof responseSchema === 'object') {
    body.generationConfig.responseMimeType =
      typeof responseMimeType === 'string' && responseMimeType.trim().length > 0
        ? responseMimeType.trim()
        : 'application/json';
    body.generationConfig.responseSchema = responseSchema;
  }

  // Phase 5: Function Calling (tools parameter)
  // Docs: https://ai.google.dev/gemini-api/docs/function-calling
  // tools 可以是 FunctionDeclaration[] 或包含 grounding tool 的数组
  // 优先使用外部传入的 tools，其次是 grounding
  if (Array.isArray(tools) && tools.length > 0) {
    // Convert tools to Gemini format: { function_declarations: [...] }
    const functionDeclarations = tools
      .filter((t) => t && typeof t.name === 'string')
      .map((t) => ({
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || undefined,
      }));

    if (functionDeclarations.length > 0) {
      body.tools = [{ function_declarations: functionDeclarations }];

      // toolChoice maps to tool_config.function_calling_config.mode
      // Docs: AUTO (default), ANY (force call), NONE (disable)
      if (toolChoice === 'ANY' || toolChoice === 'NONE') {
        body.tool_config = {
          function_calling_config: { mode: toolChoice },
        };
      }
      // If enableGrounding is also set, append google_search tool
      if (enableGrounding === true) {
        body.tools.push(buildGroundingToolForModel(model));
      }
    }
  } else if (enableGrounding === true) {
    // Grounding only (no function declarations)
    // Docs: https://ai.google.dev/gemini-api/docs/grounding
    body.tools = [buildGroundingToolForModel(model)];
  }
  
  return body;
}

/**
 * Build a grounding tool compatible with the selected Gemini model.
 *
 * - Gemini 2.0+ / 2.5 / 3 (stable): use google_search
 * - Gemini 1.5 (legacy): use google_search_retrieval
 *
 * Note: Preview/experimental model support is provider-side; we still emit a best-effort tool.
 */
function buildGroundingToolForModel(model) {
  const modelLower = typeof model === 'string' ? model.toLowerCase() : '';

  // Gemini 1.5 models use legacy google_search_retrieval.
  if (modelLower.includes('1.5') || modelLower.includes('gemini-1-5')) {
    return {
      google_search_retrieval: {
        dynamic_retrieval_config: {
          mode: 'MODE_DYNAMIC',
          dynamic_threshold: 0.7,
        },
      },
    };
  }

  return { google_search: {} };
}

function getTypingEffectConfigForModel(model) {
  const modelLower = typeof model === 'string' ? model.toLowerCase() : '';
  const isGemini3 = modelLower.includes('gemini-3') || modelLower.includes('-3-');

  // For Gemini 3 and 2.5 Pro, responses can be long and arrive in large bursts.
  // Use larger chunks + shorter delay to avoid a "stuck" feeling.
  if (isGemini3 || modelLower.includes('2.5-pro') || modelLower.includes('2-5-pro')) {
    return { chunkSize: 12, delayMs: 5 };
  }
  return { chunkSize: 3, delayMs: 15 };
}

/**
 * 从响应中提取文本
 * 
 * 注意：Gemini 返回的 parts 中的文本已经包含了正确的换行符
 * 不应该在连接 parts 时再添加额外的换行，否则会破坏原始格式
 */
function extractTextFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  
  // 直接拼接文本，不添加额外换行。
  // 注意：Gemini 3 includeThoughts=true 时，thought 部分可能以 { text, thought: true } 的形式出现。
  // 这些内容应进入 reasoning，而不是最终回答文本。
  const text = parts
    .map((p) => {
      const isThought = p?.thought === true;
      if (isThought) return '';
      return typeof p?.text === 'string' ? p.text : '';
    })
    .filter(Boolean)
    .join('');
  
  return text;
}

/**
 * 提取 Gemini 图片输出（base64）
 * 主要用于 gemini-3-pro-image-preview 等图片模型。
 *
 * @param {Object} response
 * @returns {Array<{ mimeType: string, dataBase64: string }>}
 */
function extractImagesFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];

  const images = [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const mimeType = inline?.mimeType || inline?.mime_type;
    const dataBase64 = inline?.data;
    if (typeof mimeType === 'string' && typeof dataBase64 === 'string' && dataBase64.length > 0) {
      images.push({ mimeType, dataBase64 });
    }
  }
  return images;
}

/**
 * 映射 usage 数据
 */
function mapUsage(usageMeta) {
  if (!usageMeta) return null;
  return {
    promptTokens: usageMeta.promptTokenCount ?? null,
    completionTokens: usageMeta.candidatesTokenCount ?? null,
    thoughtsTokens: usageMeta.thoughtsTokenCount ?? null,
    cachedTokens: usageMeta.cachedContentTokenCount ?? null,
    totalTokens: usageMeta.totalTokenCount ?? null,
    raw: usageMeta,
  };
}

/**
 * 提取 Gemini Grounding Metadata (Phase 4.3)
 * Docs: https://ai.google.dev/gemini-api/docs/grounding
 * 
 * @param {Object} response - Gemini API 响应
 * @returns {Object|null} Grounding metadata or null
 */
function extractGroundingMetadata(response) {
  const metadata = response?.candidates?.[0]?.groundingMetadata;
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  
  const result = {};
  
  // searchEntryPoint: rendered search UI
  if (metadata.searchEntryPoint) {
    result.searchEntryPoint = metadata.searchEntryPoint;
  }
  
  // groundingChunks: retrieved documents (web/uri/title)
  if (Array.isArray(metadata.groundingChunks) && metadata.groundingChunks.length > 0) {
    result.groundingChunks = metadata.groundingChunks;
  }
  
  // groundingSupports: citation relationships
  if (Array.isArray(metadata.groundingSupports) && metadata.groundingSupports.length > 0) {
    result.groundingSupports = metadata.groundingSupports;
  }
  
  // Only return if we have any grounding data
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * 提取 Gemini Function Calls (Phase 5)
 * Docs: https://ai.google.dev/gemini-api/docs/function-calling
 * 
 * @param {Object} response - Gemini API 响应
 * @returns {Array|null} Function calls array or null
 */
function extractFunctionCalls(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  
  const calls = [];
  for (const part of parts) {
    if (part && typeof part.functionCall === 'object' && part.functionCall.name) {
      calls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
        // thoughtSignature may be present for multi-turn function calling
        thoughtSignature: part.thoughtSignature || part.thought_signature || null,
      });
    }
  }
  
  return calls.length > 0 ? calls : null;
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
  const errorCode = payload?.error?.code || '';
  
  // 认证错误
  if (status === 401 || status === 403 ||
      lowerMsg.includes('invalid api key') ||
      lowerMsg.includes('api key not valid') ||
      lowerMsg.includes('permission denied')) {
    return createLLMError({
      code: isByok ? LLM_ERROR_CODES.BYOK_INVALID_KEY : LLM_ERROR_CODES.INVALID_REQUEST,
      provider: 'gemini',
      httpStatus: status,
      message: isByok ? undefined : message,
      raw: payload,
      isByok,
    });
  }
  
  // Key 被暂停
  if (lowerMsg.includes('suspended')) {
    return createLLMError({
      code: LLM_ERROR_CODES.BYOK_KEY_SUSPENDED,
      provider: 'gemini',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 额度不足
  if (status === 402 ||
      lowerMsg.includes('quota') ||
      lowerMsg.includes('billing') ||
      errorCode === 'RESOURCE_EXHAUSTED') {
    return createLLMError({
      code: LLM_ERROR_CODES.BYOK_INSUFFICIENT_QUOTA,
      provider: 'gemini',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 速率限制
  if (status === 429 || lowerMsg.includes('rate limit')) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_RATE_LIMITED,
      provider: 'gemini',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 模型不存在
  if (status === 404 || lowerMsg.includes('not found')) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_MODEL_NOT_FOUND,
      provider: 'gemini',
      httpStatus: status,
      message,
      raw: payload,
      isByok,
    });
  }
  
  // 内容过滤
  if (lowerMsg.includes('safety') || lowerMsg.includes('blocked')) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_CONTENT_FILTERED,
      provider: 'gemini',
      httpStatus: status,
      raw: payload,
      isByok,
    });
  }
  
  // 默认错误
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'gemini',
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
      provider: 'gemini',
      message: err.message,
      isByok,
    });
  }
  
  // 网络错误
  const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH']);
  if (networkCodes.has(err.code)) {
    return createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'gemini',
      message: err.message,
      isByok,
    });
  }
  
  // 默认
  return createLLMError({
    code: LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: 'gemini',
    message: err.message,
    isByok,
  });
}

export default geminiDriver;
