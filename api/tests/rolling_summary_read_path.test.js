import { describe, it, expect, vi } from 'vitest';

async function loadBuildContextMessages({ enabled }) {
  const previous = process.env.ROLLING_SUMMARY_ENABLED;
  process.env.ROLLING_SUMMARY_ENABLED = enabled ? 'true' : '0';
  vi.resetModules();
  const mod = await import('../services/llm/index.js');
  if (typeof previous === 'undefined') {
    delete process.env.ROLLING_SUMMARY_ENABLED;
  } else {
    process.env.ROLLING_SUMMARY_ENABLED = previous;
  }
  return mod.buildContextMessages;
}

describe('P0 rolling summary read-path integration', () => {
  it('includes History layer when ROLLING_SUMMARY_ENABLED is on', async () => {
    const buildContextMessages = await loadBuildContextMessages({ enabled: true });
    const messages = await buildContextMessages({
      tree_id: 'tree-1',
      user_text: 'Next question',
      root_topic: 'Topic',
      path_summary: 'path',
      parent_summary: 'parent',
      rolling_summary: { text: 'compressed history' },
      parent_full_text: '',
      tree_summary_text: '',
      breadcrumb_titles: ['Root', 'Branch'],
      recent_turns: [{ role: 'assistant', text: 'previous answer' }],
      context_profile: 'standard',
      memory_scope: 'branch',
      user_language: 'en',
    });

    const system = messages.find((m) => m.role === 'system');
    expect(system?.content).toContain('- History: compressed history');
  });

  it('omits History layer when ROLLING_SUMMARY_ENABLED is off', async () => {
    const buildContextMessages = await loadBuildContextMessages({ enabled: false });
    const messages = await buildContextMessages({
      tree_id: 'tree-1',
      user_text: 'Next question',
      root_topic: 'Topic',
      path_summary: 'path',
      parent_summary: 'parent',
      rolling_summary: { text: 'compressed history' },
      parent_full_text: '',
      tree_summary_text: '',
      breadcrumb_titles: ['Root', 'Branch'],
      recent_turns: [{ role: 'assistant', text: 'previous answer' }],
      context_profile: 'standard',
      memory_scope: 'branch',
      user_language: 'en',
    });

    const system = messages.find((m) => m.role === 'system');
    expect(system?.content || '').not.toContain('- History:');
  });
});
