/**
 * Lightweight stage inference based on latest user turn.
 */

export const ConversationStage = {
  QUESTION: 'question',
  SUMMARY_REQUEST: 'summary_request',
  GRATITUDE: 'gratitude',
  NEW_TOPIC: 'new_topic',
  STATEMENT: 'statement',
  UNKNOWN: 'unknown',
};

function pickLatestUserText(userText, recentTurns = []) {
  const latest = typeof userText === 'string' ? userText.trim() : '';
  if (latest) return latest;

  if (Array.isArray(recentTurns)) {
    for (let i = recentTurns.length - 1; i >= 0; i -= 1) {
      const turn = recentTurns[i];
      if ((turn?.role || 'user') !== 'user') continue;
      const text = typeof turn?.text === 'string' ? turn.text.trim() : '';
      if (text) return text;
    }
  }

  return '';
}

const gratitudePatterns = [
  /谢谢/i,
  /\bthanks?\b/i,
  /\bthank you\b/i,
  /\bthx\b/i,
  /\bty\b/i,
  /多谢/i,
  /感激/i,
];

const summaryPatterns = [
  /总结/i,
  /概括/i,
  /\bsummar(y|ize)\b/i,
  /recap/i,
];

const newTopicPatterns = [
  /换个话题/i,
  /聊点别的/i,
  /another topic/i,
  /new topic/i,
  /restart/i,
];

export function detectConversationStage({ userText, recentTurns = [] } = {}) {
  const text = pickLatestUserText(userText, recentTurns);
  if (!text) return ConversationStage.UNKNOWN;

  if (gratitudePatterns.some((p) => p.test(text))) return ConversationStage.GRATITUDE;
  if (summaryPatterns.some((p) => p.test(text))) return ConversationStage.SUMMARY_REQUEST;
  if (newTopicPatterns.some((p) => p.test(text))) return ConversationStage.NEW_TOPIC;
  if (text.includes('?') || text.includes('？')) return ConversationStage.QUESTION;
  if (text.length > 0) return ConversationStage.STATEMENT;
  return ConversationStage.UNKNOWN;
}

// T50-0: Returns empty string - behavioral narrative instructions removed.
export function buildNarrativeFrame({ userLang = 'en', topic = '', stage = ConversationStage.UNKNOWN } = {}) {
  return '';
}
