import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIResponse, ProviderConfig, ModelConfig } from '../types.js';

// Hoisted mocks — must be declared before vi.mock calls
const mockComplete = vi.fn();
const mockCompleteStream = vi.fn();
const mockGetNextModel = vi.fn();
const mockSelectBestModel = vi.fn();
const mockMaybeRecalculate = vi.fn();
const mockTrack = vi.fn();
const mockGetProviderStats = vi.fn();
const mockGetModelStats = vi.fn();
let adapterConstructorCallCount = 0;

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Mock GenericAdapter — use a real class so `new` works
vi.mock('../GenericAdapter.js', () => {
  return {
    GenericAdapter: class MockGenericAdapter {
      constructor() {
        adapterConstructorCallCount++;
      }
      complete = mockComplete;
      completeStream = mockCompleteStream;
      testConnection = vi.fn();
    },
  };
});

// Mock ModelSelector
vi.mock('../ModelSelector.js', () => {
  return {
    ModelSelector: class MockModelSelector {
      getNextModel = mockGetNextModel;
      selectBestModel = mockSelectBestModel;
    },
  };
});

// Mock RankingService
vi.mock('../RankingService.js', () => {
  return {
    RankingService: class MockRankingService {
      maybeRecalculate = mockMaybeRecalculate;
    },
  };
});

// Mock UsageTracker
vi.mock('../UsageTracker.js', () => {
  return {
    UsageTracker: class MockUsageTracker {
      track = mockTrack;
      getProviderStats = mockGetProviderStats;
      getModelStats = mockGetModelStats;
    },
  };
});

// Import after mocks are set up
import { AIEngine } from '../AIEngine.js';

// --- Helpers ---

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'prov-1',
    name: 'Test Provider',
    slug: 'test-provider',
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'sk-test',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    customHeaders: {},
    rateLimitRpm: null,
    rateLimitRpd: null,
    isEnabled: true,
    priority: 1,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'model-1',
    providerId: 'prov-1',
    name: 'test-model',
    displayName: 'Test Model',
    rateLimitRpm: null,
    rateLimitRpd: null,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxTokens: 4096,
    contextWindow: 8192,
    isEnabled: true,
    isDefault: true,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<AIResponse> = {}): AIResponse {
  return {
    content: 'Hello world',
    model: 'test-model',
    modelId: 'model-1',
    providerId: 'prov-1',
    providerName: 'Test Provider',
    latencyMs: 150,
    tokensUsed: 25,
    inputTokens: 10,
    outputTokens: 15,
    finishReason: 'stop',
    ...overrides,
  };
}

// Mock persistence
const mockPersistence = {
  findProviderById: vi.fn(),
  findModelById: vi.fn(),
  findEnabledProviders: vi.fn().mockResolvedValue([]),
  countProviders: vi.fn(),
  countModels: vi.fn(),
  createFailoverEvent: vi.fn().mockResolvedValue(undefined),
  findFailoverEvents: vi.fn().mockResolvedValue([]),
  findModelRanking: vi.fn(),
  upsertModelRanking: vi.fn(),
  findModelUsage: vi.fn(),
  createModelUsage: vi.fn(),
  updateModelUsage: vi.fn(),
  upsertProviderUsage: vi.fn(),
  resetDailyUsage: vi.fn(),
} as any;

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

describe('AIEngine', () => {
  let engine: AIEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    adapterConstructorCallCount = 0;
    engine = new AIEngine({ persistence: mockPersistence, logger: mockLogger });
  });

  describe('complete()', () => {
    it('returns AIResponse with all fields on successful completion', async () => {
      const provider = makeProvider();
      const model = makeModel();
      const response = makeResponse();

      mockGetNextModel.mockResolvedValueOnce({ model, provider });
      mockComplete.mockResolvedValueOnce(response);
      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);

      const result = await engine.complete({ prompt: 'Hello' });

      expect(result.content).toBe('Hello world');
      expect(result.model).toBe('test-model');
      expect(result.modelId).toBe('model-1');
      expect(result.providerId).toBe('prov-1');
      expect(result.providerName).toBe('Test Provider');
      expect(result.latencyMs).toBe(150);
      expect(result.requestId).toBeDefined();
    });

    it('fails over when first model fails and second succeeds', async () => {
      const provider1 = makeProvider({ id: 'prov-1', name: 'Provider 1' });
      const model1 = makeModel({ id: 'model-1', name: 'model-1' });
      const provider2 = makeProvider({ id: 'prov-2', name: 'Provider 2' });
      const model2 = makeModel({ id: 'model-2', name: 'model-2', providerId: 'prov-2' });
      const response = makeResponse({ modelId: 'model-2', providerId: 'prov-2' });

      mockGetNextModel
        .mockResolvedValueOnce({ model: model1, provider: provider1 })
        .mockResolvedValueOnce({ model: model2, provider: provider2 });
      mockComplete.mockRejectedValueOnce(new Error('Rate limit exceeded')).mockResolvedValueOnce(response);
      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);

      const result = await engine.complete({ prompt: 'Hello' });

      expect(result.content).toBe('Hello world');
      expect(result.modelId).toBe('model-2');
      expect(mockComplete).toHaveBeenCalledTimes(2);
      // Track called for both failure and success
      expect(mockTrack).toHaveBeenCalledTimes(2);
    });

    it('throws error with attempts count when all models fail', async () => {
      const provider = makeProvider();
      const model = makeModel();

      mockGetNextModel.mockResolvedValueOnce({ model, provider }).mockResolvedValueOnce(null);
      mockComplete.mockRejectedValueOnce(new Error('Service unavailable'));
      mockTrack.mockResolvedValue(undefined);

      await expect(engine.complete({ prompt: 'Hello' })).rejects.toThrow(
        /All AI providers failed after 2 attempts/,
      );
    });

    it('throws when no models are available', async () => {
      mockGetNextModel.mockResolvedValueOnce(null);

      // When getNextModel returns null on first call, attempts is still
      // incremented to 1 before the break, so the error says "1 attempts"
      await expect(engine.complete({ prompt: 'Hello' })).rejects.toThrow(
        /All AI providers failed after 1 attempts/,
      );
    });
  });

  describe('completeWithProvider()', () => {
    it('uses specified provider', async () => {
      const provider = makeProvider({ id: 'specific-prov' });
      const model = makeModel({ providerId: 'specific-prov' });
      const response = makeResponse();

      mockSelectBestModel.mockResolvedValueOnce({ model, provider });
      mockComplete.mockResolvedValueOnce(response);
      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);

      const result = await engine.completeWithProvider('specific-prov', { prompt: 'Hello' });

      expect(result.content).toBe('Hello world');
      expect(mockSelectBestModel).toHaveBeenCalledWith('specific-prov');
    });

    it('throws when provider is not available', async () => {
      mockSelectBestModel.mockResolvedValueOnce(null);

      await expect(engine.completeWithProvider('bad-prov', { prompt: 'Hello' })).rejects.toThrow(
        /Provider bad-prov is not available/,
      );
    });
  });

  describe('completeWithModel()', () => {
    it('uses specified model', async () => {
      const provider = makeProvider();
      const model = makeModel({ id: 'specific-model' });
      const response = makeResponse();

      mockSelectBestModel.mockResolvedValueOnce({ model, provider });
      mockComplete.mockResolvedValueOnce(response);
      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);

      const result = await engine.completeWithModel('specific-model', { prompt: 'Hello' });

      expect(result.content).toBe('Hello world');
      expect(mockSelectBestModel).toHaveBeenCalledWith(undefined, 'specific-model');
    });

    it('throws when model is not available', async () => {
      mockSelectBestModel.mockResolvedValueOnce(null);

      await expect(engine.completeWithModel('bad-model', { prompt: 'Hello' })).rejects.toThrow(
        /Model bad-model is not available/,
      );
    });
  });

  describe('adapter caching', () => {
    it('reuses adapter instance for the same provider', async () => {
      const provider = makeProvider();
      const model = makeModel();
      const response = makeResponse();

      // Use mockResolvedValue (not Once) for track/recalculate — they're called multiple times
      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);
      mockComplete.mockResolvedValue(response);

      // First call — creates adapter
      mockGetNextModel.mockResolvedValueOnce({ model, provider });
      await engine.complete({ prompt: 'First' });
      const countAfterFirst = adapterConstructorCallCount;

      // Second call with same provider — should reuse adapter
      mockGetNextModel.mockResolvedValueOnce({ model, provider });
      await engine.complete({ prompt: 'Second' });

      expect(adapterConstructorCallCount).toBe(countAfterFirst);
    });
  });

  describe('clearAdapterCache()', () => {
    it('clears cache for specific provider and creates new adapter', async () => {
      const provider = makeProvider();
      const model = makeModel();
      const response = makeResponse();

      mockTrack.mockResolvedValue(undefined);
      mockMaybeRecalculate.mockResolvedValue(undefined);
      mockComplete.mockResolvedValue(response);

      mockGetNextModel.mockResolvedValueOnce({ model, provider });
      await engine.complete({ prompt: 'Hello' });
      const countAfterFirst = adapterConstructorCallCount;

      // Clear cache for this provider
      engine.clearAdapterCache('prov-1');

      // Next call should create a new adapter
      mockGetNextModel.mockResolvedValueOnce({ model, provider });
      await engine.complete({ prompt: 'Hello again' });

      expect(adapterConstructorCallCount).toBe(countAfterFirst + 1);
    });
  });
});
