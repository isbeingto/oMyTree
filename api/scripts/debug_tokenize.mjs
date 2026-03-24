import { deriveTopicTag } from '../services/topic/topic_tagger.js';

// Import internal functions by copying them
const ZH_STOPWORDS = new Set(['我们', '你', '我', '他', '她', '他们', '这是', '那个', '这个', '一下', '一下子', '可以', '能否', '吗',
  '今天', '明天', '昨天', '现在', '刚才', '之后', '然后', '接着', '但是', '不过', '因为', '所以',
  '如果', '那么', '怎么', '什么', '哪里', '为什么', '怎样', '多少', '几个', '一些', '很多',
  '非常', '比较', '特别', '一般', '应该', '可能', '或许', '大概', '也许', '肯定', '绝对',
  '真的', '假的', '对的', '错的', '好的', '不好', '知道', '不知道', '明白', '不明白',
  '谢谢', '感谢', '麻烦', '抱歉', '对不起', '没关系', '不要紧', '没问题', '当然', '其实',
  '本来', '原来', '已经', '还是', '还有', '而且', '另外', '此外', '总之', '最后',
  '继续', '开始', '结束', '出现', '发生', '进行', '觉得', '认为', '希望', '想要',
]);
const ZH_NOISE_CHARS = new Set(['的', '了', '吧', '呢', '啊', '在', '是', '就', '着', '过', '得', '地']);
const ZH_GENERIC_VERBS = new Set(['聊聊', '看看', '想想', '说说', '做做', '试试', '听听', '走走', '玩玩', '吃吃']);

function isNoisyChineseToken(token) {
  if (!token) return true;
  if (ZH_STOPWORDS.has(token)) return true;
  if (ZH_GENERIC_VERBS.has(token)) return true;
  const chars = Array.from(token);
  if (chars.every((c) => ZH_NOISE_CHARS.has(c))) return true;
  if (ZH_NOISE_CHARS.has(chars[0]) && token.length <= 3) return true;
  if (ZH_NOISE_CHARS.has(chars[chars.length - 1]) && token.length <= 3) return true;
  return false;
}

const text = '继续聊聊吧';
const normalized = text.trim();
const chineseChunks = normalized.match(/[\p{Script=Han}]+/gu);
console.log('Input:', text);
console.log('Chinese chunks:', chineseChunks);
console.log('Is noisy?', isNoisyChineseToken(text));
console.log('Length:', text.length);
console.log('In stopwords?', ZH_STOPWORDS.has(text));
console.log('In generic verbs?', ZH_GENERIC_VERBS.has(text));
console.log('Ends with noise char?', ZH_NOISE_CHARS.has(text[text.length - 1]));

const tag = deriveTopicTag({
  rootTopic: '旅行计划',
  userText: text,
  recentTurns: [],
  recentTags: ['tokyo'],
});
console.log('Result tag:', tag);
