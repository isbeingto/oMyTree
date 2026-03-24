function shortId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'node';
  }
  return value.slice(0, 8);
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function stripParenthetical(text) {
  return normalizeText(text).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
}

function containsForbiddenKeyword(text) {
  const lowercase = normalizeText(text).toLowerCase();
  const forbidden = ['炒股', '赚钱', '暴富', 'stock', 'trading'];
  return forbidden.some((keyword) => lowercase.includes(keyword));
}

function buildTopicGuardPayload(metadata = {}) {
  const original = normalizeText(metadata.original_text || metadata.originalText);
  const proposed = normalizeText(metadata.new_text || metadata.newText);
  const baseOriginal = stripParenthetical(original);
  const baseProposed = stripParenthetical(proposed);

  if (!proposed) {
    return {
      equivalent: false,
      score: 0,
      diff_summary: '新文本为空',
      source: 'rules',
    };
  }

  if (containsForbiddenKeyword(proposed) && !containsForbiddenKeyword(original)) {
    return {
      equivalent: false,
      score: 0.1,
      diff_summary: '新文本包含无关的投机类词汇',
      source: 'rules',
    };
  }

  if (proposed.startsWith(original) || baseProposed === baseOriginal) {
    return {
      equivalent: true,
      score: 0.95,
      diff_summary: '仅做轻量修饰或补充说明',
      source: 'rules',
    };
  }

  // 检测明显的语义偏离
  const originalWords = new Set(baseOriginal.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const proposedWords = new Set(baseProposed.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  let commonWords = 0;
  for (const word of originalWords) {
    if (proposedWords.has(word)) commonWords++;
  }

  const overlapRatio = originalWords.size > 0 ? commonWords / originalWords.size : 0;

  // 如果重叠率 < 30%，认为语义偏离
  if (overlapRatio < 0.3) {
    return {
      equivalent: false,
      score: 0.2 + overlapRatio * 0.5,
      diff_summary: '主题核心词汇差异较大，疑似语义偏离',
      source: 'rules',
    };
  }

  // 检测是否包含 "completely unrelated" 等明显偏离标记
  if (proposed.toLowerCase().includes('completely unrelated') ||
    proposed.toLowerCase().includes('totally different') ||
    proposed.toLowerCase().includes('无关')) {
    return {
      equivalent: false,
      score: 0.1,
      diff_summary: '新文本明确标注为无关主题',
      source: 'rules',
    };
  }

  return {
    equivalent: true,
    score: 0.86,
    diff_summary: '语义保持一致，仅微调措辞',
    source: 'rules',
  };
}

import { LLMProvider } from './base.js';

/**
 * Mock Provider 实现
 * 用于测试和开发环境，不需要真实 API 调用
 */
class MockProvider extends LLMProvider {
  constructor() {
    super({
      id: 'mock',
      name: 'Mock Provider',
      description: '用于测试和开发的模拟 Provider',
    });
  }

  isAvailable() {
    return true; // Mock provider 始终可用
  }

  async callChat({ prompt, options = {}, metadata = {} } = {}) {
    const mode = typeof options.mode === 'string' ? options.mode : 'text';

    if (mode === 'force_error') {
      throw new Error('mock provider forced error');
    }

    if (mode === 'memo') {
      const payload = {
        bullets: [
          { text: '(mock) Progress checkpoint 1', anchors: [] },
          { text: '(mock) Progress checkpoint 2', anchors: [] },
          { text: '(mock) Progress checkpoint 3', anchors: [] },
        ],
      };
      return {
        ai_text: JSON.stringify(payload),
        parsed_json: payload,
        usage_json: null,
      };
    }

    if (mode === 'relevance') {
      const payload = {
        classification: 'in',
        confidence: 0.64,
        reason: 'mock relevance',
      };
      return {
        ai_text: JSON.stringify(payload),
        parsed_json: payload,
        usage_json: null,
      };
    }

    if (mode === 'topic_guard') {
      const payload = buildTopicGuardPayload(metadata);
      return {
        ai_text: JSON.stringify(payload),
        parsed_json: payload,
        usage_json: null,
      };
    }

    if (mode === 'summarize') {
      const suffix = shortId(metadata?.nodeId || metadata?.node_id);
      const payload = {
        path_summary: `（mock）路径摘要 ${suffix}`,
        parent_summary: `（mock）父级摘要 ${suffix}`,
      };
      return {
        ai_text: JSON.stringify(payload),
        parsed_json: payload,
        usage_json: null,
      };
    }

    const patch = {
      memory_patch: {
        node_digest: metadata?.nodeId || metadata?.node_id || null,
        ledger_updates: [
          {
            kind: 'claim',
            subkind: 'fact',
            text: '(mock) 本轮新增事实片段',
            sources: ['provider:mock'],
            confidence: 0.8,
          },
          {
            kind: 'open_loop',
            subkind: 'question',
            text: '(mock) 后续需要澄清的问题',
            sources: ['provider:mock'],
          },
        ],
      },
    };

    return {
      ai_text: '(mock) 暂无法生成回答\n\n```json\n' + JSON.stringify(patch) + '\n```',
      usage_json: null,
    };
  }
}

// 单例导出
export const mockProviderInstance = new MockProvider();

// 向后兼容：保留原有的函数式 API
export async function mockProvider(params) {
  return mockProviderInstance.callChat(params);
}
