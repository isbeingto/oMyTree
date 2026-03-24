import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnswer, streamAnswer } from '../services/llm/index.js';

let lastCallOptions = null;
let lastCallMessages = null;
let isByokFlag = false;

vi.mock('../services/llm/providers/index.js', () => {
  return {
    resolveProviderForRequest: vi.fn(async () => ({
      provider: {
        callChat: vi.fn(async ({ options, messages }) => {
          lastCallOptions = options;
          lastCallMessages = messages;
          return { ai_text: 'ok', usage_json: {} };
        }),
        callChatStream: vi.fn(({ options }) => {
          lastCallOptions = options;
          async function* gen() {
            yield { type: 'delta', text: 'hi' };
            yield { type: 'usage', usage: { completion_tokens: 1 } };
          }
          return gen();
        }),
      },
      name: 'openai',
      isByok: isByokFlag,
      defaultModel: 'gpt-mock',
    })),
  };
});

describe('LLM context profile output limits (max_tokens removed)', () => {
  beforeEach(() => {
    lastCallOptions = null;
    lastCallMessages = null;
    isByokFlag = false;
  });

  it('uses lite profile defaults when not provided (platform)', async () => {
    await getAnswer(
      { tree_id: 'tree-1', node_id: 'node-1', user_text: 'hello world', path_summary: 'short path' },
      { userId: 'user-1' },
    );
    expect(lastCallOptions?.context_profile).toBe('lite');
    expect(lastCallOptions?.memory_scope).toBe('branch');
    expect(lastCallOptions?.max_tokens).toBeUndefined();
    const systemMsg = lastCallMessages?.find((m) => m.role === 'system');
    if (systemMsg) {
      expect(systemMsg.content.length).toBeLessThan(1500);
      // T50-1: lite profile should not include tree story
      expect(systemMsg.content).not.toContain('- 树概况:');
    }
  });

  it('downgrades max profile to standard when not BYOK', async () => {
    isByokFlag = false;
    await getAnswer(
      { tree_id: 'tree-2', node_id: 'node-2', user_text: 'hi there', context_profile: 'max' },
      { userId: 'user-2' },
    );
    expect(lastCallOptions?.context_profile).toBe('standard');
    expect(lastCallOptions?.max_tokens).toBeUndefined();
  });

  it('respects max profile when BYOK and streaming', async () => {
    isByokFlag = true;
    const result = await streamAnswer(
      { tree_id: 'tree-3', node_id: 'node-3', user_text: 'stream please', context_profile: 'max' },
      { userId: 'user-3' },
    );
    // callChatStream should have been invoked immediately
    expect(lastCallOptions?.context_profile).toBe('max');
    expect(lastCallOptions?.max_tokens).toBeUndefined();
    expect(result?.context_profile).toBe('max');
  });

  it('builds tree scope system message with summary and truncation', async () => {
    isByokFlag = true;
    const longSummary = 'S'.repeat(2000);
    const longParent = 'parent '.repeat(400);
    const { TREE_SUMMARY_LIMIT, CONTEXT_MESSAGE_LIMITS } = await import('../services/llm/context_limits.js');
    const expectedCap = TREE_SUMMARY_LIMIT + CONTEXT_MESSAGE_LIMITS.max.parentFull + CONTEXT_MESSAGE_LIMITS.max.pathSummary + 400;
    await getAnswer(
      {
        tree_id: 'tree-4',
        node_id: 'node-4',
        user_text: 'need tree scope',
        context_profile: 'max',
        memory_scope: 'tree',
        tree_summary_text: longSummary,
        parent_full_text: longParent,
        path_summary: 'path '.repeat(100),
        user_language: 'zh',
      },
      { userId: 'user-4' }
    );

    const systemMsg = lastCallMessages?.find((m) => m.role === 'system');
    expect(systemMsg).toBeTruthy();
    // T50-1: Should contain tree story with new label
    expect(systemMsg.content).toContain('- 树概况:');
    // Should be clamped roughly to configured limit with some buffer for labels
    expect(systemMsg.content.length).toBeLessThan(expectedCap + 400);
  });
});
