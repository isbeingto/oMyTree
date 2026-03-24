/**
 * Gemini Grounding Metadata Extraction Test
 * 验证 Phase 4.3: 正确提取 groundingMetadata (searchEntryPoint, groundingChunks, groundingSupports)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

describe('Gemini Grounding Metadata Extraction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should extract groundingMetadata from non-streaming response via driver', async () => {
    const mockResponse = {
      candidates: [{
        content: {
          parts: [{ text: 'Answer based on search results' }],
          role: 'model'
        },
        groundingMetadata: {
          searchEntryPoint: {
            renderedContent: '<html>Search UI</html>'
          },
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/doc1',
                title: 'Example Document'
              }
            }
          ],
          groundingSupports: [
            {
              segment: { text: 'supported text' },
              groundingChunkIndices: [0],
              confidenceScores: [0.95]
            }
          ]
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      }
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');
    const result = await geminiDriver({
      model: 'gemini-2.0-flash-exp',
      messages: [{ role: 'user', content: 'test query' }],
      apiKey: 'test-api-key',
      enableGrounding: true,
      stream: false
    });

    expect(result.text).toBe('Answer based on search results');
    expect(result.groundingMetadata).toBeDefined();
    expect(result.groundingMetadata.searchEntryPoint).toEqual({
      renderedContent: '<html>Search UI</html>'
    });
    expect(result.groundingMetadata.groundingChunks).toHaveLength(1);
    expect(result.groundingMetadata.groundingChunks[0].web.uri).toBe('https://example.com/doc1');
    expect(result.groundingMetadata.groundingSupports).toHaveLength(1);
  });

  it('should extract groundingMetadata from streaming response via driver', async () => {
    const mockStreamData = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Answer"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" with grounding"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"."}]},"groundingMetadata":{"searchEntryPoint":{"renderedContent":"<html>Search</html>"},"groundingChunks":[{"web":{"uri":"https://example.com","title":"Example"}}]}}]}\n\n',
      'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":20,"totalTokenCount":30}}\n\n'
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        for (const data of mockStreamData) {
          controller.enqueue(new TextEncoder().encode(data));
        }
        controller.close();
      }
    });

    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream
    });

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');
    const generator = await geminiDriver({
      model: 'gemini-2.0-flash-exp',
      messages: [{ role: 'user', content: 'test query' }],
      apiKey: 'test-api-key',
      enableGrounding: true,
      stream: true
    });

    const chunks = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }

    const textChunks = chunks.filter(c => c.type === 'delta');
    const usageChunks = chunks.filter(c => c.type === 'usage');

    expect(textChunks.length).toBeGreaterThan(0);
    expect(usageChunks.length).toBe(1);
    
    // Phase 4.3: grounding metadata is included in the final usage chunk
    const finalChunk = usageChunks[0];
    expect(finalChunk.groundingMetadata).toBeDefined();
    expect(finalChunk.groundingMetadata.searchEntryPoint).toBeDefined();
    expect(finalChunk.groundingMetadata.groundingChunks).toHaveLength(1);
    expect(finalChunk.groundingMetadata.groundingChunks[0].web.uri).toBe('https://example.com');
  });

  it('should return undefined groundingMetadata when not present', async () => {
    const mockResponse = {
      candidates: [{
        content: {
          parts: [{ text: 'Regular answer' }],
          role: 'model'
        }
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      }
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const { geminiDriver } = await import('../services/llm/drivers/gemini.js');
    const result = await geminiDriver({
      model: 'gemini-2.0-flash-exp',
      messages: [{ role: 'user', content: 'test query' }],
      apiKey: 'test-api-key',
      stream: false
    });

    expect(result.text).toBe('Regular answer');
    expect(result.groundingMetadata).toBeUndefined();
  });
});
