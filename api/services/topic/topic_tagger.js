/**
 * Lightweight topic tagger to detect active sub-topic based on recent user turns.
 */

const TAG_MAX_LEN = 10; // UI-friendly upper bound

const EN_STOPWORDS = new Set([
  'the', 'and', 'you', 'are', 'this', 'that', 'for', 'with', 'your', 'about', 'please',
  'can', 'could', 'would', 'should', 'what', 'how', 'why', 'when', 'where', 'who',
  'hello', 'thanks', 'thank', 'hi', 'hey', 'okay', 'ok', 'yes', 'now', 'then', 'very',
  'some', 'any', 'all', 'will', 'just', 'not', 'but', 'was', 'were', 'been', 'have', 'has',
  'had', 'does', 'did', 'from', 'into', 'more', 'most', 'other', 'such', 'than', 'them',
  'these', 'they', 'those', 'also', 'back', 'down', 'even', 'here', 'make', 'many',
  'much', 'only', 'over', 'same', 'take', 'than', 'them', 'well', 'like', 'good', 'know',
  'question', 'problem', 'issue', 'info', 'information', 'description', 'example',
  'request', 'topic', 'summary', 'note', 'notes', 'thanks', 'help', 'lesson', 'guide',
  'thing', 'things', 'stuff', 'someone', 'anyone', 'everyone',
]);

const EN_GENERIC = new Set(['question', 'problem', 'issue', 'summary', 'example', 'request', 'topic']);

const ZH_STOPWORDS = new Set([
  '我们', '你', '我', '他', '她', '他们', '这是', '那个', '这个', '一下', '一下子', '可以', '能否', '吗',
  '今天', '明天', '昨天', '现在', '刚才', '之后', '然后', '接着', '但是', '不过', '因为', '所以',
  '如果', '那么', '怎么', '什么', '哪里', '为什么', '怎样', '多少', '几个', '一些', '很多',
  '非常', '比较', '特别', '一般', '应该', '可能', '或许', '大概', '也许', '肯定', '绝对',
  '真的', '假的', '对的', '错的', '好的', '不好', '知道', '不知道', '明白', '不明白',
  '谢谢', '感谢', '麻烦', '抱歉', '对不起', '没关系', '不要紧', '没问题', '当然', '其实',
  '本来', '原来', '已经', '还是', '还有', '而且', '另外', '此外', '总之', '最后',
  '继续', '开始', '结束', '出现', '发生', '进行', '觉得', '认为', '希望', '想要',
  // Polite prefixes and common question words (should not be tags)
  '你好', '您好', '请问', '请你', '帮我', '告诉', '能不', '如何', '怎么样', '为何',
  '介绍', '解释', '说明', '描述', '谈谈', '讲讲', '给我', '帮忙', '麻烦你',
  '什么是', '怎么做', '怎样做', '如何做', '能否', '可否', '可以吗',
  // Additional fragments that should be filtered
  '绍下', '介绍下', '讲解下', '说明下', '解释下', '能不能', '可不可',
  '么是', '么做', '么样', '你自己', '我自己', '用一句', '简要',
  // Overly generic nouns
  '问题', '说明', '事情', '内容', '情况', '方面', '东西', '事项', '讨论', '想法', '想法', '计划书',
  '总结', '例子', '示例', '提问', '疑问', '方案', '资料', '信息', '介绍', '概述', '主题',
]);
const ZH_NOISE_CHARS = new Set(['的', '了', '吧', '呢', '啊', '在', '是', '就', '着', '过', '得', '地']);

// Generic verb patterns that should not become tags
const ZH_GENERIC_VERBS = new Set([
  '聊聊', '看看', '想想', '说说', '做做', '试试', '听听', '走走', '玩玩', '吃吃',
  '请详', '请写', '用一', '你能', '我想', '帮我', '介绍下', '什么是自', '请你再',
]);

function isNoisyChineseToken(token) {
  if (!token) return true;
  if (ZH_STOPWORDS.has(token)) return true;
  if (ZH_GENERIC_VERBS.has(token)) return true;
  const chars = Array.from(token);
  if (chars.every((c) => ZH_NOISE_CHARS.has(c))) return true;
  // Filter tokens that start or end with noise chars
  if (ZH_NOISE_CHARS.has(chars[0])) return true;
  if (ZH_NOISE_CHARS.has(chars[chars.length - 1])) return true;
  return false;
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isMostlyNumeric(token) {
  if (!token) return false;
  const digits = (token.match(/\d/g) || []).length;
  return digits > 0 && digits / token.length >= 0.5;
}

function isYearLike(token) {
  return /^\d{4}$/.test(token) || /^\d{4}-\d{2}$/.test(token);
}

function codePointLength(str) {
  return Array.from(str || '').length;
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const tokens = [];
  const englishMatches = normalized.match(/[a-zA-Z]{3,}/g);
  if (englishMatches) {
    for (const w of englishMatches) {
      const lower = w.toLowerCase();
      if (!EN_STOPWORDS.has(lower) && !EN_GENERIC.has(lower) && codePointLength(lower) <= TAG_MAX_LEN) {
        tokens.push(lower);
      }
    }
  }
  const chineseChunks = normalized.match(/[\p{Script=Han}]+/gu);
  if (chineseChunks) {
    for (const chunk of chineseChunks) {
      if (isNoisyChineseToken(chunk)) continue;
      
      // Prefer complete meaningful phrases of 2-4 chars
      if (chunk.length >= 2 && chunk.length <= 4) {
        tokens.push(chunk);
      } else if (chunk.length === 5 || chunk.length === 6) {
        // For 5-6 char chunks, add the full chunk and 2-3 char sub-phrases
        tokens.push(chunk);
        for (let i = 0; i <= chunk.length - 2; i++) {
          const bigram = chunk.slice(i, i + 2);
          if (!isNoisyChineseToken(bigram)) tokens.push(bigram);
        }
        for (let i = 0; i <= chunk.length - 3; i++) {
          const trigram = chunk.slice(i, i + 3);
          if (!isNoisyChineseToken(trigram)) tokens.push(trigram);
        }
      } else if (chunk.length > 6) {
        // For very long chunks, extract 2-4 char phrases only
        const maxN = Math.min(chunk.length, 12);
        for (let i = 0; i < maxN - 1; i += 1) {
          const bg = chunk.slice(i, i + 2);
          if (!isNoisyChineseToken(bg)) tokens.push(bg);
          if (i < maxN - 2) {
            const tg = chunk.slice(i, i + 3);
            if (!isNoisyChineseToken(tg)) tokens.push(tg);
          }
          if (i < maxN - 3) {
            const fg = chunk.slice(i, i + 4);
            if (!isNoisyChineseToken(fg)) tokens.push(fg);
          }
        }
      }
    }
  }
  return tokens;
}

function buildSet(arr = []) {
  const set = new Set();
  for (const item of arr) {
    if (item) set.add(item);
  }
  return set;
}

function normalizeTag(token) {
  if (!token) return null;
  const cleaned = token
    .toString()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{Letter}\p{Number}_]/gu, '')
    .toLowerCase();
  if (!cleaned) return null;
  return cleaned.slice(0, TAG_MAX_LEN);
}

export function deriveTopicTag({ rootTopic = '', userText = '', recentTurns = [], recentTags = [] } = {}) {
  const rootTokens = buildSet(tokenize(rootTopic));
  const userTokens = tokenize(userText);
  const recentUserTexts = Array.isArray(recentTurns)
    ? recentTurns
        .filter((t) => (t?.role || 'user') === 'user')
        .map((t) => normalizeText(t.text))
        .filter(Boolean)
        .slice(-2)
    : [];

  const freq = new Map();
  const recordTokens = (sourceTokens) => {
    for (const t of sourceTokens) {
      if (!t || rootTokens.has(t)) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  };

  recordTokens(userTokens);
  for (const txt of recentUserTexts) {
    recordTokens(tokenize(txt));
  }

  let bestToken = null;
  let bestScore = 0;
  const isMeaningfulToken = (token) => {
    if (!token) return false;
    const len = codePointLength(token);
    if (len < 2 || len > TAG_MAX_LEN) return false;
    if (isMostlyNumeric(token) || isYearLike(token)) return false;
    const hasQuestionWord = ['如何', '怎么', '为什么', '为何', '什么', '哪里', '谁', '么是', '么做', '是什', '有多少', '多少个'].some((q) =>
      token.includes(q)
    );
    if (token.includes('吗') || token.includes('?') || token.includes('？')) return false;
    const hasCommandPhrase = ['请', '帮', '给', '告诉', '说', '介绍下', '讲解下', '解释下', '能不能', '可不可', '总结一下', '说明一下', '看看', '想想'].some((c) =>
      token.includes(c)
    );
    const hasPersonalRef = ['你自己', '我自己', '他自己', '你觉得', '我觉得'].some((p) => token.includes(p));
    const hasGenericModifier = ['用一句', '简要', '详细', '稍微', '再次', '具体细节', '一下子'].some((m) => token.includes(m));
    const isEnglish = /^[a-z0-9_]+$/i.test(token);
    if (isEnglish) {
      if (EN_STOPWORDS.has(token) || EN_GENERIC.has(token)) return false;
      if (token.length > TAG_MAX_LEN) return false;
      return true;
    }
    // Prefer longer meaningful tokens when scores are equal
    // This helps avoid fragments like "绍下" when "介绍" is available
    return (
      !ZH_GENERIC_VERBS.has(token) &&
      !ZH_STOPWORDS.has(token) &&
      !hasQuestionWord &&
      !hasCommandPhrase &&
      !hasPersonalRef &&
      !hasGenericModifier
    );
  };

  for (const [token, score] of freq.entries()) {
    if (!isMeaningfulToken(token)) continue;
    if (score > bestScore || (score === bestScore && token.length > (bestToken?.length || 0))) {
      bestToken = token;
      bestScore = score;
    }
  }

  // Scoring strategy:
  // - Prefer tokens with score >= 2 (repeated), BUT still validate quality
  // - If no repeated token, accept single-occurrence if it's meaningful (not too generic)
  // - Fallback to recent tags if nothing found
  let hasStrongCandidate = false;
  
  if (bestToken && bestScore >= 2) {
    // Repeated token: validate it's still meaningful
    hasStrongCandidate = isMeaningfulToken(bestToken);
  } else if (bestToken && bestScore === 1) {
    // Single occurrence: use the same validation
    hasStrongCandidate = isMeaningfulToken(bestToken);
  }
  
  const fallbackTag = recentTags.find((t) => typeof t === 'string' && t.trim().length > 0) || null;
  const chosen = hasStrongCandidate ? bestToken : fallbackTag;
  return normalizeTag(chosen);
}

export async function fetchRecentTopicTags(client, treeId, limit = 3) {
  if (!client || !treeId) return [];
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 3;
  const { rows } = await client.query(
    `SELECT topic_tag FROM nodes
     WHERE tree_id = $1 AND topic_tag IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [treeId, safeLimit]
  );
  return rows.map((r) => r.topic_tag).filter(Boolean);
}
