// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  replay,
  getTree,
  getSnapshot,
  getNode,
  fetchKeyframes,
  upsertKeyframe,
  deleteKeyframe,
  getApiBase,
} from '../api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logEvent to avoid side effects
vi.mock('../observe', () => ({
  logEvent: vi.fn(),
}));

describe('api.ts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiBase', () => {
    it('returns a string', () => {
      const base = getApiBase();
      expect(typeof base).toBe('string');
    });
  });

  describe('replay', () => {
    it('sends POST request with tree_id', async () => {
      const mockResponse = { ok: true, events: [], trace_id: 'replay-trace' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'replay-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await replay({ tree_id: 'tree-123' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/events/replay');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ tree_id: 'tree-123' });
      expect(result.ok).toBe(true);
    });
  });

  describe('getTree', () => {
    it('sends GET request with tree id', async () => {
      const mockResponse = {
        ok: true,
        tree: { id: 'tree-123', topic: 'Test Tree' },
        trace_id: 'tree-trace',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'tree-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getTree('tree-123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/tree/tree-123');
      expect(init.method).toBe('GET');
      expect(result.ok).toBe(true);
    });

    it('encodes special characters in tree id', async () => {
      const mockResponse = { ok: true, tree: {}, trace_id: 'enc-trace' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      await getTree('tree/with/slashes');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(encodeURIComponent('tree/with/slashes'));
    });
  });

  describe('getSnapshot', () => {
    it('sends GET request with tree id to snapshot endpoint', async () => {
      const mockResponse = {
        ok: true,
        tree: {
          id: 'tree-456',
          topic: 'Snapshot Tree',
          root: {
            id: 'root-1',
            parent_id: null,
            level: 0,
            role: 'system',
            text: 'Root',
            children: [],
          },
        },
        trace_id: 'snapshot-trace',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'snapshot-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getSnapshot('tree-456');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/tree/tree-456/snapshot');
      expect(init.method).toBe('GET');
      expect(init.cache).toBe('no-store');
      expect(result.ok).toBe(true);
      expect(result.tree.id).toBe('tree-456');
    });
  });

  describe('getNode', () => {
    it('sends GET request with node id', async () => {
      const mockResponse = {
        ok: true,
        node: {
          id: 'node-789',
          tree_id: 'tree-1',
          parent_id: null,
          level: 0,
          role: 'user',
          text: 'Hello',
          created_at: '2025-01-01T00:00:00Z',
        },
        trace_id: 'node-trace',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'node-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getNode('node-789');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/node/node-789');
      expect(init.method).toBe('GET');
      expect(init.cache).toBe('no-store');
      expect(result.ok).toBe(true);
      expect(result.node.id).toBe('node-789');
    });

    it('throws error on 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        clone: () => ({
          json: () => Promise.resolve({ error: 'Node not found' }),
        }),
        text: () => Promise.resolve('Node not found'),
      });

      await expect(getNode('non-existent')).rejects.toThrow(
        'Node not found'
      );
    });
  });

  describe('keyframes', () => {
    it('fetchKeyframes sends GET to keyframes endpoint', async () => {
      const mockResponse = { ok: true, keyframes: [], trace_id: 'kf-trace' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'kf-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await fetchKeyframes('tree-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/tree/tree-1/keyframes');
      expect(init.method).toBe('GET');
      expect(init.cache).toBe('no-store');
      expect(result.ok).toBe(true);
    });

    it('upsertKeyframe sends POST with node_id and annotation', async () => {
      const mockResponse = {
        ok: true,
        keyframe: { id: 'kf-1', node_id: 'node-1', annotation: null, is_pinned: false, created_at: 'now' },
        trace_id: 'kf-upsert-trace',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'kf-upsert-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await upsertKeyframe('tree-1', 'node-1', 'note');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/tree/tree-1/keyframes');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ node_id: 'node-1', annotation: 'note' });
      expect(result.ok).toBe(true);
    });

    it('deleteKeyframe sends DELETE to node-specific endpoint', async () => {
      const mockResponse = { ok: true, deleted: 1, trace_id: 'kf-del-trace' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-trace-id': 'kf-del-trace' }),
        clone: () => ({
          json: () => Promise.resolve(mockResponse),
        }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await deleteKeyframe('tree-1', 'node-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/tree/tree-1/keyframes/node-1');
      expect(init.method).toBe('DELETE');
      expect(result.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles malformed JSON in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        clone: () => ({
          json: () => Promise.reject(new Error('Invalid JSON')),
        }),
        text: () => Promise.resolve('Internal error'),
      });

      await expect(
        getTree('tree-bad')
      ).rejects.toThrow('Internal error');
    });
  });
});
