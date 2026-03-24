import { describe, it, expect } from 'vitest';
import { buildContextMessages } from '../services/llm/index.js';
import { resolveContextProfile } from '../services/llm/context_profiles.js';
import { CONTEXT_MESSAGE_LIMITS } from '../services/llm/context_limits.js';

const baseNormalized = {
  tree_id: 'tree-t',
  node_id: 'node-n',
  user_text: '请给出下一步行动建议',
  root_topic: '产品规划',
  path_summary: '我们讨论了产品定位和目标市场。',
  parent_summary: '你已完成市场调研并整理核心受众。',
  parent_full_text: '你已完成市场调研并整理核心受众。',
  tree_summary_text: '树总览：愿景、目标市场、路线图。',
  breadcrumb_titles: ['产品规划', '市场', '发布'],
  recent_turns: [
    { role: 'user', text: '谢谢，下一步呢？' },
    { role: 'assistant', text: '你可以汇总访谈结果。' },
    { role: 'user', text: '好的，请给我建议。' },
  ],
  memory_scope: 'tree',
  user_language: 'zh',
};

function approxTokens(text) {
  return Math.ceil((text || '').length / 4);
}

async function analyzeProfile(profile) {
  const messages = await buildContextMessages({
    ...baseNormalized,
    context_profile: profile,
  });
  const system = messages.find((m) => m.role === 'system');
  const systemContent = system?.content || '';
  // T50-1: New format has "- 近期对话:" followed by indented "  - role: text" entries
  // Count lines that match pattern "  - user:" or "  - assistant:" (indented dialogue entries)
  const dialogueLines = (systemContent.match(/\n\s+- (user|assistant):/gi) || []).length;
  return {
    systemContent,
    dialogueLines,
    // T50-1: New format uses "- 树概况:" and "- 路径:"
    hasTreeStory: systemContent.includes('- 树概况:'),
    hasPathBackground: systemContent.includes('- 路径:'),
    coreFactCount: (systemContent.match(/完成市场调研并整理核心受众/g) || []).length,
  };
}

describe('Context profiles semantic truth table (T39-3)', () => {
  it('does not enforce output budgets (maxTokens removed) for platform/BYOK', () => {
    const litePlatform = resolveContextProfile('lite', false);
    const liteByok = resolveContextProfile('lite', true);
    expect(liteByok.promptTokensBudget).toBe(litePlatform.promptTokensBudget);

    const standardPlatform = resolveContextProfile('standard', false);
    const standardByok = resolveContextProfile('standard', true);
    expect(standardByok.promptTokensBudget).toBe(standardPlatform.promptTokensBudget);
  });

  it('lite/standard/max apply distinct layer allocations and budgets', async () => {
    const lite = await analyzeProfile('lite');
    const standard = await analyzeProfile('standard');
    const max = await analyzeProfile('max');

    expect(lite.dialogueLines).toBeGreaterThanOrEqual(2); // T51-1: Lite now includes at least 2 recent dialogue turns
    expect(lite.hasTreeStory).toBe(false);
    expect(lite.hasPathBackground).toBe(true);

    expect(standard.dialogueLines).toBeGreaterThanOrEqual(3); // T51-1: Standard now includes 3+ turns
    expect(standard.hasTreeStory).toBe(true);

    expect(max.dialogueLines).toBeGreaterThanOrEqual(3); // T51-1: Max includes 3+ turns
    expect(max.hasTreeStory).toBe(true);
    expect(max.hasPathBackground).toBe(true);

    // T50-1: core fact may appear in both node_summary and core_facts (no dedup)
    // In this test data, parent_summary appears as both node and fact = count 2
    expect(lite.coreFactCount).toBeGreaterThanOrEqual(1);
    expect(standard.coreFactCount).toBeGreaterThanOrEqual(1);
    expect(max.coreFactCount).toBeGreaterThanOrEqual(1);
  });

  it('prompt size stays within budget ratio per profile', async () => {
    for (const profile of ['lite', 'standard', 'max']) {
      const { systemContent } = await analyzeProfile(profile);
      const isByok = profile === 'max'; // keep max without downgrade
      const { promptTokensBudget } = resolveContextProfile(profile, isByok);
      const totalTokens = approxTokens(systemContent) + approxTokens(baseNormalized.user_text);
      // Budget is for prompt construction; approxTokens() is rough, so keep it conservative.
      expect(totalTokens).toBeLessThanOrEqual(promptTokensBudget);
    }
  });

  it('layer labels are not duplicated', async () => {
    const { systemContent } = await analyzeProfile('standard');
    // T50-1: New format uses "- 近期对话:" and "- 路径:"
    const count = (systemContent.match(/- 近期对话:/g) || []).length;
    const pathCount = (systemContent.match(/- 路径:/g) || []).length;
    expect(count).toBe(1);
    expect(pathCount).toBe(1);
  });
});
