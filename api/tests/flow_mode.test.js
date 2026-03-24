import { describe, it, expect } from 'vitest';
import { FlowMode, inferFlowMode, inferFlowModeResult } from '../services/llm/flow_mode.js';
import { Intent } from '../services/llm/intent_classifier.js';

// T50-2: Tests now only verify inference logic, not behavioral content

describe('flow_mode inference', () => {
  it('detects CLOSE for thanks intent', () => {
    const mode = inferFlowMode({ intent: Intent.THANKS, userText: '谢谢你' });
    expect(mode).toBe(FlowMode.CLOSE);
  });

  it('detects SUMMARY from intent or keywords', () => {
    const fromIntent = inferFlowMode({ intent: Intent.ASK_SUMMARY, userText: '帮我总结一下' });
    expect(fromIntent).toBe(FlowMode.SUMMARY);

    const fromKeyword = inferFlowMode({ intent: Intent.ASK_INFO, userText: '请给我一个recap' });
    expect(fromKeyword).toBe(FlowMode.SUMMARY);
  });

  it('detects PLAN when planning words present or topic tag hints', () => {
    const fromText = inferFlowMode({ intent: Intent.ASK_INFO, userText: '帮我规划一周学习计划' });
    expect(fromText).toBe(FlowMode.PLAN);

    const fromTag = inferFlowMode({ intent: Intent.ASK_INFO, userText: '继续', topicTag: '学习roadmap' });
    expect(fromTag).toBe(FlowMode.PLAN);
  });

  it('detects EXPLAIN for why/how questions', () => {
    const mode = inferFlowMode({ intent: Intent.ASK_INFO, userText: '为什么索引会失效？' });
    expect(mode).toBe(FlowMode.EXPLAIN);
  });

  it('defaults to QA for regular questions or small talk', () => {
    const qaMode = inferFlowMode({ intent: Intent.ASK_INFO, userText: 'Redis 怎么持久化？' });
    expect(qaMode).toBe(FlowMode.QA);

    const clarifyMode = inferFlowMode({ intent: Intent.CLARIFY, userText: '你指的是哪个版本？' });
    expect(clarifyMode).toBe(FlowMode.QA);
  });

  it('marks broad topic for short abstract asks', () => {
    const result = inferFlowModeResult({ intent: Intent.ASK_INFO, userText: '介绍下美国南北战争' });
    expect(result.isBroadTopic).toBe(true);

    const narrow = inferFlowModeResult({ intent: Intent.ASK_INFO, userText: 'Redis 怎么配置 AOF 持久化？' });
    expect(narrow.isBroadTopic).toBe(false);
  });
});

// T50-2: Removed behavioral description tests (describeFlowMode, describeBroadTopicConstraint deleted)
