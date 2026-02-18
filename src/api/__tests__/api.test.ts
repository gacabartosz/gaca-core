import { describe, it, expect, vi, beforeAll } from 'vitest';
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
    findMany: vi.fn().mockResolvedValue([]),
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
vi.mock('../../core/AIEngine.js', () => ({
  AIEngine: class MockAIEngine {
    complete = mockEngineComplete;
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

describe('API Integration Tests', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.providers).toBe(5);
      expect(res.body.models).toBe(20);
      expect(res.body.version).toBe('1.0.0');
    });
  });

  describe('GET /api/providers', () => {
    it('returns array of providers', async () => {
      const res = await request(app).get('/api/providers');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/providers/stats/usage', () => {
    it('returns usage data (not caught by :id route)', async () => {
      const res = await request(app).get('/api/providers/stats/usage');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRequestsToday');
      expect(res.body).toHaveProperty('totalTokensToday');
      expect(res.body).toHaveProperty('failoverEventsToday');
      expect(res.body).toHaveProperty('providers');
    });
  });

  describe('POST /api/complete', () => {
    it('returns 400 with empty prompt (Zod validation)', async () => {
      const res = await request(app)
        .post('/api/complete')
        .send({ prompt: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 without prompt field', async () => {
      const res = await request(app)
        .post('/api/complete')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 200 with valid prompt (mock AIEngine)', async () => {
      mockEngineComplete.mockResolvedValueOnce({
        content: 'Test response',
        model: 'test-model',
        modelId: 'model-1',
        providerId: 'prov-1',
        providerName: 'Test Provider',
        latencyMs: 100,
        tokensUsed: 10,
        requestId: 'req_test',
      });

      const res = await request(app)
        .post('/api/complete')
        .send({ prompt: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Test response');
    });
  });

  describe('Auth middleware', () => {
    it('POST /api/providers without auth returns 401 when GACA_ADMIN_KEY is set', async () => {
      const res = await request(app)
        .post('/api/providers')
        .send({ name: 'Test', slug: 'test', baseUrl: 'https://test.com' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authorization required/);
    });

    it('GET /api/providers works without auth (read-only)', async () => {
      const res = await request(app).get('/api/providers');

      expect(res.status).toBe(200);
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await request(app).get('/api/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });
});
