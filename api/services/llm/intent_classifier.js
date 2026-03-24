/**
 * Lightweight intent classifier (rule-based, no LLM).
 */
export const Intent = {
  ASK_INFO: 'ASK_INFO',
  ASK_SUMMARY: 'ASK_SUMMARY',
  CLARIFY: 'CLARIFY',
  THANKS: 'THANKS',
  NEW_TOPIC: 'NEW_TOPIC',
  SMALL_TALK: 'SMALL_TALK',
};

const thanksPatterns = [
  /\bthanks?\b/i,
  /\bthank you\b/i,
  /多谢/i,
  /感谢/i,
  /谢谢/i,
  /\bthx\b/i,
  /\bty\b/i,
];

const summaryPatterns = [
  /总结/i,
  /概括/i,
  /小结/i,
  /整理一下/i,
  /\bsummar(y|ize)\b/i,
  /\brecap\b/i,
  /full summary/i,
];

const newTopicPatterns = [
  /换个话题/i,
  /聊点别的/i,
  /另一个话题/i,
  /重新开始聊/i,
  /我们换个/i,
  /\bnew topic\b/i,
  /\bswitch( to)? another topic\b/i,
];

const smallTalkPatterns = [
  /\bhi\b/i,
  /\bhello\b/i,
  /你好/i,
  /嗨/i,
  /早上好/i,
  /下午好/i,
  /晚上好/i,
  /how are you/i,
  /what's up/i,
  /在吗/i,
  /\bhey\b/i,
];

const clarifyPatterns = [
  /什么意思/i,
  /指的是哪/i,
  /指哪个/i,
  /具体指/i,
  /clarify/i,
  /which one/i,
  /do you mean/i,
  /what do you mean/i,
  /can you be more specific/i,
];

const askInfoPatterns = [
  /请问/i,
  /\bhow\b/i,
  /\bwhat\b/i,
  /\bwhy\b/i,
  /\bwhen\b/i,
  /\bwhere\b/i,
  /\bwho\b/i,
  /\b可以.*吗/i,
  /\b能否/i,
  /\b能不能/i,
  /\b麻烦/i,
];

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function collectRecentUserTurns(recentTurns = []) {
  if (!Array.isArray(recentTurns)) return [];
  return recentTurns
    .filter((t) => (t?.role || 'user') === 'user')
    .map((t) => normalizeText(t.text))
    .filter(Boolean)
    .slice(-2);
}

function hasPattern(text, patterns) {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

export function classifyIntent({ userText, recentTurns = [] } = {}) {
  const primary = normalizeText(userText);
  const recentUserTexts = collectRecentUserTurns(recentTurns);
  const corpus = [primary, ...recentUserTexts].filter(Boolean);
  if (corpus.length === 0) {
    return Intent.ASK_INFO;
  }
  const combined = corpus.join(' ').toLowerCase();

  if (hasPattern(combined, thanksPatterns)) return Intent.THANKS;
  if (hasPattern(combined, newTopicPatterns)) return Intent.NEW_TOPIC;
  if (hasPattern(combined, summaryPatterns)) return Intent.ASK_SUMMARY;
  if (hasPattern(combined, smallTalkPatterns)) return Intent.SMALL_TALK;
  if (hasPattern(combined, clarifyPatterns)) return Intent.CLARIFY;
  if (combined.includes('?') || hasPattern(combined, askInfoPatterns)) {
    return Intent.ASK_INFO;
  }

  return Intent.CLARIFY;
}
