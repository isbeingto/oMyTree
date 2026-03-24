import { describe, it, expect } from 'vitest';
import { isRootNode, shortNodeId, normalizeNodesForVisuals } from '../treeUtils';
import type { Node } from '../types';

const baseNode = (overrides: Partial<Node> = {}): Node => ({
  id: overrides.id || 'node-1',
  tree_id: overrides.tree_id || 'tree-1',
  parent_id: overrides.parent_id ?? null,
  level: overrides.level ?? 0,
  role: overrides.role || 'user',
  text: overrides.text || 'sample',
  created_at: overrides.created_at || new Date().toISOString(),
});

describe('treeUtils', () => {
  describe('isRootNode', () => {
    it('detects root as user node with no parent', () => {
      // Only user node with no parent is root (T20 semantics)
      expect(isRootNode(baseNode({ parent_id: null, role: 'user' }))).toBe(true);
      expect(isRootNode(baseNode({ parent_id: null, role: 'ai' }))).toBe(false);
      expect(isRootNode(baseNode({ parent_id: 'p1', role: 'user' }))).toBe(false);
    });

    it('does NOT treat system role as root (use normalizeNodesForVisuals for legacy)', () => {
      // System root is handled by normalizeNodesForVisuals, not isRootNode
      expect(isRootNode(baseNode({ role: 'system', parent_id: null }))).toBe(false);
    });
  });

  describe('normalizeNodesForVisuals', () => {
    it('filters out system root and reparents children', () => {
      const nodes: Node[] = [
        baseNode({ id: 'sys', parent_id: null, role: 'system', text: 'Topic' }),
        baseNode({ id: 'user1', parent_id: 'sys', role: 'user', text: 'Question' }),
        baseNode({ id: 'ai1', parent_id: 'user1', role: 'ai', text: 'Answer' }),
      ];
      const normalized = normalizeNodesForVisuals(nodes);
      
      expect(normalized.length).toBe(2);
      expect(normalized.find(n => n.role === 'system')).toBeUndefined();
      
      const userRoot = normalized.find(n => n.id === 'user1');
      expect(userRoot?.parent_id).toBeNull();
    });

    it('leaves nodes unchanged when no system root', () => {
      const nodes: Node[] = [
        baseNode({ id: 'user1', parent_id: null, role: 'user', text: 'Question' }),
        baseNode({ id: 'ai1', parent_id: 'user1', role: 'ai', text: 'Answer' }),
      ];
      const normalized = normalizeNodesForVisuals(nodes);
      
      expect(normalized.length).toBe(2);
      expect(normalized[0].parent_id).toBeNull();
    });
  });

  it('shortens node ids', () => {
    expect(shortNodeId('abcdef12345', 4)).toBe('abcd');
    expect(shortNodeId(null, 4)).toBe('');
  });
});
