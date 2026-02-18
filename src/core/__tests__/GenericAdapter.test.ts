import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericAdapter } from '../GenericAdapter.js';
import type { ProviderConfig, ModelConfig } from '../types.js';

// --- Test fixtures ---

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'prov-1',
    name: 'TestProvider',
    slug: 'test-provider',
    baseUrl: 'https://api.test.com/v1/chat/completions',
    apiKey: 'sk-test-key',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    customHeaders: {},
    rateLimitRpm: 60,
    rateLimitRpd: 1000,
    isEnabled: true,
    priority: 1,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'model-1',
    providerId: 'prov-1',
    name: 'test-model-v1',
    displayName: 'Test Model V1',
    rateLimitRpm: null,
    rateLimitRpd: null,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.002,
    maxTokens: 500,
    contextWindow: 8192,
    isEnabled: true,
    isDefault: true,
    ...overrides,
  };
}

// --- Mock fetch ---

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchResponse(data: any, status = 200) {
  fetchSpy.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as any);
}

// =============================================
// buildRequest tests (verified through fetch args)
// =============================================
describe('GenericAdapter - buildRequest', () => {
  describe('OpenAI format', () => {
    it('should build correct OpenAI request with user prompt only', async () => {
      const provider = makeProvider({ apiFormat: 'openai' });
      const model = makeModel();
      const adapter = new GenericAdapter(provider);

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });

      await adapter.complete(model, { prompt: 'Hello' });

      const [url, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);

      expect(url).toBe('https://api.test.com/v1/chat/completions');
      expect(opts.headers['Authorization']).toBe('Bearer sk-test-key');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(body.model).toBe('test-model-v1');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBe(500);
    });

    it('should include system prompt as system message', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      });

      await adapter.complete(makeModel(), {
        prompt: 'Hello',
        systemPrompt: 'You are helpful.',
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('should use custom temperature and maxTokens', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      });

      await adapter.complete(makeModel(), {
        prompt: 'Hello',
        temperature: 0.9,
        maxTokens: 1000,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.9);
      expect(body.max_tokens).toBe(1000);
    });

    it('should add OpenRouter-specific headers for openrouter slug', async () => {
      const adapter = new GenericAdapter(
        makeProvider({
          apiFormat: 'openai',
          slug: 'openrouter',
        }),
      );

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      });

      await adapter.complete(makeModel(), { prompt: 'Hello' });

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['HTTP-Referer']).toBe('https://gaca-core.local');
      expect(headers['X-Title']).toBe('GACA-Core');
    });

    it('should skip auth header when no apiKey', async () => {
      const adapter = new GenericAdapter(
        makeProvider({
          apiFormat: 'openai',
          apiKey: null,
        }),
      );

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      });

      await adapter.complete(makeModel(), { prompt: 'Hello' });

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('Google format', () => {
    it('should build correct Google request', async () => {
      const provider = makeProvider({
        apiFormat: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        apiKey: 'google-key',
      });
      const adapter = new GenericAdapter(provider);

      mockFetchResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
      });

      await adapter.complete(makeModel({ name: 'gemini-pro' }), { prompt: 'Hello' });

      const [url, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);

      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=google-key',
      );
      expect(body.contents).toEqual([{ parts: [{ text: 'Hello' }] }]);
      expect(body.generationConfig.temperature).toBe(0.3);
      expect(body.generationConfig.maxOutputTokens).toBe(500);
      expect(body.safetySettings).toHaveLength(4);
    });

    it('should concatenate system prompt with user prompt', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'google', apiKey: 'k' }));

      mockFetchResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
      });

      await adapter.complete(makeModel({ name: 'gemini-pro' }), {
        prompt: 'Hello',
        systemPrompt: 'Be concise.',
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.contents[0].parts[0].text).toBe('Be concise.\n\nHello');
    });

    it('should not include Authorization header (uses URL key)', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'google', apiKey: 'k' }));

      mockFetchResponse({
        candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
      });

      await adapter.complete(makeModel({ name: 'gemini-pro' }), { prompt: 'Hello' });

      const headers = fetchSpy.mock.calls[0][1].headers;
      // Google format puts key in URL, not header
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('Anthropic format', () => {
    it('should build correct Anthropic request', async () => {
      const provider = makeProvider({
        apiFormat: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        apiKey: 'sk-ant-key',
      });
      const adapter = new GenericAdapter(provider);

      mockFetchResponse({
        content: [{ text: 'OK' }],
        model: 'claude-3-haiku',
        usage: { input_tokens: 5, output_tokens: 2 },
        stop_reason: 'end_turn',
      });

      await adapter.complete(makeModel({ name: 'claude-3-haiku' }), {
        prompt: 'Hello',
        systemPrompt: 'Be brief.',
      });

      const [url, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);

      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(opts.headers['x-api-key']).toBe('sk-ant-key');
      expect(opts.headers['anthropic-version']).toBe('2023-06-01');
      expect(body.model).toBe('claude-3-haiku');
      expect(body.system).toBe('Be brief.');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(body.max_tokens).toBe(500);
    });

    it('should skip x-api-key when no apiKey', async () => {
      const adapter = new GenericAdapter(
        makeProvider({
          apiFormat: 'anthropic',
          apiKey: null,
        }),
      );

      mockFetchResponse({
        content: [{ text: 'OK' }],
        stop_reason: 'end_turn',
      });

      await adapter.complete(makeModel(), { prompt: 'Hello' });

      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBeUndefined();
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('Custom format', () => {
    it('should build correct custom request', async () => {
      const adapter = new GenericAdapter(
        makeProvider({
          apiFormat: 'custom',
          baseUrl: 'https://custom-api.com/generate',
        }),
      );

      mockFetchResponse({ content: 'OK' });

      await adapter.complete(makeModel(), {
        prompt: 'Hello',
        systemPrompt: 'Be helpful.',
        customBody: { extra_param: true },
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.prompt).toBe('Hello');
      expect(body.system_prompt).toBe('Be helpful.');
      expect(body.model).toBe('test-model-v1');
      expect(body.extra_param).toBe(true);
      expect(body.temperature).toBe(0.3);
    });
  });
});

// =============================================
// parseResponse tests (verified through return value)
// =============================================
describe('GenericAdapter - parseResponse', () => {
  describe('OpenAI format', () => {
    it('should parse standard OpenAI response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));

      mockFetchResponse({
        choices: [{ message: { content: 'Hello there!' }, finish_reason: 'stop' }],
        model: 'gpt-4-turbo',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });

      expect(result.content).toBe('Hello there!');
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.modelId).toBe('model-1');
      expect(result.providerId).toBe('prov-1');
      expect(result.providerName).toBe('TestProvider');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.tokensUsed).toBe(15);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw on invalid OpenAI response (missing choices)', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));
      mockFetchResponse({ error: 'bad request' });

      await expect(adapter.complete(makeModel(), { prompt: 'Hi' })).rejects.toThrow('invalid response format');
    });

    it('should calculate cost when token counts available', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));

      mockFetchResponse({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      });

      const result = await adapter.complete(makeModel({ costPer1kInput: 0.01, costPer1kOutput: 0.03 }), {
        prompt: 'Hi',
      });

      // cost = (1000 * 0.01/1000) + (500 * 0.03/1000) = 0.01 + 0.015 = 0.025
      expect(result.cost).toBeCloseTo(0.025, 6);
    });
  });

  describe('Google format', () => {
    it('should parse standard Google response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'google', apiKey: 'k' }));

      mockFetchResponse({
        candidates: [
          {
            content: { parts: [{ text: 'Hello from Gemini' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 4,
          totalTokenCount: 12,
        },
      });

      const result = await adapter.complete(makeModel({ name: 'gemini-pro' }), { prompt: 'Hi' });

      expect(result.content).toBe('Hello from Gemini');
      expect(result.model).toBe('gemini-pro');
      expect(result.inputTokens).toBe(8);
      expect(result.outputTokens).toBe(4);
      expect(result.tokensUsed).toBe(12);
      expect(result.finishReason).toBe('stop');
    });

    it('should throw on safety-blocked Google response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'google', apiKey: 'k' }));

      mockFetchResponse({
        candidates: [{ finishReason: 'SAFETY' }],
      });

      await expect(adapter.complete(makeModel({ name: 'gemini-pro' }), { prompt: 'Hi' })).rejects.toThrow(
        'content blocked by safety filters',
      );
    });

    it('should throw on invalid Google response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'google', apiKey: 'k' }));
      mockFetchResponse({ candidates: [] });

      await expect(adapter.complete(makeModel({ name: 'gemini-pro' }), { prompt: 'Hi' })).rejects.toThrow(
        'invalid response format',
      );
    });
  });

  describe('Anthropic format', () => {
    it('should parse standard Anthropic response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'anthropic' }));

      mockFetchResponse({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        model: 'claude-3-haiku-20240307',
        usage: { input_tokens: 12, output_tokens: 6 },
        stop_reason: 'end_turn',
      });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });

      expect(result.content).toBe('Hello from Claude');
      expect(result.model).toBe('claude-3-haiku-20240307');
      expect(result.inputTokens).toBe(12);
      expect(result.outputTokens).toBe(6);
      expect(result.tokensUsed).toBe(18); // sum of input + output
      expect(result.finishReason).toBe('stop');
    });

    it('should throw on invalid Anthropic response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'anthropic' }));
      mockFetchResponse({ error: { message: 'invalid' } });

      await expect(adapter.complete(makeModel(), { prompt: 'Hi' })).rejects.toThrow('invalid response format');
    });
  });

  describe('Custom format', () => {
    it('should parse response with "content" field', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ content: 'Custom output' });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });
      expect(result.content).toBe('Custom output');
    });

    it('should parse response with "text" field', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ text: 'Text output' });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });
      expect(result.content).toBe('Text output');
    });

    it('should parse response with "response" field', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ response: 'Response output' });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });
      expect(result.content).toBe('Response output');
    });

    it('should parse response with "output" field', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ output: 'Output field' });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });
      expect(result.content).toBe('Output field');
    });

    it('should parse response with OpenAI-like nested format', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ choices: [{ message: { content: 'Nested OK' } }] });

      const result = await adapter.complete(makeModel(), { prompt: 'Hi' });
      expect(result.content).toBe('Nested OK');
    });

    it('should throw when no parseable content found', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'custom' }));
      mockFetchResponse({ unexpected_field: 'nope' });

      await expect(adapter.complete(makeModel(), { prompt: 'Hi' })).rejects.toThrow('could not parse response');
    });
  });

  describe('HTTP error handling', () => {
    it('should throw on non-200 response', async () => {
      const adapter = new GenericAdapter(makeProvider({ apiFormat: 'openai' }));

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      } as any);

      await expect(adapter.complete(makeModel(), { prompt: 'Hi' })).rejects.toThrow('HTTP 429');
    });
  });
});
