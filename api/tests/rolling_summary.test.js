import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const summaryStore = new Map();
let providerShouldThrow = false;

vi.mock('../services/llm/rolling_summary_store.js', () => ({
  getRollingSummary: async (nodeId) => summaryStore.get(String(nodeId)) || null,
  saveRollingSummary: async (nodeId, rollingSummary) => {
    summaryStore.set(String(nodeId), rollingSummary);
    return rollingSummary;
  },
}));

vi.mock('../services/llm/providers/index.js', () => ({
  resolveProviderForRequest: async () => ({
    provider: {
      callChat: async ({ prompt }) => {
        if (providerShouldThrow) {
          throw new Error('LLM_FAILED');
        }
        return {
          ai_text: `ROLLING_SUMMARY_OK\n${String(prompt).slice(0, 50)}`,
          model: 'mock-model',
        };
      },
    },
    name: 'mock',
    defaultModel: 'mock-model',
    isByok: false,
  }),
}));

import {
  decideCompression,
  generateRollingSummary,
  processRollingSummary,
  getBufferSize,
} from '../services/llm/rolling_summary.js';

function makeTurns(count) {
  const turns = [];
  for (let i = 1; i <= count; i += 1) {
    turns.push({ id: String(i), role: i % 2 === 0 ? 'assistant' : 'user', text: `Turn ${i}` });
  }
  return turns;
}

describe('P0 rolling summary', () => {
  const originalEnabled = process.env.ROLLING_SUMMARY_ENABLED;

  beforeEach(() => {
    summaryStore.clear();
    providerShouldThrow = false;
    process.env.ROLLING_SUMMARY_ENABLED = 'true';
  });

  afterEach(() => {
    process.env.ROLLING_SUMMARY_ENABLED = originalEnabled;
  });

  it('getBufferSize matches context profile defaults', () => {
    expect(getBufferSize('lite')).toBe(2);
    expect(getBufferSize('standard')).toBe(4);
    expect(getBufferSize('max')).toBe(6);
  });

  it('does not compress when turns <= buffer', () => {
    const turns = makeTurns(2);
    const decision = decideCompression({ allTurns: turns, bufferSize: 2, existingSummary: null });
    expect(decision.needCompress).toBe(false);
    expect(decision.turnsToCompress.length).toBe(0);
    expect(decision.bufferTurns.length).toBe(2);
  });

  it('compresses initial span and keeps buffer intact', () => {
    const turns = makeTurns(6); // oldest -> newest
    const decision = decideCompression({ allTurns: turns, bufferSize: 2, existingSummary: null });
    expect(decision.needCompress).toBe(true);
    expect(decision.turnsToCompress.map((t) => t.id)).toEqual(['1', '2', '3', '4']);
    expect(decision.bufferTurns.map((t) => t.id)).toEqual(['5', '6']);
    expect(decision.lastNodeId).toBe('4');
  });

  it('compresses incrementally after last_node_id', () => {
    const turns = makeTurns(7);
    const existingSummary = { text: 'old', meta: { last_node_id: '2', compressed_turn_count: 2 } };
    const decision = decideCompression({ allTurns: turns, bufferSize: 2, existingSummary });
    expect(decision.needCompress).toBe(true);
    expect(decision.turnsToCompress.map((t) => t.id)).toEqual(['3', '4', '5']);
    expect(decision.bufferTurns.map((t) => t.id)).toEqual(['6', '7']);
  });

  it('generateRollingSummary produces text+meta and increments compressed_turn_count', async () => {
    const turnsToCompress = makeTurns(4);
    const existing = { text: 'old summary', meta: { last_node_id: '1', compressed_turn_count: 1, created_at: '2026-01-01T00:00:00Z' } };

    const out = await generateRollingSummary({
      turnsToCompress,
      existingSummary: existing,
      context: { topic: 't', userLanguage: 'en' },
      userId: 'user-1',
      profile: 'lite',
    });

    expect(typeof out.text).toBe('string');
    expect(out.meta.last_node_id).toBe('4');
    expect(out.meta.compressed_turn_count).toBe(1 + 4);
    expect(out.meta.created_at).toBe('2026-01-01T00:00:00Z');
    expect(out.meta.updated_at).toBeTruthy();
  });

  it('processRollingSummary persists and reuses stored summary', async () => {
    const nodeId = 'node-1';
    const turns = makeTurns(6);

    const first = await processRollingSummary({
      nodeId,
      pathTurns: turns,
      profile: 'lite',
      context: { topic: 't', userLanguage: 'en' },
      userId: 'user-1',
    });

    expect(first.rollingSummary).toBeTruthy();
    expect(first.bufferTurns.map((t) => t.id)).toEqual(['5', '6']);

    const second = await processRollingSummary({
      nodeId,
      pathTurns: turns,
      profile: 'lite',
      context: { topic: 't', userLanguage: 'en' },
      userId: 'user-1',
    });

    expect(second.rollingSummary).toBe(first.rollingSummary);
    expect(second.bufferTurns.map((t) => t.id)).toEqual(['5', '6']);
  });

  it('fails open when LLM call fails', async () => {
    providerShouldThrow = true;
    const nodeId = 'node-2';
    const turns = makeTurns(6);

    const result = await processRollingSummary({
      nodeId,
      pathTurns: turns,
      profile: 'lite',
      context: { topic: 't', userLanguage: 'en' },
      userId: 'user-1',
    });

    expect(result.rollingSummary).toBeNull();
    expect(result.bufferTurns.map((t) => t.id)).toEqual(['5', '6']);
  });
});

