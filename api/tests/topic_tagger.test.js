import { describe, it, expect } from 'vitest';
import { deriveTopicTag } from '../services/topic/topic_tagger.js';

describe('topic_tagger deriveTopicTag', () => {
  it('picks repeated new noun distinct from root topic', () => {
    const tag = deriveTopicTag({
      rootTopic: '自我介绍',
      userText: '我最喜欢的火锅是番茄锅底，你吃过吗？',
      recentTurns: [
        { role: 'user', text: '北京的火锅店有推荐吗？' },
        { role: 'assistant', text: '可以看看大众点评。' },
      ],
    });
    expect(tag).toBe('火锅');
  });

  it('falls back to previous tags when no new noun', () => {
    const tag = deriveTopicTag({
      rootTopic: '旅行计划',
      userText: '继续聊聊吧',
      recentTurns: [],
      recentTags: ['tokyo'],
    });
    expect(tag).toBe('tokyo');
  });

  it('limits tag length and avoids numeric/time fragments', () => {
    const tag = deriveTopicTag({
      rootTopic: '年度计划',
      userText: '2024 年 OKR 和学习规划怎么做？',
      recentTurns: [{ role: 'user', text: 'Q4 roadmap 和 OKR 制定' }],
    });
    expect(tag).toBe('okr');
  });

  it('picks concise English tech term, not whole sentence', () => {
    const tag = deriveTopicTag({
      rootTopic: 'programming',
      userText: 'Want to learn Rust async basics and error handling.',
      recentTurns: [{ role: 'user', text: 'Any Rust resources?' }],
    });
    expect(tag).toBe('rust');
  });

  it('filters overly generic words and keeps concise Chinese term', () => {
    const tag = deriveTopicTag({
      rootTopic: '聊天',
      userText: '这是一个问题，但是更想聊编程',
      recentTurns: [{ role: 'user', text: '编程语言怎么选' }],
    });
    expect(tag).toBe('编程');
  });
});
