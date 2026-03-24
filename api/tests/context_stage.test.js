import { describe, it, expect } from 'vitest';
import { buildContextMessages } from '../services/llm/index.js';
import {
  ConversationStage,
  buildNarrativeFrame,
  detectConversationStage,
} from '../services/llm/context_stage.js';

describe('context_stage detection', () => {
  it('picks the latest user turn for gratitude detection', () => {
    const stage = detectConversationStage({
      userText: '',
      recentTurns: [
        { role: 'user', text: '之前的问题' },
        { role: 'assistant', text: '回答' },
        { role: 'user', text: '谢谢你的帮助！' },
      ],
    });

    expect(stage).toBe(ConversationStage.GRATITUDE);
  });
});

// T50-0: buildNarrativeFrame now returns empty string
describe('narrative frame (T50-0: behavioral content removed)', () => {
  it('returns empty for all stages', () => {
    const frame = buildNarrativeFrame({
      userLang: 'zh',
      topic: '自我介绍',
      stage: ConversationStage.GRATITUDE,
    });

    expect(frame).toBe('');
  });
});

// T50-1: buildContextMessages uses serializeContext for clean output
describe('buildContextMessages serialized context (T50-1)', () => {
  it('contains # Context header and structured fields without behavioral instructions', async () => {
    const messages = await buildContextMessages({
      tree_id: 'tree-1',
      user_text: '谢谢你的总结！',
      root_topic: '自我介绍',
      path_summary: '关于我的介绍',
      parent_summary: '用户分享了背景信息',
      parent_full_text: '',
      tree_summary_text: '',
      breadcrumb_titles: ['根节点', '分支', '叶子'],
      recent_turns: [{ role: 'assistant', text: '这是你的总结' }],
      context_profile: 'standard',
      memory_scope: 'branch',
      user_language: 'zh',
    });

    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeTruthy();
    // T50-1: Should contain context header
    expect(system.content).toContain('# 上下文');
    // T50-1: Should contain topic
    expect(system.content).toContain('- 主题: 自我介绍');
    // T50-1: Should NOT contain old behavioral hints or headers
    expect(system.content).not.toContain('用户刚刚表达感谢');
    expect(system.content).not.toContain('你正在帮助用户完成');
    expect(system.content).not.toContain('以下是从用户知识树中提取');  // T50-0 header removed in T50-1
  });
});
