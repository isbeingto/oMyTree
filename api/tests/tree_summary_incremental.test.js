// T47-1: Tree Summary v3 - Incremental Update Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { __private__ } from '../services/tree/tree_summary.js';

const { selectUpdateMode, buildIncrementalPrompt, buildCompressPrompt } = __private__;

describe('Tree Summary v3 - Incremental Update', () => {
  describe('selectUpdateMode', () => {
    it('should select "full" for first-time generation', () => {
      const treeRow = {
        tree_summary: null,
        node_count: 10,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "full" when semantic is missing', () => {
      const treeRow = {
        tree_summary: { text: 'some text', meta: {} },
        node_count: 10,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "full" on topic switch', () => {
      const treeRow = {
        tree_summary: {
          semantic: { themes: [] },
          meta: { last_topic_tag: 'old_topic', version: 3 },
        },
        node_count: 10,
      };
      const mode = selectUpdateMode(treeRow, { topicTag: 'new_topic' });
      expect(mode).toBe('full');
    });

    it('should select "full" when delta >= 20 nodes', () => {
      const treeRow = {
        tree_summary: {
          semantic: { themes: [] },
          meta: { last_node_count: 10, version: 3 },
        },
        node_count: 35, // delta = 25
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "full" for old summary version', () => {
      const treeRow = {
        tree_summary: {
          semantic: { themes: [] },
          meta: { version: 2, last_node_count: 10 },
        },
        node_count: 15,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "full" after 5 consecutive incremental updates', () => {
      const treeRow = {
        tree_summary: {
          semantic: { themes: [] },
          meta: { version: 3, last_node_count: 10, incremental_count: 5 },
        },
        node_count: 15,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "full" if last full refresh > 7 days ago', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const treeRow = {
        tree_summary: {
          semantic: { themes: [] },
          meta: {
            version: 3,
            last_node_count: 10,
            last_full_refresh_at: eightDaysAgo,
          },
        },
        node_count: 15,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('full');
    });

    it('should select "incremental-compress" when summary is too long', () => {
      const longText = 'a'.repeat(750);
      const treeRow = {
        tree_summary: {
          text: longText,
          semantic: {
            themes: [
              { name: 'Theme 1', facts: [] },
              { name: 'Theme 2', facts: [] },
              { name: 'Theme 3', facts: [] },
              { name: 'Theme 4', facts: [] },
              { name: 'Theme 5', facts: [] },
              { name: 'Theme 6', facts: [] },
            ],
          },
          meta: { version: 3, last_node_count: 40 },
        },
        node_count: 45,
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('incremental-compress');
    });

    it('should select "incremental" for normal small delta', () => {
      const treeRow = {
        tree_summary: {
          text: 'Some summary',
          semantic: {
            themes: [
              { name: 'Theme 1', facts: [] },
              { name: 'Theme 2', facts: [] },
            ],
          },
          meta: { version: 3, last_node_count: 10, incremental_count: 2 },
        },
        node_count: 18, // delta = 8
      };
      const mode = selectUpdateMode(treeRow);
      expect(mode).toBe('incremental');
    });
  });

  describe('buildIncrementalPrompt', () => {
    it('should construct incremental prompt with old summary and new nodes', () => {
      const oldSummary = {
        semantic: {
          lang: 'zh-CN',
          themes: [
            {
              name: '机器学习基础',
              facts: ['监督学习', '无监督学习'],
              questions: [],
            },
          ],
        },
        meta: {
          last_node_count: 10,
        },
      };

      const newNodes = [
        { role: 'user', text: '什么是深度学习?', path_summary: null },
        { role: 'assistant', text: '深度学习是机器学习的一个分支', path_summary: 'DL intro' },
      ];

      const prompt = buildIncrementalPrompt({
        oldSummary,
        newNodes,
        topic: '机器学习教程',
        nodeCount: 12,
        targetLanguage: 'zh-CN',
      });

      expect(prompt).toContain('Target language: zh-CN');
      expect(prompt).toContain('Update existing tree summary');
      expect(prompt).toContain('EXISTING SUMMARY');
      expect(prompt).toContain('机器学习基础');
      expect(prompt).toContain('NEW NODES');
      expect(prompt).toContain('什么是深度学习');
      expect(prompt).toContain('Total nodes now: 12');
      expect(prompt).toContain('Last summary covered: 10 nodes');
      expect(prompt).toContain('New nodes added: 2');
    });
  });

  describe('buildCompressPrompt', () => {
    it('should construct compress prompt with old summary', () => {
      const oldSummary = {
        semantic: {
          lang: 'en',
          themes: [
            { name: 'Theme 1', facts: ['fact 1', 'fact 2', 'fact 3'], questions: [] },
            { name: 'Theme 2', facts: ['fact 4', 'fact 5'], questions: [] },
            { name: 'Theme 3', facts: ['fact 6'], questions: [] },
            { name: 'Theme 4', facts: ['fact 7'], questions: [] },
            { name: 'Theme 5', facts: ['fact 8'], questions: [] },
            { name: 'Theme 6', facts: ['fact 9'], questions: [] },
            { name: 'Theme 7', facts: ['fact 10'], questions: [] },
          ],
        },
      };

      const prompt = buildCompressPrompt({
        oldSummary,
        topic: 'Large Tree',
        nodeCount: 80,
        targetLanguage: 'en',
      });

      expect(prompt).toContain('Target language: en');
      expect(prompt).toContain('COMPRESS existing tree summary');
      expect(prompt).toContain('CURRENT SUMMARY (too long)');
      expect(prompt).toContain('Theme 1');
      expect(prompt).toContain('Merge similar themes (reduce to MAX 5 themes)');
      expect(prompt).toContain('Total nodes: 80');
    });
  });
});
