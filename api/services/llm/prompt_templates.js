const DEFAULT_PLACEHOLDER = '（未提供）';

function normalizeOptional(value) {
  if (value === null || value === undefined) {
    return DEFAULT_PLACEHOLDER;
  }
  const text = value.toString().trim();
  return text.length > 0 ? text : DEFAULT_PLACEHOLDER;
}

function normalizeUserText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export function buildMinimalAnswerPrompt(payload = {}) {
  const userText = normalizeUserText(payload.user_text || payload.userText || '');
  const pathSummary = normalizeOptional(payload.path_summary ?? payload.pathSummary);
  const parentSummary = normalizeOptional(payload.parent_summary ?? payload.parentSummary);

  return [
    '用户问题：',
    userText,
    '',
    '可选的路径摘要：',
    pathSummary,
    '',
    '可选的父级摘要：',
    parentSummary,
    '',
    '请用简洁中文回答，限制在 80 字以内。',
  ].join('\n');
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeRecentTurns(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const roleRaw = typeof item.role === 'string' ? item.role.trim().toLowerCase() : 'user';
      const text = normalizeUserText(item.text || item.content || '');
      if (!text) {
        return null;
      }
      const role = roleRaw === 'ai' || roleRaw === 'assistant' ? 'AI' : '用户';
      return { role, text };
    })
    .filter(Boolean)
    .slice(-4);
}

export function buildRelevancePrompt(payload = {}) {
  const topic = normalizeOptional(payload.topic || payload.root_topic);
  const breadcrumb = normalizeArray(payload.breadcrumb || payload.path || []);
  const breadcrumbText = breadcrumb.length > 0 ? breadcrumb.join(' ＞ ') : DEFAULT_PLACEHOLDER;
  const parentSummaryObj = payload.parent_summary || payload.parentSummary || {};
  const pathSummaryText = normalizeOptional(
    payload.path_summary ?? parentSummaryObj?.path_summary
  );
  const parentSummaryText = normalizeOptional(
    payload.parent_summary_text ?? parentSummaryObj?.parent_summary
  );
  const userText = normalizeUserText(payload.user_text || payload.userText || '');

  return [
    '你是一个对话相关性评审员。请判断用户的新问题与当前话题的关系，并仅输出 JSON。',
    '',
    `根主题：${topic}`,
    `面包屑：${breadcrumbText}`,
    `路径摘要：${pathSummaryText}`,
    `父节点摘要：${parentSummaryText}`,
    '',
    '用户问题：',
    userText || '（空白）',
    '',
    '分类标准：',
    '- "in": 明显延续当前话题，继续在原节点讨论；',
    '- "side": 与当前主题有关，但应开支线；',
    '- "new": 完全不相关，应新开树。',
    '',
    'Few-shot 示例：',
    '1) 上下文讨论「分布式数据库容灾」，用户问「请继续给我更多容灾方案」，输出 {"classification":"in","confidence":0.94,"reason":"延续容灾方案"}.',
    '2) 上下文讨论「五轴加工流程」，用户问「有没有其他材质的示例？」→ {"classification":"side","confidence":0.72,"reason":"同主题的支线需求"}.',
    '3) 上下文讨论「云原生安全」，用户问「推荐几个旅游城市」→ {"classification":"new","confidence":0.05,"reason":"完全不同主题"}.',
    '',
    '输出要求：仅输出 JSON，对象必须包含且仅包含以下字段：',
    '{',
    '  "classification": "in" | "side" | "new",',
    '  "confidence": 0-1 之间的小数，保留 2 位,',
    '  "reason": "中文简短理由 (≤ 20 字)"',
    '}',
    '禁止输出额外文字。',
  ].join('\n');
}

export function buildSummarizePrompt(payload = {}) {
  const topic = normalizeOptional(payload.topic || payload.root_topic);
  const breadcrumb = normalizeArray(payload.breadcrumb || payload.path || []);
  const breadcrumbText = breadcrumb.length > 0 ? breadcrumb.join(' ＞ ') : DEFAULT_PLACEHOLDER;
  const parentText = normalizeOptional(payload.parent_text || payload.parentText);
  const parentSummary = normalizeOptional(payload.parent_summary || payload.parentSummary);
  const pathSummary = normalizeOptional(payload.path_summary || payload.pathSummary);
  const nodeText = normalizeOptional(payload.node_text || payload.nodeText || payload.user_text || payload.userText);
  const recentTurns = normalizeRecentTurns(payload.recent_turns || payload.recentTurns);

  let turnsBlock = DEFAULT_PLACEHOLDER;
  if (recentTurns.length > 0) {
    turnsBlock = recentTurns
      .map((turn, index) => `${index + 1}. ${turn.role}：${turn.text}`)
      .join('\n');
  }

  const instructions = [
    '你是 Lens 的对话摘要助手，需要基于上下文生成两个字段：',
    '1) path_summary：描述当前节点所在路径的关键信息；',
    '2) parent_summary：概括父节点的主旨与下一步方向。',
    '',
    '输出要求：',
    '- 全部使用简洁中文，避免客套；',
    '- 每个字段 ≤ 3 句话，≤ 150 个中文字符，可包含片段句；',
    '- 严禁逐字复读原文，突出要点；',
    '- 仅输出 JSON：{"path_summary":"...","parent_summary":"..."}。',
  ];

  const contextBlock = [
    `根主题：${topic}`,
    `路径面包屑：${breadcrumbText}`,
    `父节点原文：${parentText}`,
    `现有父级摘要：${parentSummary}`,
    `现有路径摘要：${pathSummary}`,
    `当前节点内容：${nodeText}`,
    '最近对话片段：',
    turnsBlock,
  ];

  return [...instructions, '', '请基于上面的上下文生成 JSON，字段含义：', '{',
    '  "path_summary": "路径摘要 ≤ 150 字",',
    '  "parent_summary": "父级摘要 ≤ 150 字"',
    '}',
    '禁止输出任何解释或 Markdown，只能是 JSON。',
    '',
    ...contextBlock,
  ].join('\n');
}

export function buildTopicSemanticGuardPrompt(payload = {}) {
  const topic = normalizeOptional(payload.tree_topic || payload.topic || payload.root_topic);
  const originalText = normalizeOptional(payload.original_text || payload.originalText);
  const newText = normalizeOptional(payload.new_text || payload.newText);
  const breadcrumb = normalizeArray(payload.breadcrumb || payload.path || []);
  const breadcrumbText = breadcrumb.length > 0 ? breadcrumb.join(' ＞ ') : DEFAULT_PLACEHOLDER;

  return [
    '你是主题语义守卫，需要判断根节点改写是否保持语义。',
    '允许轻量润色、补充限定语；禁止改换主题或引入无关场景。',
    '',
    `树当前主题：${topic}`,
    `面包屑：${breadcrumbText}`,
    `旧文本：${originalText}`,
    `拟新文本：${newText}`,
    '',
    '请输出严格 JSON，仅包含：',
    '{',
    '  "equivalent": true|false,',
    '  "score": 0~1 的小数,',
    '  "diff_summary": "中文 ≤80 字，描述差异"',
    '}',
    '禁止添加额外文字或换行解释。',
  ].join('\n');
}

/**
 * Build a prompt to generate a short topic/title from a user's first question.
 * The generated title should be 3-10 characters, concise and descriptive.
 */
export function buildTopicGenerationPrompt(payload = {}) {
  const userText = normalizeUserText(payload.user_text || payload.userText || '');

  return [
    '你是标题生成助手。请根据用户的问题，生成一个简短的对话主题标题。',
    '',
    '要求：',
    '- 长度：3-10 个字（中文）或 3-10 个单词（英文/其他语言）',
    '- 语言：与用户问题相同的语言',
    '- 风格：简洁有力，直击主题',
    '- 不要使用引号、标点符号',
    '- 不要添加"关于"、"探讨"等前缀',
    '',
    '用户问题：',
    userText || '（空白）',
    '',
    '请直接输出标题，不要有任何解释或额外文字。',
  ].join('\n');
}
