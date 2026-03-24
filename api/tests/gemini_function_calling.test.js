import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiDriver } from '../services/llm/drivers/gemini.js';

/**
 * Phase 5: Function Calling (5.1/5.2)
 *
 * Validates:
 * - tools parameter generates correct function_declarations in request body
 * - toolChoice maps to tool_config.function_calling_config.mode
 * - functionCalls are correctly extracted from response
 */

describe('gemini function calling (Phase 5)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('adds function_declarations when tools parameter is provided', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    const tools = [
      {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    ];

    const res = await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      stream: false,
      tools,
    });

    expect(res.ok).toBe(true);
    expect(seenBodies).toHaveLength(1);
    
    const requestBody = seenBodies[0];
    expect(requestBody.tools).toBeDefined();
    expect(requestBody.tools[0].function_declarations).toBeDefined();
    expect(requestBody.tools[0].function_declarations[0].name).toBe('get_weather');
    expect(requestBody.tools[0].function_declarations[0].parameters.properties.location.type).toBe('string');
  });

  it('sets tool_config.function_calling_config.mode when toolChoice is ANY', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Call the function' }],
      stream: false,
      tools: [{ name: 'my_function' }],
      toolChoice: 'ANY',
    });

    const requestBody = seenBodies[0];
    expect(requestBody.tool_config).toBeDefined();
    expect(requestBody.tool_config.function_calling_config.mode).toBe('ANY');
  });

  it('extracts functionCalls from response', async () => {
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'get_weather',
                  args: { location: 'Tokyo', unit: 'celsius' },
                },
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      };
    });

    const res = await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'What is the weather?' }],
      stream: false,
      tools: [{ name: 'get_weather' }],
    });

    expect(res.ok).toBe(true);
    expect(res.functionCalls).toBeDefined();
    expect(res.functionCalls).toHaveLength(1);
    expect(res.functionCalls[0].name).toBe('get_weather');
    expect(res.functionCalls[0].args.location).toBe('Tokyo');
  });

  it('supports tools combined with enableGrounding', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      tools: [{ name: 'my_tool' }],
      enableGrounding: true,
    });

    const requestBody = seenBodies[0];
    expect(requestBody.tools).toHaveLength(2);
    expect(requestBody.tools[0].function_declarations).toBeDefined();
    expect(requestBody.tools[1]).toEqual({ google_search: {} });
  });

  it('appends functionResults as functionResponse parts (with thoughtSignature)', async () => {
    const seenBodies = [];

    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    });

    await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-3-pro-preview',
      messages: [
        { role: 'user', content: 'Call get_weather' },
        { role: 'assistant', content: 'Calling tool...', thoughtSignature: 'sig-123' },
      ],
      stream: false,
      tools: [{ name: 'get_weather' }],
      functionResults: [
        {
          name: 'get_weather',
          response: { temp: '12C' },
          thoughtSignature: 'sig-123',
        },
      ],
    });

    const requestBody = seenBodies[0];
    expect(Array.isArray(requestBody.contents)).toBe(true);

    const lastTurn = requestBody.contents[requestBody.contents.length - 1];
    expect(lastTurn.role).toBe('user');
    expect(Array.isArray(lastTurn.parts)).toBe(true);

    const fr = lastTurn.parts[0];
    expect(fr.functionResponse).toBeDefined();
    expect(fr.functionResponse.name).toBe('get_weather');
    expect(fr.functionResponse.response.temp).toBe('12C');
    expect(fr.thoughtSignature).toBe('sig-123');
  });

  it('streams function_call chunks when SSE contains functionCall parts', async () => {
    const encoder = new TextEncoder();

    const sse1 =
      'data: ' +
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Tokyo' },
                  },
                  thoughtSignature: 'sig-1',
                },
              ],
            },
          },
        ],
      }) +
      '\n\n';

    const sse2 =
      'data: ' +
      JSON.stringify({
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }) +
      '\n\n';

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse1));
        controller.enqueue(encoder.encode(sse2));
        controller.close();
      },
    });

    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        body,
        json: async () => ({}),
      };
    });

    const gen = await geminiDriver({
      providerSource: 'platform',
      providerKind: 'gemini',
      providerId: 'test',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Call tool' }],
      stream: true,
      tools: [{ name: 'get_weather' }],
    });

    const chunks = [];
    for await (const c of gen) chunks.push(c);

    const functionChunk = chunks.find((c) => c.type === 'function_call');
    expect(functionChunk).toBeDefined();
    expect(functionChunk.done).toBe(false);
    expect(functionChunk.functionCalls).toHaveLength(1);
    expect(functionChunk.functionCalls[0].name).toBe('get_weather');
    expect(functionChunk.functionCalls[0].args.location).toBe('Tokyo');
    expect(functionChunk.functionCalls[0].thoughtSignature).toBe('sig-1');

    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.type).toBe('usage');
    expect(final.functionCalls).toBeDefined();
    expect(final.functionCalls).toHaveLength(1);
    expect(final.functionCalls[0].name).toBe('get_weather');
  });
});
