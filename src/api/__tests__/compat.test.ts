import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Set test env before any imports
process.env.NODE_ENV = 'test';
process.env.GACA_ADMIN_KEY = 'test-admin-key';

// Mock logger
vi.mock('../../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Mock Prisma
const mockPrismaInstance = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  aIProvider: {
    count: vi.fn().mockResolvedValue(5),
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'prov-1',
        name: 'Test Provider',
        slug: 'test',
        priority: 1,
        models: [{ id: 'model-1', name: 'test-model', displayName: 'Test Model' }],
      },
    ]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  aIModel: {
    count: vi.fn().mockResolvedValue(20),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  aIModelRanking: {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
  },
  aIModelUsage: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  aIProviderUsage: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  aIFailoverEvent: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    $connect = mockPrismaInstance.$connect;
    $disconnect = mockPrismaInstance.$disconnect;
    aIProvider = mockPrismaInstance.aIProvider;
    aIModel = mockPrismaInstance.aIModel;
    aIModelRanking = mockPrismaInstance.aIModelRanking;
    aIModelUsage = mockPrismaInstance.aIModelUsage;
    aIProviderUsage = mockPrismaInstance.aIProviderUsage;
    aIFailoverEvent = mockPrismaInstance.aIFailoverEvent;
  },
}));

// Mock AIEngine
const mockEngineComplete = vi.fn();
const mockEngineCompleteWithModel = vi.fn();
const mockEngineCompleteWithProvider = vi.fn();

vi.mock('../../core/AIEngine.js', () => ({
  AIEngine: class MockAIEngine {
    complete = mockEngineComplete;
    completeWithModel = mockEngineCompleteWithModel;
    completeWithProvider = mockEngineCompleteWithProvider;
    completeStream = vi.fn();
    testProvider = vi.fn();
    getRankingService = vi.fn().mockReturnValue({
      maybeRecalculate: vi.fn(),
      recalculateAll: vi.fn(),
      getLastRecalculationAt: vi.fn().mockReturnValue(null),
    });
    getUsageTracker = vi.fn().mockReturnValue({
      track: vi.fn(),
      canUseProvider: vi.fn().mockReturnValue(true),
      canUseModel: vi.fn().mockReturnValue(true),
      getProviderStats: vi.fn().mockReturnValue(null),
      getModelStats: vi.fn().mockReturnValue(null),
    });
    getModelSelector = vi.fn().mockReturnValue({
      getNextModel: vi.fn(),
      selectBestModel: vi.fn(),
      getAvailableModels: vi.fn().mockResolvedValue([]),
    });
    getFailoverEvents = vi.fn().mockResolvedValue([]);
    getRateLimitInfo = vi.fn().mockResolvedValue({
      providerRpm: null,
      providerRpd: null,
      modelRpm: null,
      modelRpd: null,
      providerUsedMinute: 0,
      providerUsedDay: 0,
      modelUsedMinute: 0,
      modelUsedDay: 0,
    });
    clearAdapterCache = vi.fn();
  },
}));

// Import app AFTER mocks are set up
const { app } = await import('../server.js');

const MOCK_RESPONSE = {
  content: 'Hello! How can I help?',
  model: 'test-model',
  modelId: 'model-1',
  providerId: 'prov-1',
  providerName: 'Test Provider',
  latencyMs: 150,
  tokensUsed: 25,
  inputTokens: 10,
  outputTokens: 15,
  finishReason: 'stop',
  requestId: 'req_test',
};

describe('Compat API (/api/gaca/*)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/gaca/complete', () => {
    it('returns {success:true, data:{...}} with prompt', async () => {
      mockEngineComplete.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('Hello! How can I help?');
      expect(res.body.data.model).toBe('test-model');
      expect(res.body.data.providerId).toBe('prov-1');
      expect(res.body.data.providerName).toBe('Test Provider');
      expect(res.body.data.latencyMs).toBe(150);
      expect(res.body.data.finishReason).toBe('stop');
    });

    it('returns tokensUsed as {prompt, completion, total} object', async () => {
      mockEngineComplete.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello' });

      expect(res.body.data.tokensUsed).toEqual({
        prompt: 10,
        completion: 15,
        total: 25,
      });
    });

    it('converts messages array to prompt', async () => {
      mockEngineComplete.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hi there' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('Hello! How can I help?');

      // Verify engine was called with converted prompt
      const call = mockEngineComplete.mock.calls[0][0];
      expect(call.prompt).toBe('Hi there');
      expect(call.systemPrompt).toBe('You are helpful.');
    });

    it('converts multi-turn messages to formatted prompt', async () => {
      mockEngineComplete.mockResolvedValueOnce(MOCK_RESPONSE);

      await request(app)
        .post('/api/gaca/complete')
        .send({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
            { role: 'user', content: 'How are you?' },
          ],
        });

      const call = mockEngineComplete.mock.calls[0][0];
      expect(call.prompt).toContain('User: Hello');
      expect(call.prompt).toContain('Assistant: Hi!');
      expect(call.prompt).toContain('User: How are you?');
    });

    it('returns 400 without prompt or messages', async () => {
      const res = await request(app)
        .post('/api/gaca/complete')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 with empty messages array', async () => {
      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ messages: [] });

      expect(res.status).toBe(400);
    });

    it('returns {success:false, error} on engine failure', async () => {
      mockEngineComplete.mockRejectedValueOnce(new Error('All providers failed'));

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('All providers failed');
    });

    it('accepts max_tokens as alias for maxTokens', async () => {
      mockEngineComplete.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello', max_tokens: 100 });

      expect(res.status).toBe(200);
      const call = mockEngineComplete.mock.calls[0][0];
      expect(call.maxTokens).toBe(100);
    });

    it('accepts model as alias for modelId', async () => {
      mockEngineCompleteWithModel.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello', model: 'model-1' });

      expect(res.status).toBe(200);
      expect(mockEngineCompleteWithModel).toHaveBeenCalledWith(
        'model-1',
        expect.objectContaining({ prompt: 'Hello' }),
      );
    });

    it('uses completeWithProvider when providerId is set', async () => {
      mockEngineCompleteWithProvider.mockResolvedValueOnce(MOCK_RESPONSE);

      const res = await request(app)
        .post('/api/gaca/complete')
        .send({ prompt: 'Hello', providerId: 'prov-1' });

      expect(res.status).toBe(200);
      expect(mockEngineCompleteWithProvider).toHaveBeenCalledWith(
        'prov-1',
        expect.objectContaining({ prompt: 'Hello' }),
      );
    });
  });

  describe('GET /api/gaca/health', () => {
    it('returns {success:true, data:{status:"healthy"}}', async () => {
      const res = await request(app).get('/api/gaca/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.providers).toBe(5);
      expect(res.body.data.models).toBe(20);
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  describe('GET /api/gaca/status', () => {
    it('returns list of providers and models', async () => {
      const res = await request(app).get('/api/gaca/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providers).toBeDefined();
      expect(Array.isArray(res.body.data.providers)).toBe(true);
      expect(res.body.data.totalProviders).toBeDefined();
      expect(res.body.data.totalModels).toBeDefined();
    });
  });
});
