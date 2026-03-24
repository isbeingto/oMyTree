import { describe, it, expect } from 'vitest';
import { Intent, classifyIntent } from '../services/llm/intent_classifier.js';

describe('intent_classifier rules', () => {
  it('detects summary requests', () => {
    const intent = classifyIntent({
      userText: '你能完整总结一下刚才的内容吗？',
    });
    expect(intent).toBe(Intent.ASK_SUMMARY);
  });

  it('detects gratitude', () => {
    const intent = classifyIntent({
      userText: '谢谢，今天就到这儿',
    });
    expect(intent).toBe(Intent.THANKS);
  });

  it('detects topic switch', () => {
    const intent = classifyIntent({
      userText: '我们换个话题聊聊投资策略吧',
    });
    expect(intent).toBe(Intent.NEW_TOPIC);
  });

  it('detects clarify intent', () => {
    const intent = classifyIntent({
      userText: '你指的是哪个版本？',
    });
    expect(intent).toBe(Intent.CLARIFY);
  });

  it('detects small talk', () => {
    const intent = classifyIntent({
      userText: 'hi, how are you',
    });
    expect(intent).toBe(Intent.SMALL_TALK);
  });

  it('falls back to ask info when question-like', () => {
    const intent = classifyIntent({
      userText: '请问接下来怎么做？',
    });
    expect(intent).toBe(Intent.ASK_INFO);
  });
});
