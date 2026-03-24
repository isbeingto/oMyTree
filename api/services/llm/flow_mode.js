/**
 * Flow Mode inference (rule-based, no LLM).
 * Decides the conversational mode for the current turn.
 */
import { Intent } from './intent_classifier.js';

export const FlowMode = {
  EXPLAIN: 'EXPLAIN',
  QA: 'QA',
  SUMMARY: 'SUMMARY',
  CLOSE: 'CLOSE',
  PLAN: 'PLAN',
};

const planKeywords = [
  /计划/i,
  /规划/i,
  /安排/i,
  /路线图/i,
  /roadmap/i,
  /schedule/i,
  /plan\b/i,
  /timeline/i,
  /步骤/i,
  /拆解/i,
  /milestone/i,
];

const explainKeywords = [
  /为什么/i,
  /原因/i,
  /原理/i,
  /解释/i,
  /\bwhy\b/i,
  /\bexplain\b/i,
  /how does/i,
  /what causes/i,
];

const summaryKeywords = [
  /总结/i,
  /概括/i,
  /小结/i,
  /recap/i,
  /\bsummar(y|ize)\b/i,
];

const broadTopicKeywords = [
  /介绍/i,
  /概览/i,
  /概述/i,
  /历史/i,
  /发展历程/i,
  /背景/i,
  /overview/i,
  /story/i,
  /history/i,
];

const detailKeywords = [
  /步骤/i,
  /详细/i,
  /具体/i,
  /示例/i,
  /代码/i,
  /公式/i,
  /数据/i,
  /举例/i,
];

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function matchAny(text, patterns) {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

function isBroadTopicCandidate({ intent, userText }) {
  const normalizedIntent = typeof intent === 'string' ? intent.trim().toUpperCase() : '';
  const text = normalizeText(userText);
  if (!text) return false;
  const length = text.length;
  const looksShort = length >= 4 && length <= 36;
  const hasBroadKeyword = matchAny(text, broadTopicKeywords);
  const hasDetail = matchAny(text, detailKeywords) || /\d{2,}/.test(text);
  const hasQuestionMark = text.includes('?') || text.includes('？');
  // Heuristic: short + abstract + ask-info intent is treated as broad topic.
  return (
    normalizedIntent === Intent.ASK_INFO &&
    looksShort &&
    !hasDetail &&
    (hasBroadKeyword || !hasQuestionMark)
  );
}

function topicTagHintsPlan(topicTag) {
  if (!topicTag || typeof topicTag !== 'string') return false;
  const tag = topicTag.trim().toLowerCase();
  return ['plan', 'planning', 'roadmap', 'schedule', 'timeline', '规划', '计划'].some((hint) =>
    tag.includes(hint)
  );
}

/**
 * Infer flow mode from intent, latest user text, and topic tag.
 * @param {object} params
 * @param {string} [params.intent]
 * @param {string} [params.userText]
 * @param {string|null} [params.topicTag]
 * @returns {{ flowMode: string, isBroadTopic: boolean }}
 */
export function inferFlowModeResult({ intent, userText, topicTag } = {}) {
  const normalizedIntent = typeof intent === 'string' ? intent.trim().toUpperCase() : '';
  const text = normalizeText(userText);
  const hasPlan = matchAny(text, planKeywords) || topicTagHintsPlan(topicTag);
  const hasSummary = matchAny(text, summaryKeywords);
  const needsExplain = matchAny(text, explainKeywords);
  const isBroadTopic = isBroadTopicCandidate({ intent: normalizedIntent, userText: text });

  if (normalizedIntent === Intent.THANKS) return { flowMode: FlowMode.CLOSE, isBroadTopic };
  if (normalizedIntent === Intent.ASK_SUMMARY || hasSummary) return { flowMode: FlowMode.SUMMARY, isBroadTopic };
  if (hasPlan) return { flowMode: FlowMode.PLAN, isBroadTopic };
  if (needsExplain) return { flowMode: FlowMode.EXPLAIN, isBroadTopic };
  if (normalizedIntent === Intent.CLARIFY) return { flowMode: FlowMode.QA, isBroadTopic };
  if (normalizedIntent === Intent.ASK_INFO) return { flowMode: FlowMode.QA, isBroadTopic };
  if (normalizedIntent === Intent.NEW_TOPIC) return { flowMode: FlowMode.QA, isBroadTopic };
  if (normalizedIntent === Intent.SMALL_TALK) return { flowMode: FlowMode.QA, isBroadTopic };

  return { flowMode: FlowMode.QA, isBroadTopic };
}

// Backward-compatible helper returning only the flow mode string.
export function inferFlowMode(params = {}) {
  return inferFlowModeResult(params).flowMode;
}

// T50-2: Behavioral functions removed (describeFlowMode, describeBroadTopicConstraint)

export default {
  FlowMode,
  inferFlowMode,
  inferFlowModeResult,
};
