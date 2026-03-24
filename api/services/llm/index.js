import {
  buildRelevancePrompt,
  buildSummarizePrompt,
  buildTopicSemanticGuardPrompt,
  buildTopicGenerationPrompt,
} from './prompt_templates.js';
import { resolveProviderForRequest } from './providers/index.js';
import { parseOpenAiJson } from './providers/openai.js';
import { CONTEXT_MESSAGE_LIMITS } from './context_limits.js';
import { resolveContextProfile } from './context_profiles.js';
import { buildLayeredContextSections } from './context_layers.js';
import { ConversationStage, buildNarrativeFrame, detectConversationStage } from './context_stage.js';
import { inferFlowModeResult } from './flow_mode.js';
import { searchKnowledgeBases, searchKnowledgeBase, formatKnowledgeResultsForPrompt, mapKnowledgeResultsToCitations } from '../knowledge/search_service.js';
// T50-2: Removed style_blueprint import (file deleted)
import { selectRecentDialogueSemantic } from './recent_dialogue_semantic.js';
import { serializeContext, buildContextData, getLegacyPromptGuide, ENABLE_PROMPT_GUIDE } from './serialize_context.js';
import { isContextDebugEnabled, logContextDebug } from '../context_debug.js';
import {
  identifyBranch,
  detectCrossBranchReferences,
  recordBranchReference,
  isBranchSummaryEnabled,
} from './branch_summary.js';

const VALID_RELEVANCE_CLASSIFICATIONS = new Set(['in', 'side', 'new']);
const SUMMARY_CHAR_LIMIT = 400;
const TOPIC_GUARD_DIFF_LIMIT = 400;
const TOPIC_TITLE_MAX_LENGTH = 50; // Max characters for generated topic title
const DEFAULT_CONTEXT_PROFILE = 'lite';
const DEFAULT_MEMORY_SCOPE = 'branch';
const ALLOWED_CONTEXT_PROFILES = new Set(['lite', 'standard', 'max']);
const ALLOWED_MEMORY_SCOPES = new Set(['branch', 'tree']);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Best-practice: avoid short hard timeouts for LLM generation; use a generous (minutes) request timeout.
// Official SDK defaults are typically ~10 minutes.
const LLM_REQUEST_TIMEOUT_MS = parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || '600000', 10);
const CONTEXT_DEBUG_FLAG = (process.env.CONTEXT_DEBUG_DUMP_MESSAGES || '').toLowerCase();
const SHOULD_DEBUG_CONTEXT =
  !IS_PRODUCTION && (CONTEXT_DEBUG_FLAG === '1' || CONTEXT_DEBUG_FLAG === 'true' || CONTEXT_DEBUG_FLAG === 'yes');
const FLOW_ENGINE_FLAG = (process.env.FLOW_ENGINE_V1_ENABLED || 'true').toLowerCase();
const FLOW_ENGINE_ENABLED = !['0', 'false', 'no', 'off'].includes(FLOW_ENGINE_FLAG);
const SEM_CORE_FACTS_FLAG = (process.env.SEMANTIC_CORE_FACTS_ENABLED || 'false').toLowerCase();
const SEMANTIC_CORE_FACTS_ENABLED = !['0', 'false', 'no', 'off'].includes(SEM_CORE_FACTS_FLAG);
const ROLLING_SUMMARY_FLAG = (process.env.ROLLING_SUMMARY_ENABLED || '0').toLowerCase();
const ROLLING_SUMMARY_ENABLED = ['1', 'true', 'yes', 'on'].includes(ROLLING_SUMMARY_FLAG);

async function resolveProviderWithOptions(providerOverride, { expectJson = false, userId, modelHint = null } = {}) {
  const { provider, name, isByok, defaultModel, providerKind, allowedModels } = await resolveProviderForRequest({
    providerHint: providerOverride,
    modelHint,
    userId,
  });

  const handler = async (params) => {
    // Inject defaultModel into options if not already specified
    const enhancedParams = {
      ...params,
      options: {
        model: defaultModel,
        ...params.options,
      },
    };
    const result = await provider.callChat(enhancedParams);

    if (expectJson && !result.parsed_json && result.ai_text) {
      try {
        result.parsed_json = parseOpenAiJson(result.ai_text);
      } catch (error) {
        console.warn(`[resolveProvider] JSON parse failed for provider=${name}`);
      }
    }

    return {
      ...result,
      provider: result?.provider || providerName,
    };
  };

  const providerName = name || provider?.id || 'mock';

  return {
    handler,
    name: providerName,
    provider,
    isByok: Boolean(isByok),
    providerKind: providerKind || null,
    defaultModel,
    allowedModels: Array.isArray(allowedModels) ? allowedModels : null,
  };
}

function ensureString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function ensureOptional(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRollingSummary(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'object') {
    const text = value?.text;
    if (typeof text === 'string') {
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

function clampSummary(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= SUMMARY_CHAR_LIMIT) {
    return trimmed;
  }
  return trimmed.slice(0, SUMMARY_CHAR_LIMIT);
}

function clampDiffSummary(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= TOPIC_GUARD_DIFF_LIMIT) {
    return trimmed;
  }
  return trimmed.slice(0, TOPIC_GUARD_DIFF_LIMIT);
}

function normalizeScore(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return numeric;
}

function normalizeContextProfile(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_CONTEXT_PROFILES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_CONTEXT_PROFILE;
}

function normalizeMemoryScope(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_MEMORY_SCOPES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_MEMORY_SCOPE;
}

function clampTemperature(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Gemini/OpenAI family generally accept [0, 2]; keep a safe clamp.
  return Math.max(0, Math.min(2, n));
}

function resolveAdaptiveTemperature({ providerName, model, mode, intent, userText }) {
  const providerLower = typeof providerName === 'string' ? providerName.trim().toLowerCase() : '';
  const modelLower = typeof model === 'string' ? model.trim().toLowerCase() : '';
  const modeLower = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  const intentLower = typeof intent === 'string' ? intent.trim().toLowerCase() : '';
  const text = typeof userText === 'string' ? userText.trim().toLowerCase() : '';

  // Keep DeepSeek untouched (docs indicate temperature/top_p etc not supported for reasoning mode).
  if (providerLower === 'deepseek') return null;

  // Gemini-first: adaptive temperature for Gemini 3 family.
  if (providerLower === 'google' || providerLower === 'gemini') {
    const isImageModel = modelLower.includes('image');
    const isGemini3 = modelLower.includes('gemini-3') || modelLower.includes('-3-');

    const creativeHint =
      /\b(brainstorm|creative|story|poem|novel|slogan|marketing|copywriting)\b/.test(text) ||
      /写|故事|小说|诗|诗歌|文案|脑暴|创意|润色|改写|续写|海报/.test(userText || '');

    const analyticHint =
      /\b(debug|bug|fix|explain|analyze|analysis|prove|derive|calculate|sql|typescript|javascript|python)\b/.test(text) ||
      /排查|调试|修复|解释|分析|证明|推导|计算|代码|报错|sql|性能/.test(userText || '');

    // Non-chat modes should stay conservative.
    if (modeLower && modeLower !== 'chat') {
      return clampTemperature(0.2);
    }

    if (isImageModel) {
      // Image generation benefits from some diversity, but keep it stable.
      return clampTemperature(0.7);
    }

    if (analyticHint) return clampTemperature(0.3);
    if (creativeHint) return clampTemperature(0.85);

    // Default: Gemini 3 a bit more open than the previous 0.4.
    return clampTemperature(isGemini3 ? 0.6 : 0.4);
  }

  // Fallback: preserve existing behavior.
  return clampTemperature(0.4);
}

function normalizeAnswerPayload(payload = {}) {
  const knowledge = normalizeKnowledge(payload.knowledge ?? payload.knowledge_context ?? null);
  return {
    tree_id: ensureString(payload.tree_id),
    node_id: typeof payload.node_id === 'string' ? payload.node_id : null,
    user_text: ensureString(payload.user_text),
    query_text: ensureString(payload.query_text || payload.user_text),
    path_summary: ensureOptional(payload.path_summary),
    parent_summary: ensureOptional(payload.parent_summary),
    rolling_summary: payload.rolling_summary ?? payload.rollingSummary ?? null,
    context_profile: normalizeContextProfile(payload.context_profile ?? payload.contextProfile),
    memory_scope: normalizeMemoryScope(payload.memory_scope ?? payload.memoryScope),
    root_topic: ensureOptional(payload.root_topic || payload.topic) ?? '',
    breadcrumb_titles: Array.isArray(payload.breadcrumb_titles) ? payload.breadcrumb_titles : [],
    parent_full_text: ensureOptional(payload.parent_full_text),
    tree_summary_text: ensureOptional(payload.tree_summary_text),
    recent_turns: Array.isArray(payload.recent_turns) ? payload.recent_turns : [],
    user_language: ensureOptional(payload.user_language || payload.preferred_language) || 'en',
    topic_tag: ensureOptional(payload.topic_tag || payload.topicTag),
    intent: ensureOptional(payload.intent),
    knowledge_base_ids: Array.isArray(payload.knowledge_base_ids) ? payload.knowledge_base_ids : [],
    knowledge,
  };
}

function normalizeKnowledge(value) {
  if (!value || typeof value !== 'object') return null;
  const baseId = ensureOptional(value.baseId ?? value.base_id ?? value.kbId ?? value.kb_id ?? value.knowledgeBaseId);
  if (!baseId) return null;
  const rawDocIds = value.documentIds ?? value.document_ids ?? value.docIds ?? value.doc_ids;
  const documentIds = Array.isArray(rawDocIds) ? rawDocIds.map(String).filter(Boolean).slice(0, 20) : [];
  const topKRaw = value.topK ?? value.top_k;
  const topKNum = Number(topKRaw);
  const topK = Number.isFinite(topKNum) ? Math.max(1, Math.min(20, Math.floor(topKNum))) : null;
  const baseName = ensureOptional(value.baseName ?? value.base_name ?? value.kbName ?? value.kb_name);

  return {
    baseId,
    baseName,
    ...(documentIds.length > 0 ? { documentIds } : {}),
    ...(topK !== null ? { topK } : {}),
  };
}

async function maybeDebugContextMessages(label, payload) {
  // Legacy console debug (for local dev)
  if (SHOULD_DEBUG_CONTEXT) {
    try {
      console.debug('[context:messages]', JSON.stringify({
        label,
        tree_id: payload?.treeId ?? null,
        node_id: payload?.nodeId ?? null,
        context_profile: payload?.contextProfile ?? null,
        memory_scope: payload?.memoryScope ?? null,
        provider: payload?.provider ?? null,
        model: payload?.model ?? null,
        messages: payload?.messages ?? [],
      }, null, 2));
    } catch (error) {
      console.warn('[context:messages] debug dump failed', error);
    }
  }

  // T53-3: Database logging when debug mode enabled
  const treeId = payload?.treeId;
  const userId = payload?.userId;

  if (!treeId || !userId) return;

  try {
    const debugStatus = await isContextDebugEnabled(treeId);
    if (!debugStatus.enabled) return;

    await logContextDebug({
      treeId,
      nodeId: payload?.nodeId ?? null,
      turnId: payload?.turnId ?? null,
      userId,
      provider: payload?.provider ?? 'unknown',
      model: payload?.model ?? 'unknown',
      contextProfile: payload?.contextProfile ?? 'lite',
      memoryScope: payload?.memoryScope ?? 'branch',
      messages: payload?.messages ?? [],
      debugSource: debugStatus.source,
      contextBuildMs: payload?.contextBuildMs ?? null,
      notes: label ? `Label: ${label}` : null,
    });
  } catch (error) {
    console.warn('[context-debug] Failed to log to database:', error.message);
  }
}

/**
 * 从 normalized payload 构建消息数组，包含上下文摘要作为系统消息
 * 按 context_profile / memory_scope 拼接不同级别的上下文
 */
async function buildContextMessages(normalized, options = {}) {
  const returnCitations = options?.returnCitations === true;
  let citations = [];
  // T50-2: Removed flowModeOverride, isBroadTopic, flowEngineEnabled (behavioral)
  const messages = [];
  const profile = normalizeContextProfile(normalized.context_profile);
  const scope = normalizeMemoryScope(normalized.memory_scope);
  const limits = CONTEXT_MESSAGE_LIMITS[profile] || CONTEXT_MESSAGE_LIMITS.lite;
  const userLang = normalized.user_language || 'en';
  const isChinese = userLang.startsWith('zh');

  const providerName = typeof options.providerName === 'string' ? options.providerName.trim().toLowerCase() : '';
  const modelName = typeof options.model === 'string' ? options.model.trim().toLowerCase() : '';
  const wantsThoughtSignatures =
    (providerName === 'google' || providerName === 'gemini') &&
    (modelName.includes('gemini-3') || modelName.includes('-3-'));

  // T50-1: Clean context serialization (replaces old labels/contextParts pattern)
  const rootTopic = normalized.root_topic || '';
  const topicTag = normalized.topic_tag || '';
  const breadcrumbTitles = Array.isArray(normalized.breadcrumb_titles)
    ? normalized.breadcrumb_titles.filter(Boolean)
    : [];
  const includeTreeStory = scope === 'tree' && limits.includeTreeStory !== false;
  const treeSummaryInput = includeTreeStory ? (normalized.tree_summary_text || '') : '';
  const treeStoryLimit = includeTreeStory ? limits.treeStoryLimit || limits.treeStory || 0 : 0;
  const rollingSummaryText = ROLLING_SUMMARY_ENABLED ? normalizeRollingSummary(normalized.rolling_summary) : null;
  const selectedRecent = await selectRecentDialogueSemantic({
    turns: normalized.recent_turns || [],
    userText: normalized.user_text || '',
    profile,
    limit: limits.recentTurns,
  });

  const hasThoughtSignatureInRecent = Array.isArray(selectedRecent)
    ? selectedRecent.some((t) => typeof t?.thought_signature === 'string' && t.thought_signature.length > 0)
    : false;
  const enableGeminiThoughtSignatures = wantsThoughtSignatures && hasThoughtSignatureInRecent;

  const layered = await buildLayeredContextSections({
    scope,
    breadcrumbTitles,
    pathSummary: normalized.path_summary || '',
    parentSummary: normalized.parent_summary || '',
    parentFullText: normalized.parent_full_text || '',
    treeSummary: treeSummaryInput,
    rollingSummary: rollingSummaryText || '',
    recentTurns: selectedRecent,
    activeTopicTag: topicTag || null,
    limits: {
      pathSummary: limits.pathSummary,
      parentSummary: limits.parentSummary,
      rollingSummary: limits.rollingSummary || limits.parentSummary,
      parentFull: limits.parentFull,
      recentTurns: limits.recentTurns,
      recentTurnChars: limits.recentTurnChars || limits.parentSummary,
      treeStory: treeStoryLimit,
    },
  }, {
    userText: normalized.user_text || '',
    semanticCoreFactsEnabled: options.semanticCoreFactsEnabled ?? SEMANTIC_CORE_FACTS_ENABLED,
    profile,
  });

  // T51-2: Debug logging for context construction (non-production only)
  if (process.env.DEBUG === '1' || process.env.NODE_ENV !== 'production') {
    const estimatedTokens = Math.ceil(
      ((layered.tree_story || '').length +
        (layered.rolling_summary || '').length +
        (layered.path_background || '').length +
        layered.core_facts.reduce((sum, f) => sum + f.length, 0) +
        layered.recent_dialogue.reduce((sum, d) => sum + d.text.length, 0)) / 4
    );
    console.debug('[T51-2:context]', JSON.stringify({
      profile,
      scope,
      tokensBudget: limits.tokensBudget,
      estimatedTokens,
      recentTurnsCount: layered.recent_dialogue.length,
      recentTurnPairsMin: limits.minRecentTurnPairs || limits.recentTurnPairs,
      hasTreeStory: !!layered.tree_story,
      coreFactsCount: layered.core_facts.length,
      hasPathBackground: !!layered.path_background,
    }));
  }

  // T85-Native: For native file providers (Gemini, Claude, etc.), we include 
  // recent dialogue as explicit messages with attachments to support follow-up.
  const isNativeProvider = ['google', 'gemini', 'anthropic', 'claude'].includes(providerName?.toLowerCase());
  const useExplicitHistory = enableGeminiThoughtSignatures || isNativeProvider;

  // P2: Cross-branch references (fail-open)
  let crossBranchContext = null;
  if (
    isBranchSummaryEnabled() &&
    scope === 'branch' &&
    normalized.tree_id &&
    normalized.node_id &&
    normalized.user_text
  ) {
    try {
      const branchInfo = await identifyBranch(normalized.node_id, normalized.tree_id);
      const references = await detectCrossBranchReferences(
        normalized.user_text,
        branchInfo.branchId,
        normalized.tree_id
      );

      if (references.length > 0) {
        crossBranchContext = {
          branches: references.map((ref) => ({
            branchId: ref.branchId,
            summary: ref.summary,
            relevanceScore: ref.score,
          })),
        };

        for (const ref of references) {
          try {
            await recordBranchReference({
              treeId: normalized.tree_id,
              sourceNodeId: normalized.node_id,
              sourceBranchId: branchInfo.branchId,
              referencedBranchId: ref.branchId,
              referenceType: ref.referenceType || 'semantic',
              confidenceScore: ref.score,
            });
          } catch (error) {
            // fail-open
          }
        }

        console.log('[P2:CrossBranch]', {
          treeId: normalized.tree_id,
          nodeId: normalized.node_id,
          branchId: branchInfo.branchId,
          references: references.map((r) => ({ id: r.branchId, score: r.score })),
        });
      }
    } catch (error) {
      console.warn('[P2:CrossBranch] detection failed:', error?.message || error);
    }
  }

  // T50-1: Use serializeContext for clean output
  const contextData = buildContextData({
    pathSummary: layered.path_background || '',
    nodeSummary: normalized.parent_summary || '',
    rollingSummary: layered.rolling_summary || '',
    // When Gemini thought signatures or Native history are enabled we pass recent turns as real messages,
    // so we omit them from the system context block to avoid duplication.
    recentDialogue: useExplicitHistory ? [] : (layered.recent_dialogue || []),
    coreFacts: layered.core_facts || [],
    treeStory: layered.tree_story || '',
    topic: rootTopic,
    topicTag: topicTag,
    crossBranch: crossBranchContext,
  });

  const serializedContext = serializeContext(contextData, { lang: userLang });

  // Build system message
  const systemSections = [];

  const weknoraApiKey =
    typeof options.weknoraApiKey === 'string' && options.weknoraApiKey.trim().length > 0
      ? options.weknoraApiKey.trim()
      : null;

  // KB-2.4/2.5: Knowledge Base RAG Search
  if (normalized?.knowledge?.baseId || normalized.knowledge_base_ids?.length > 0) {
    try {
      const topKRaw = typeof normalized?.knowledge?.topK === 'number' ? normalized.knowledge.topK : 5;
      const topK = Number.isFinite(topKRaw) ? Math.max(1, Math.floor(topKRaw)) : 5;
      const searchQuery = normalized.query_text || normalized.user_text;
      const searchResults = normalized?.knowledge?.baseId
        ? await searchKnowledgeBase(
            normalized.knowledge.baseId,
            searchQuery,
            {
              topK,
              documentIds: Array.isArray(normalized.knowledge.documentIds) ? normalized.knowledge.documentIds : [],
              weknoraApiKey,
            }
          )
        : await searchKnowledgeBases(
            normalized.knowledge_base_ids,
            searchQuery,
            topK,
            { weknoraApiKey }
          );
      if (searchResults.length > 0) {
        const kbPrompt = formatKnowledgeResultsForPrompt(searchResults);
        systemSections.push(kbPrompt);
        citations = mapKnowledgeResultsToCitations(searchResults, { snippetMaxChars: 800 });
        console.log(`[buildContextMessages] KB search done, results=${searchResults.length}`);
      }
    } catch (err) {
      console.warn('[buildContextMessages] KB search failed:', err.message);
    }
  }

  // Legacy prompt guide (only if ENABLE_PROMPT_GUIDE=true)
  const legacyGuide = getLegacyPromptGuide(userLang);
  if (legacyGuide) {
    systemSections.push(legacyGuide);
  }

  // Add serialized context (clean, no behavioral instructions)
  if (serializedContext) {
    systemSections.push(serializedContext);
  }

  if (systemSections.length > 0) {
    messages.push({
      role: 'system',
      content: systemSections.join('\n\n\n'),
    });
  }

  // Gemini 3 thought signatures or Native Providers: include recent dialogue as explicit messages (oldest -> newest)
  if (useExplicitHistory) {
    const chronological = Array.isArray(selectedRecent) ? [...selectedRecent].reverse() : [];
    for (const turn of chronological) {
      const role = typeof turn?.role === 'string' ? turn.role : 'user';
      const text = typeof turn?.text === 'string' ? turn.text : '';
      if (!text && (!turn.attachments || turn.attachments.length === 0)) continue;

      if (role === 'assistant') {
        const thoughtSignature = typeof turn?.thought_signature === 'string' ? turn.thought_signature : null;
        const reasoningText = typeof turn?.reasoning_content === 'string' ? turn.reasoning_content : null;
        messages.push({
          role: 'assistant',
          content: text,
          thoughtSignature,
          reasoningText,
        });
      } else {
        messages.push({
          role: 'user',
          content: text,
          // T85-Native: Preserve attachment contents in history for driver to handle
          attachments: turn.hydratedAttachments || [],
        });
      }
    }
  }

  if (normalized.user_text) {
    messages.push({
      role: 'user',
      content: normalized.user_text,
    });
  }

  // T52-3: Temporary logging to capture full messages array
  if (process.env.T52_CAPTURE_MESSAGES === '1') {
    const fs = await import('fs');
    const path = await import('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const treeId = normalized.tree_id || 'unknown';
    const fileName = `t52-3-messages-${profile}-${timestamp}.json`;
    const logDir = '/srv/linzhi/logs';
    const logPath = path.join(logDir, fileName);

    const captureData = {
      timestamp: new Date().toISOString(),
      tree_id: treeId,
      context_profile: profile,
      memory_scope: scope,
      user_text_preview: (normalized.user_text || '').slice(0, 100),
      messages,
      metadata: {
        limits,
        layered_sections: {
          tree_story_length: (layered.tree_story || '').length,
          path_background_length: (layered.path_background || '').length,
          core_facts_count: layered.core_facts.length,
          recent_dialogue_count: layered.recent_dialogue.length,
        }
      }
    };

    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(logPath, JSON.stringify(captureData, null, 2));
      console.log(`[T52-3] Captured messages to ${logPath}`);
    } catch (error) {
      console.warn('[T52-3] Failed to capture messages:', error?.message || error);
    }
  }

  return returnCitations ? { messages, citations } : messages;
}

export { buildContextMessages };

export async function answer(prompt, context = {}, options = {}) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!normalizedPrompt) {
    throw new Error('Prompt must be a non-empty string');
  }

  const { handler: provider } = await resolveProviderWithOptions();
  const result = await provider({
    prompt: normalizedPrompt,
    metadata: context,
    options,
  });

  return {
    text: typeof result?.ai_text === 'string' ? result.ai_text : '',
    usage: result?.usage_json ?? null,
  };
}

export async function getAnswer(payload, options = {}) {
  const normalized = normalizeAnswerPayload(payload);
  if (!normalized.tree_id) {
    throw Object.assign(new Error('tree_id is required'), { code: 'INVALID_TREE_ID' });
  }
  if (!normalized.user_text) {
    throw Object.assign(new Error('user_text is required'), { code: 'INVALID_USER_TEXT' });
  }

  // 直接使用用户原始输入，不添加额外的系统提示
  const prompt = normalized.user_text;

  const providerHint =
    typeof options.providerOverride === 'string' && options.providerOverride.trim().length > 0
      ? options.providerOverride.trim()
      : typeof options.provider === 'string' && options.provider.trim().length > 0
        ? options.provider.trim()
        : null;
  const modeOverride =
    typeof options.mode === 'string' && options.mode.trim().length > 0
      ? options.mode.trim()
      : typeof options.provider_mode === 'string' && options.provider_mode.trim().length > 0
        ? options.provider_mode.trim()
        : null;
  const {
    handler: provider,
    name: providerName,
    isByok,
    defaultModel: providerDefaultModel,
  } = await resolveProviderWithOptions(
    providerHint,
    {
      userId: options.userId,
      modelHint: typeof options.model === 'string' && options.model.trim().length > 0
        ? options.model.trim()
        : null,
    }
  );
  const requestedProfile = normalizeContextProfile(normalized.context_profile);
  const effectiveMemoryScope = normalizeMemoryScope(normalized.memory_scope);
  const { profile: effectiveProfile } = resolveContextProfile(requestedProfile, isByok);
  const providerOptions = {
    timeout_ms: LLM_REQUEST_TIMEOUT_MS,
    context_profile: effectiveProfile,
    memory_scope: effectiveMemoryScope,
  };
  if (Array.isArray(options.attachments) && options.attachments.length > 0) {
    providerOptions.attachments = options.attachments;
  }
  if (modeOverride) {
    providerOptions.mode = modeOverride;
  }
  // Allow explicit model override per request
  const modelOverride =
    typeof options.model === 'string' && options.model.trim().length > 0
      ? options.model.trim()
      : null;
  if (modelOverride) {
    providerOptions.model = modelOverride;
  }

  // Adaptive temperature (Gemini-first). If provider doesn't support it, adapter/driver may ignore.
  const resolvedModelForTemp = providerOptions.model || modelOverride || providerDefaultModel || null;
  const adaptiveTemp = resolveAdaptiveTemperature({
    providerName,
    model: resolvedModelForTemp,
    mode: providerOptions.mode,
    intent: normalized.intent,
    userText: normalized.user_text,
  });
  if (adaptiveTemp !== null) {
    providerOptions.temperature = adaptiveTemp;
  }
  const flowEngineEnabled = options.flowEngineEnabled ?? FLOW_ENGINE_ENABLED;
  let flowMeta = { flowMode: null, isBroadTopic: false };
  if (flowEngineEnabled) {
    flowMeta = inferFlowModeResult({
      intent: normalized.intent,
      userText: normalized.user_text,
      topicTag: normalized.topic_tag,
    });
  }
  const ctx = await buildContextMessages(normalized, {
    flowModeOverride: flowMeta.flowMode,
    isBroadTopic: flowMeta.isBroadTopic,
    flowEngineEnabled,
    providerName,
    model: providerOptions.model,
    returnCitations: true,
    weknoraApiKey: options.weknoraApiKey ?? null,
  });
  const messages = Array.isArray(ctx) ? ctx : ctx.messages;
  const citations = Array.isArray(ctx?.citations) ? ctx.citations : [];

  // T53-3: Debug logging (async)
  await maybeDebugContextMessages('getAnswer', {
    treeId: normalized.tree_id,
    nodeId: normalized.node_id,
    turnId: normalized.turn_id ?? null,
    userId: options.userId ?? null,
    contextProfile: effectiveProfile,
    memoryScope: effectiveMemoryScope,
    provider: providerName,
    model: providerOptions.model,
    messages,
  });

  const result = await provider({
    prompt,
    messages,
    metadata: {
      tree_id: normalized.tree_id,
      node_id: normalized.node_id,
      context_profile: effectiveProfile,
      requested_profile: requestedProfile,
      memory_scope: effectiveMemoryScope,
      flow_mode: flowMeta.flowMode,
      is_broad_topic: flowMeta.isBroadTopic,
    },
    options: providerOptions,
  });

  return {
    ai_text: typeof result?.ai_text === 'string' ? result.ai_text.trim() : '',
    usage_json: result?.usage_json ?? null,
    provider: providerName,
    model: result?.model ?? modelOverride ?? providerDefaultModel ?? null,  // T28-0: 返回使用的模型
    is_byok: isByok,
    citations,
  };
}

export async function streamAnswer(payload, options = {}) {
  const normalized = normalizeAnswerPayload(payload);
  if (!normalized.tree_id) {
    throw Object.assign(new Error('tree_id is required'), { code: 'INVALID_TREE_ID' });
  }
  if (!normalized.user_text) {
    throw Object.assign(new Error('user_text is required'), { code: 'INVALID_USER_TEXT' });
  }

  // 直接使用用户原始输入，不添加额外的系统提示
  const prompt = normalized.user_text;

  const providerHint =
    typeof options.providerOverride === 'string' && options.providerOverride.trim().length > 0
      ? options.providerOverride.trim()
      : typeof options.provider === 'string' && options.provider.trim().length > 0
        ? options.provider.trim()
        : null;
  const modeOverride =
    typeof options.mode === 'string' && options.mode.trim().length > 0
      ? options.mode.trim()
      : typeof options.provider_mode === 'string' && options.provider_mode.trim().length > 0
        ? options.provider_mode.trim()
        : null;

  const {
    handler: providerHandler,
    name: providerName,
    provider,
    isByok,
    defaultModel: providerDefaultModel,
    allowedModels,
  } = await resolveProviderWithOptions(providerHint, {
    userId: options.userId,
    modelHint: typeof options.model === 'string' && options.model.trim().length > 0
      ? options.model.trim()
      : null,
  });

  const requestedProfile = normalizeContextProfile(normalized.context_profile);
  const effectiveMemoryScope = normalizeMemoryScope(normalized.memory_scope);
  const { profile: effectiveProfile } = resolveContextProfile(requestedProfile, isByok);
  const providerOptions = {
    timeout_ms: LLM_REQUEST_TIMEOUT_MS,
    context_profile: effectiveProfile,
    memory_scope: effectiveMemoryScope,
  };
  if (Array.isArray(options.attachments) && options.attachments.length > 0) {
    providerOptions.attachments = options.attachments;
  }
  if (options.enableGrounding === true) {
    providerOptions.enableGrounding = true;
  }
  if (modeOverride) {
    providerOptions.mode = modeOverride;
  }
  const modelOverride =
    typeof options.model === 'string' && options.model.trim().length > 0
      ? options.model.trim()
      : null;
  // Always set model in providerOptions, using override or default
  let resolvedModel = modelOverride || providerDefaultModel || null;

  // If requested model is not allowed, but we have a provider default, fallback to default
  if (Array.isArray(allowedModels) && allowedModels.length > 0 && resolvedModel && !allowedModels.includes(resolvedModel)) {
    if (providerDefaultModel && allowedModels.includes(providerDefaultModel)) {
      console.log(`[LLM Router] Requested model "${resolvedModel}" not allowed for provider "${providerName}". Falling back to default: "${providerDefaultModel}"`);
      resolvedModel = providerDefaultModel;
    } else {
      throw {
        code: 'provider_model_not_found',
        status: 400,
        message: 'Selected model is not enabled for this provider',
        provider: providerName,
        isByok: Boolean(isByok),
        isLlmError: true,
      };
    }
  }

  if (resolvedModel) {
    providerOptions.model = resolvedModel;
  }

  const adaptiveTemp = resolveAdaptiveTemperature({
    providerName,
    model: resolvedModel,
    mode: providerOptions.mode,
    intent: normalized.intent,
    userText: normalized.user_text,
  });
  if (adaptiveTemp !== null) {
    providerOptions.temperature = adaptiveTemp;
  }
  if (options.signal) {
    providerOptions.signal = options.signal;
    console.log('[streamAnswer] signal provided, aborted=', options.signal.aborted);
  }

  const flowEngineEnabled = options.flowEngineEnabled ?? FLOW_ENGINE_ENABLED;
  let flowMeta = { flowMode: null, isBroadTopic: false };
  if (flowEngineEnabled) {
    flowMeta = inferFlowModeResult({
      intent: normalized.intent,
      userText: normalized.user_text,
      topicTag: normalized.topic_tag,
    });
  }

  const supportsStreaming = provider && typeof provider.callChatStream === 'function';

  console.log('[streamAnswer] supportsStreaming=', supportsStreaming, 'providerName=', providerName);

  if (supportsStreaming) {
    console.log('[streamAnswer] Building context messages...');
    // 构建消息数组，包含上下文摘要作为系统消息
    let messages;
    let citations = [];
    try {
      const ctx = await buildContextMessages(normalized, {
        flowModeOverride: flowMeta.flowMode,
        isBroadTopic: flowMeta.isBroadTopic,
        flowEngineEnabled,
        providerName,
        model: providerOptions.model,
        returnCitations: true,
        weknoraApiKey: options.weknoraApiKey ?? null,
      });
      messages = Array.isArray(ctx) ? ctx : ctx.messages;
      citations = Array.isArray(ctx?.citations) ? ctx.citations : [];
      console.log('[streamAnswer] Context messages built, count=', messages?.length);
    } catch (err) {
      console.error('[streamAnswer] buildContextMessages failed:', err?.message || err);
      throw err;
    }

    // T53-3: Debug logging (async)
    await maybeDebugContextMessages('streamAnswer', {
      treeId: normalized.tree_id,
      nodeId: normalized.node_id,
      turnId: normalized.turn_id ?? null,
      userId: options.userId ?? null,
      contextProfile: effectiveProfile,
      memoryScope: effectiveMemoryScope,
      provider: providerName,
      model: providerOptions.model,
      messages,
    });

    return {
      stream: provider.callChatStream({
        prompt,
        messages,
        options: providerOptions,
        metadata: {
          tree_id: normalized.tree_id,
          node_id: normalized.node_id,
          context_profile: effectiveProfile,
          requested_profile: requestedProfile,
          memory_scope: effectiveMemoryScope,
          flow_mode: flowMeta.flowMode,
          is_broad_topic: flowMeta.isBroadTopic,
        },
      }),
      provider: providerName,
      model: resolvedModel,
      is_byok: isByok,
      context_profile: effectiveProfile,
      memory_scope: effectiveMemoryScope,
      streamed: true,
      citations,
    };
  }

  const response = await providerHandler({
    prompt,
    metadata: {
      ...normalized,
      context_profile: effectiveProfile,
      requested_profile: requestedProfile,
      memory_scope: effectiveMemoryScope,
      flow_mode: flowMeta.flowMode,
      is_broad_topic: flowMeta.isBroadTopic,
    },
    options: providerOptions,
  });

  // Best-effort: compute citations even if provider can't stream messages.
  let fallbackCitations = [];
  try {
    const ctx = await buildContextMessages(normalized, {
      flowModeOverride: flowMeta.flowMode,
      isBroadTopic: flowMeta.isBroadTopic,
      flowEngineEnabled,
      providerName,
      model: providerOptions.model,
      returnCitations: true,
      weknoraApiKey: options.weknoraApiKey ?? null,
    });
    fallbackCitations = Array.isArray(ctx?.citations) ? ctx.citations : [];
  } catch {
    fallbackCitations = [];
  }

  const aiText = typeof response?.ai_text === 'string' ? response.ai_text.trim() : '';
  const modelUsed = response?.model ?? modelOverride ?? providerDefaultModel ?? null;
  const providerUsed = response?.provider || providerName;
  const isByokUsed =
    typeof response?.is_byok === 'boolean' ? response.is_byok : isByok;

  async function* fallbackStream() {
    if (aiText) {
      yield { type: 'delta', text: aiText };
    }
    if (response?.usage_json) {
      yield { type: 'usage', usage: response.usage_json };
    }
  }

  return {
    stream: fallbackStream(),
    provider: providerUsed,
    model: modelUsed,
    is_byok: isByokUsed,
    context_profile: effectiveProfile,
    memory_scope: effectiveMemoryScope,
    streamed: false,
    full_text: aiText,
    usage: response?.usage_json ?? null,
    citations: fallbackCitations,
  };
}

function normalizeBreadcrumbList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeSummaryObject(summary, fallbackPath, fallbackParent) {
  if (summary && typeof summary === 'object') {
    return {
      path_summary: ensureOptional(summary.path_summary) ?? '',
      parent_summary: ensureOptional(summary.parent_summary) ?? '',
    };
  }
  return {
    path_summary: ensureOptional(fallbackPath) ?? '',
    parent_summary: ensureOptional(fallbackParent) ?? '',
  };
}

function normalizeTurnList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const role = typeof item.role === 'string' ? item.role.trim().toLowerCase() : 'user';
      const text = ensureString(item.text || item.content);
      if (!text) {
        return null;
      }
      return { role, text };
    })
    .filter(Boolean)
    .slice(-4);
}

function normalizeSummariesPayload(payload = {}) {
  const treeId = ensureString(payload.tree_id ?? payload.treeId);
  const nodeId = ensureString(payload.node_id ?? payload.nodeId);
  const currentText = ensureString(
    payload.node_text ?? payload.nodeText ?? payload.user_text ?? payload.userText
  );

  return {
    treeId,
    nodeId,
    currentText,
    userText: ensureString(payload.user_text ?? payload.userText),
    pathSummary: ensureOptional(payload.path_summary ?? payload.pathSummary) ?? '',
    parentSummary: ensureOptional(payload.parent_summary ?? payload.parentSummary) ?? '',
    topic: ensureOptional(payload.topic ?? payload.root_topic ?? payload.rootTopic) ?? '',
    breadcrumb: normalizeBreadcrumbList(payload.breadcrumb ?? payload.path ?? []),
    parentText: ensureOptional(payload.parent_text ?? payload.parentText) ?? '',
    recentTurns: normalizeTurnList(payload.recent_turns ?? payload.recentTurns ?? []),
  };
}

function parseSummariesResponse(response) {
  if (!response) {
    throw new Error('LLM_SUMMARY_EMPTY');
  }

  let parsed = null;
  if (response.parsed_json && typeof response.parsed_json === 'object') {
    parsed = response.parsed_json;
  } else if (typeof response.ai_text === 'string') {
    parsed = JSON.parse(response.ai_text);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM_SUMMARY_PARSE_ERROR');
  }

  return {
    path_summary: clampSummary(parsed.path_summary ?? ''),
    parent_summary: clampSummary(parsed.parent_summary ?? ''),
  };
}

export async function getRelevance(payload = {}, { providerOverride, userId } = {}) {
  const userText = ensureString(payload.user_text || payload.userText);
  if (!userText) {
    throw Object.assign(new Error('user_text is required'), { code: 'INVALID_USER_TEXT' });
  }

  const topic = ensureOptional(payload.topic || payload.root_topic) ?? '';
  const breadcrumb = normalizeBreadcrumbList(payload.breadcrumb || payload.path);
  const summary = normalizeSummaryObject(
    payload.parent_summary,
    payload.path_summary,
    payload.parent_summary
  );

  const prompt = buildRelevancePrompt({
    topic,
    breadcrumb,
    parent_summary: summary,
    path_summary: summary.path_summary,
    parent_summary_text: summary.parent_summary,
    user_text: userText,
  });

  const { handler: provider, name: providerName } = await resolveProviderWithOptions(
    providerOverride,
    { expectJson: true, userId }
  );

  // Phase 3.3: Use structured output for Gemini to improve reliability
  const options = {
    temperature: 0.1,
    mode: 'relevance',
  };
  
  if (providerName === 'google' || providerName === 'gemini') {
    const { RELEVANCE_SCHEMA } = await import('./schemas/index.js');
    options.responseSchema = RELEVANCE_SCHEMA;
    options.responseMimeType = 'application/json';
  }

  const response = await provider({
    prompt,
    metadata: {
      topic,
      breadcrumb,
      parent_summary: summary,
    },
    options,
  });

  let parsed = null;
  if (response?.parsed_json) {
    parsed = response.parsed_json;
  } else if (typeof response?.ai_text === 'string') {
    try {
      parsed = JSON.parse(response.ai_text);
    } catch (error) {
      const err = new Error('LLM_JSON_PARSE_ERROR');
      err.code = 'LLM_JSON_PARSE_ERROR';
      err.provider = providerName;
      err.raw_text = response.ai_text;
      throw err;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('LLM_JSON_PARSE_ERROR');
    err.code = 'LLM_JSON_PARSE_ERROR';
    err.provider = providerName;
    err.raw_text = response?.ai_text ?? '';
    throw err;
  }

  const classificationRaw = typeof parsed.classification === 'string'
    ? parsed.classification.trim().toLowerCase()
    : '';
  if (!VALID_RELEVANCE_CLASSIFICATIONS.has(classificationRaw)) {
    const err = new Error('LLM_INVALID_CLASSIFICATION');
    err.code = 'LLM_INVALID_CLASSIFICATION';
    err.provider = providerName;
    throw err;
  }

  const confidenceRaw = Number.parseFloat(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;
  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : '';

  return {
    classification: classificationRaw,
    confidence,
    reason,
    provider: providerName,
    usage_json: response?.usage_json ?? null,
  };
}

export async function getSummaries(payload = {}, { providerOverride, userId } = {}) {
  const normalized = normalizeSummariesPayload(payload);

  if (!normalized.treeId) {
    throw Object.assign(new Error('tree_id is required'), { code: 'INVALID_TREE_ID' });
  }

  if (!normalized.nodeId) {
    throw Object.assign(new Error('node_id is required'), { code: 'INVALID_NODE_ID' });
  }

  const prompt = buildSummarizePrompt({
    topic: normalized.topic,
    breadcrumb: normalized.breadcrumb,
    parent_text: normalized.parentText,
    parent_summary: normalized.parentSummary,
    path_summary: normalized.pathSummary,
    node_text: normalized.currentText,
    recent_turns: normalized.recentTurns,
  });

  const { handler: provider, name: providerName } = await resolveProviderWithOptions(
    providerOverride,
    { expectJson: true, userId }
  );

  // Phase 3.4: Use structured output for Gemini to improve reliability
  const options = {
    temperature: 0.1,
    mode: 'summarize',
  };
  
  if (providerName === 'google' || providerName === 'gemini') {
    const { SUMMARIES_SCHEMA } = await import('./schemas/index.js');
    options.responseSchema = SUMMARIES_SCHEMA;
    options.responseMimeType = 'application/json';
  }

  try {
    const response = await provider({
      prompt,
      metadata: {
        treeId: normalized.treeId,
        nodeId: normalized.nodeId,
      },
      options,
    });

    const summaries = parseSummariesResponse(response);
    return {
      path_summary: summaries.path_summary,
      parent_summary: summaries.parent_summary,
      usage_json: response?.usage_json ?? null,
      provider: providerName,
      source: providerName === 'mock' ? 'mock' : 'llm',
    };
  } catch (error) {
    console.warn(
      `[LLM Summaries] failed for tree=${normalized.treeId} node=${normalized.nodeId}`,
      error
    );
    return {
      path_summary: '',
      parent_summary: '',
      usage_json: null,
      provider: providerName,
      source: 'fallback',
    };
  }
}

export async function getTopicSemanticGuard(payload = {}, { providerOverride, userId } = {}) {
  const originalText = ensureString(payload.original_text || payload.originalText);
  const newText = ensureString(payload.new_text || payload.newText);

  if (!originalText) {
    throw Object.assign(new Error('original_text is required'), {
      code: 'INVALID_TOPIC_GUARD_PAYLOAD',
    });
  }
  if (!newText) {
    throw Object.assign(new Error('new_text is required'), {
      code: 'INVALID_TOPIC_GUARD_PAYLOAD',
    });
  }

  const treeTopic = ensureOptional(payload.tree_topic || payload.topic || payload.root_topic) ?? '';
  const breadcrumb = normalizeBreadcrumbList(payload.breadcrumb || payload.path || []);

  const prompt = buildTopicSemanticGuardPrompt({
    original_text: originalText,
    new_text: newText,
    tree_topic: treeTopic,
    breadcrumb,
  });

  const { handler: provider, name: providerName } = await resolveProviderWithOptions(providerOverride, {
    expectJson: true,
    userId,
  });

  const response = await provider({
    prompt,
    metadata: {
      original_text: originalText,
      new_text: newText,
      tree_topic: treeTopic,
      breadcrumb,
    },
    options: {
      temperature: 0.1,
      mode: 'topic_guard',
    },
  });

  let parsed = response?.parsed_json;
  if (!parsed && typeof response?.ai_text === 'string') {
    try {
      parsed = JSON.parse(response.ai_text);
    } catch (error) {
      const err = new Error('LLM_JSON_PARSE_ERROR');
      err.code = 'LLM_JSON_PARSE_ERROR';
      err.provider = providerName;
      err.raw_text = response.ai_text;
      throw err;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('LLM_JSON_PARSE_ERROR');
    err.code = 'LLM_JSON_PARSE_ERROR';
    err.provider = providerName;
    err.raw_text = response?.ai_text ?? '';
    throw err;
  }

  const equivalent = Boolean(parsed.equivalent);
  const score = normalizeScore(parsed.score);
  const diffSummary = clampDiffSummary(
    typeof parsed.diff_summary === 'string' ? parsed.diff_summary : ''
  );
  const candidateSource = typeof parsed.source === 'string' ? parsed.source.trim().toLowerCase() : '';
  const normalizedSource = ['rules', 'llm', 'fallback'].includes(candidateSource)
    ? candidateSource
    : providerName === 'mock'
      ? 'rules'
      : 'llm';

  return {
    equivalent,
    score: score ?? 0,
    diff_summary: diffSummary,
    source: normalizedSource,
    provider: providerName,
    usage_json: response?.usage_json ?? null,
  };
}

/**
 * Generate a short topic/title for a tree based on the user's first question.
 * This is called asynchronously after tree creation.
 *
 * @param {Object} payload - { user_text: string }
 * @returns {Promise<{ topic: string, provider: string }>}
 */
export async function generateTreeTopic(payload = {}) {
  const userText = ensureString(payload.user_text);
  console.log('[llm.generateTreeTopic] userText:', userText);
  if (!userText) {
    return { topic: 'Untitled', provider: 'fallback' };
  }

  const prompt = buildTopicGenerationPrompt({ user_text: userText });
  console.log('[llm.generateTreeTopic] prompt length:', prompt?.length);
  const { handler: provider, name: providerName } = await resolveProviderWithOptions();

  try {
    const response = await provider({
      prompt,
      options: { temperature: 0.3 },
    });
    let topic = ensureString(response?.ai_text || '');

    // Clean up the response - remove quotes, extra punctuation
    topic = topic.replace(/^["'""'']+|["'""'']+$/g, '').trim();
    topic = topic.replace(/[。.!！?？]+$/, '').trim();

    // Ensure reasonable length
    if (topic.length === 0) {
      // Fallback to truncated user text
      topic = userText.length > 20 ? `${userText.slice(0, 20)}...` : userText;
    } else if (topic.length > TOPIC_TITLE_MAX_LENGTH) {
      topic = `${topic.slice(0, TOPIC_TITLE_MAX_LENGTH - 3)}...`;
    }

    console.log(`[llm.generateTreeTopic] Generated topic: "${topic}" (provider: ${providerName})`);

    return {
      topic,
      provider: providerName,
    };
  } catch (error) {
    console.error('[llm.generateTreeTopic] Error generating topic:', error);
    // Fallback to truncated user text
    const fallbackTopic = userText.length > 20 ? `${userText.slice(0, 20)}...` : userText;
    return {
      topic: fallbackTopic,
      provider: 'fallback',
    };
  }
}

// ============================================================
// T32-0: 新的 LLM Router API
// ============================================================

// 导出新的 Router API
export { routeLLM, routeLLMWithResolve } from './router.js';
export {
  PROVIDER_KINDS,
  PROVIDER_SOURCES,
  LLM_ERROR_CODES,
  createLLMError,
  createLLMResponse,
  createLLMErrorResponse,
  getProviderLabel,
} from './types.js';

// 导出 Provider Adapter (用于渐进式迁移)
export { createProviderAdapter } from './provider_adapter.js';
