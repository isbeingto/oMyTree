import { getRelevance } from './index.js';

const CONFIG = {
  IN_THRESHOLD: 60,
  SIDE_THRESHOLD: 30,
  MAX_SCORE: 100,
};

const DECISION_CONFIG = {
  DIRECT_ACCEPT_THRESHOLD: 0.85,
  MIN_LLM_CONFIDENCE: 0.55,
};

const CONTINUE_PATTERNS = [
  /请继续/i,
  /继续(解释|说明|分析|拆解)?/i,
  /上一[句段节]/i,
  /接着(说|讲|分析)/i,
  /再详细/i,
  /刚才/i
];

const SIDE_PATTERNS = [
  /换个角度/i,
  /例外情况/i,
  /支线/i,
  /衍生/i,
  /变体/i,
  /另外一种/i,
  /相关(但|却)/i,
];

const VALID_CLASSIFICATIONS = new Set(['in', 'side', 'new']);

function safeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function clampScore(score) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(CONFIG.MAX_SCORE, score));
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeClassification(value) {
  const normalized = safeString(value).toLowerCase();
  return VALID_CLASSIFICATIONS.has(normalized) ? normalized : 'new';
}

function normalizeBreadcrumb(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeParentSummary(value) {
  if (value && typeof value === 'object') {
    return {
      path_summary: safeString(value.path_summary ?? ''),
      parent_summary: safeString(value.parent_summary ?? ''),
    };
  }
  if (typeof value === 'string') {
    return {
      path_summary: '',
      parent_summary: safeString(value),
    };
  }
  return {
    path_summary: '',
    parent_summary: '',
  };
}

function normalizeContext(payload = {}) {
  return {
    rootTopic: safeString(payload.rootTopic),
    breadcrumb: normalizeBreadcrumb(payload.breadcrumb),
    parentSummary: normalizeParentSummary(payload.parentSummary),
    userText: safeString(payload.userText),
  };
}

function tokenize(value) {
  if (!value) {
    return [];
  }
  return value
    .toString()
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function expandChineseTokens(value) {
  const text = (value || '').toString().trim();
  if (!text) {
    return [];
  }

  const matches = text.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  const extras = [];

  for (const chunk of matches) {
    const maxLen = Math.min(4, chunk.length);
    for (let size = maxLen; size >= 2; size -= 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        extras.push(chunk.slice(index, index + size));
        if (extras.length >= 32) {
          return extras;
        }
      }
    }
  }

  return extras;
}

function phraseDecision(userText) {
  const normalized = safeString(userText);
  if (!normalized) {
    return null;
  }

  for (const pattern of CONTINUE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        relevance: 'in',
        score: 95,
        reason: '命中续写类提示词',
        hits: ['phrase:continue'],
      };
    }
  }

  for (const pattern of SIDE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        relevance: 'side',
        score: 65,
        reason: '命中支线类提示词',
        hits: ['phrase:side'],
      };
    }
  }

  return null;
}


function heuristicDecision({ rootTopic, breadcrumb, parentSummary, userText }) {
  const sourceTokens = [
    ...tokenize(rootTopic),
    ...tokenize((breadcrumb || []).join(' ')),
    ...tokenize(parentSummary?.path_summary || ''),
    ...tokenize(parentSummary?.parent_summary || ''),
  ];

  const contextTokens = new Set();
  for (const token of sourceTokens) {
    if (!token) {
      continue;
    }
    contextTokens.add(token);
    for (const extra of expandChineseTokens(token)) {
      contextTokens.add(extra);
    }
  }

  const normalizedUser = (userText || '').toString().toLowerCase();

  let overlaps = 0;
  for (const token of contextTokens) {
    if (!token || token.length < 2) {
      continue;
    }
    if (normalizedUser.includes(token.toLowerCase())) {
      overlaps += 1;
    }
  }

  const denominator = Math.max(1, contextTokens.size);
  const ratio = overlaps / denominator;
  const score = Math.max(0, Math.min(CONFIG.MAX_SCORE, Math.round(ratio * CONFIG.MAX_SCORE)));

  let relevance = 'new';
  if (overlaps >= 3 || score >= CONFIG.IN_THRESHOLD) {
    relevance = 'in';
  } else if (overlaps >= 1 || score >= CONFIG.SIDE_THRESHOLD) {
    relevance = 'side';
  }

  const reason =
    overlaps > 0 ? `命中 ${overlaps} 个上下文关键词` : '未命中上下文关键词';

  const hits = [`keyword_overlap:${overlaps}`];

  return { relevance, score, reason, hits };
}

function normalizeRuleDecision(rawDecision) {
  const classification = normalizeClassification(rawDecision?.relevance);
  const rawScore = clampScore(Number.parseInt(rawDecision?.score ?? 0, 10));
  const normalizedScore = rawScore / CONFIG.MAX_SCORE;
  const reason =
    typeof rawDecision?.reason === 'string' && rawDecision.reason.trim().length > 0
      ? rawDecision.reason.trim()
      : `规则判断结果为 ${classification}`;
  const hits = Array.isArray(rawDecision?.hits) ? rawDecision.hits : [];

  return {
    classification,
    score: rawScore,
    normalizedScore,
    reason,
    hits,
  };
}

function evaluateRules(context) {
  const phraseResult = phraseDecision(context.userText);
  if (phraseResult) {
    return normalizeRuleDecision(phraseResult);
  }
  const heuristic = heuristicDecision(context);
  return normalizeRuleDecision(heuristic);
}

function shouldConsultLlm(ruleDecision, context) {
  if (!context.userText) {
    return false;
  }
  return ruleDecision.normalizedScore < DECISION_CONFIG.DIRECT_ACCEPT_THRESHOLD;
}

export async function evaluateRelevance({
  rootTopic,
  breadcrumb,
  parentSummary,
  userText,
}, options = {}) {
  const providerOverride = options?.providerOverride || null;
  const userId = options?.userId || null;
  const context = normalizeContext({ rootTopic, breadcrumb, parentSummary, userText });
  const ruleDecision = evaluateRules(context);

  const baseResult = {
    classification: ruleDecision.classification,
    confidence: clampConfidence(ruleDecision.normalizedScore),
    source: 'rules',
    usage_json: null,
    rule_decision: ruleDecision,
    llm_decision: null,
    meta: {
      rule_hits: [...ruleDecision.hits],
      rule_score: ruleDecision.normalizedScore,
      rule_raw_score: ruleDecision.score,
      rule_classification: ruleDecision.classification,
      provider: null,
      usage_json: null,
    },
  };

  if (
    Array.isArray(ruleDecision.hits) &&
    (ruleDecision.hits.includes('phrase:side') || ruleDecision.hits.includes('phrase:continue'))
  ) {
    return baseResult;
  }

  if (!shouldConsultLlm(ruleDecision, context) || providerOverride === 'mock') {
    return baseResult;
  }

  try {
    const llmDecision = await getRelevance(
      {
        topic: context.rootTopic,
        breadcrumb: context.breadcrumb,
        parent_summary: context.parentSummary,
        user_text: context.userText,
      },
        { providerOverride: options.providerOverride, userId }
      );

    const finalConfidence = typeof llmDecision.confidence === 'number'
      ? clampConfidence(llmDecision.confidence)
      : Math.max(baseResult.confidence, DECISION_CONFIG.MIN_LLM_CONFIDENCE);

    const finalClassification = VALID_CLASSIFICATIONS.has(llmDecision.classification)
      ? llmDecision.classification
      : ruleDecision.classification;

    return {
      ...baseResult,
      classification: finalClassification,
      confidence: finalConfidence,
      source: 'llm',
      usage_json: llmDecision?.usage_json ?? null,
      llm_decision: {
        classification: finalClassification,
        confidence: finalConfidence,
        reason: llmDecision?.reason || '',
      },
      meta: {
        ...baseResult.meta,
        provider: llmDecision?.provider ?? baseResult.meta.provider,
        usage_json: llmDecision?.usage_json ?? null,
      },
    };
  } catch (error) {
    baseResult.meta.provider = error?.provider ?? baseResult.meta.provider;
    // T-Fix: Reduce log noise for expected fallback scenarios (e.g. empty LLM response)
    const errorSummary = error?.code || error?.message || 'unknown';
    if (options?.traceId) {
      console.log(
        `[Relevance][${options.traceId}] LLM evaluation failed (${errorSummary}), using rules fallback`
      );
    } else {
      console.log(`[Relevance] LLM evaluation failed (${errorSummary}), using rules fallback`);
    }
    return baseResult;
  }
}
