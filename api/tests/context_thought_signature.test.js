import { describe, it, expect } from 'vitest';
import { buildContextMessages } from '../services/llm/index.js';

// This test verifies Phase 2 (2.4/2.5): history thought_signature is loaded into
// buildContextMessages output (as explicit messages) when using Gemini 3.

describe('context thought signatures (Gemini 3)', () => {
  it('omits recent dialogue from system context and emits assistant messages with thoughtSignature', async () => {
    const messages = await buildContextMessages({
      tree_id: 'tree-1',
      user_text: 'Q2',
      root_topic: 'topic',
      path_summary: 'path',
      parent_summary: 'parent',
      parent_full_text: '',
      tree_summary_text: '',
      breadcrumb_titles: [],
      // recent_turns is most-recent-first in production
      recent_turns: [
        {
          role: 'assistant',
          text: 'A1',
          reasoning_content: 'reasoning',
          thought_signature: 'sig-123',
        },
        { role: 'user', text: 'Q1' },
      ],
      context_profile: 'lite',
      memory_scope: 'branch',
      user_language: 'zh',
    }, {
      providerName: 'gemini',
      model: 'gemini-3-pro-preview',
    });

    const system = messages.find((m) => m.role === 'system');
    expect(system).toBeTruthy();
    // In signature mode, we do not duplicate recent dialogue inside system context.
    expect(system.content).not.toContain('- 近期对话:');

    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();
    expect(assistant.thoughtSignature).toBe('sig-123');
  });
});
