import { describe, it, expect } from 'vitest';
import { buildContextMessages } from '../services/llm/index.js';
import { ConversationStage } from '../services/llm/context_stage.js';

describe('context integration with intent and topic tags', () => {
  it('includes recent dialogue covering active topic tag', async () => {
    const messages = await buildContextMessages({
      tree_id: 't1',
      node_id: 'n1',
      user_text: '谢谢',
      intent: 'THANKS',
      root_topic: '自我介绍',
      topic_tag: 'coding',
      path_summary: '关于自我介绍与兴趣',
      parent_summary: '用户分享了个人信息和学习计划',
      parent_full_text: '',
      tree_summary_text: '',
      context_profile: 'standard',
      memory_scope: 'branch',
      user_language: 'zh',
      recent_turns: [
        { role: 'user', text: '我喜欢火锅', topic_tag: 'food' },
        { role: 'assistant', text: '好的，记下了', topic_tag: 'food' },
        { role: 'user', text: '我在学编程', topic_tag: 'coding' },
      ],
    });

    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeTruthy();
    // T50-1: Use new format with - 近期对话:
    const recentSection = system.content.split('- 近期对话:')[1] || system.content.split('- Recent:')[1] || '';
    expect(recentSection).toContain('我在学编程');
    expect(recentSection).not.toContain('我喜欢火锅');
  });

  // T50-1: Clean context serialization, no behavioral hints
  it('uses serialized context format without behavioral hints (T50-1)', async () => {
    const messages = await buildContextMessages({
      tree_id: 't1',
      node_id: 'n1',
      user_text: 'OK',
      intent: 'THANKS',
      root_topic: '旅行',
      topic_tag: '',
      path_summary: '旅行计划',
      parent_summary: '准备去东京',
      context_profile: 'lite',
      memory_scope: 'branch',
      user_language: 'zh',
      recent_turns: [],
    });
    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeTruthy();
    // T50-1: Should have context header
    expect(system.content).toContain('# 上下文');
    // T50-1: Should NOT have behavioral hints
    expect(system.content).not.toContain('用户刚刚表达感谢');
  });
});
