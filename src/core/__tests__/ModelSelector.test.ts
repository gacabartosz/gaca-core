import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelSelector } from '../ModelSelector.js';
import { UsageTracker } from '../UsageTracker.js';

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// --- Helpers to build Prisma-shaped data (raw DB rows that formatProvider/formatModel expect) ---

function makeDbProvider(overrides: Record<string, any> = {}) {
  return {
    id: 'prov-1',
    name: 'Provider One',
    slug: 'provider-one',
    baseUrl: 'https://api.one.com/v1/chat/completions',
    apiKey: 'sk-key-1',
    apiFormat: 'openai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    customHeaders: '{}',
    rateLimitRpm: null,
    rateLimitRpd: null,
    isEnabled: true,
    priority: 1,
    models: [],
    usage: null,
    ...overrides,
  };
}

function makeDbModel(overrides: Record<string, any> = {}) {
  return {
    id: 'model-1',
    providerId: 'prov-1',
    name: 'model-v1',
    displayName: 'Model V1',
    rateLimitRpm: null,
    rateLimitRpd: null,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxTokens: 500,
    contextWindow: 8192,
    isEnabled: true,
    isDefault: false,
    ranking: null,
    usage: null,
    ...overrides,
  };
}

// Create a mock GacaPersistence + UsageTracker
function createMocks(
  options: {
    providers?: any[];
    canUseProvider?: boolean | ((id: string) => boolean);
    canUseModel?: boolean | ((id: string) => boolean);
  } = {},
) {
  const { providers = [], canUseProvider = true, canUseModel = true } = options;

  const persistence = {
    getEnabledProvidersWithModels: vi.fn().mockResolvedValue(providers),
    findModelById: vi.fn().mockImplementation((modelId: string) => {
      for (const p of providers) {
        const m = p.models?.find((m: any) => m.id === modelId);
        if (m) return Promise.resolve({ ...m, provider: p });
      }
      return Promise.resolve(null);
    }),
  } as any;

  const usageTracker = {
    canUseProvider:
      typeof canUseProvider === 'function' ? vi.fn(canUseProvider) : vi.fn().mockReturnValue(canUseProvider),
    canUseModel: typeof canUseModel === 'function' ? vi.fn(canUseModel) : vi.fn().mockReturnValue(canUseModel),
  } as unknown as UsageTracker;

  return { persistence, usageTracker };
}

describe('ModelSelector', () => {
  describe('model selection order (highest ranking first)', () => {
    it('should select model with highest ranking score', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        name: 'model-a',
        ranking: { score: 0.6, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        name: 'model-b',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 200, sampleSize: 50 },
      });
      const modelC = makeDbModel({
        id: 'model-c',
        name: 'model-c',
        ranking: { score: 0.75, successRate: 0.9, avgLatencyMs: 300, sampleSize: 20 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB, modelC] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available).toHaveLength(3);
      expect(available[0].model.id).toBe('model-b'); // score 0.9
      expect(available[1].model.id).toBe('model-c'); // score 0.75
      expect(available[2].model.id).toBe('model-a'); // score 0.6
    });

    it('should prefer default models when scores are equal', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        isDefault: false,
        ranking: { score: 0.8, successRate: 1.0, avgLatencyMs: 200, sampleSize: 10 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        isDefault: true,
        ranking: { score: 0.8, successRate: 1.0, avgLatencyMs: 200, sampleSize: 10 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available[0].model.id).toBe('model-b'); // isDefault = true
      expect(available[1].model.id).toBe('model-a');
    });

    it('should prefer lower provider priority when scores and default are equal', async () => {
      const model1 = makeDbModel({
        id: 'model-1',
        providerId: 'prov-1',
        ranking: { score: 0.8, successRate: 1.0, avgLatencyMs: 200, sampleSize: 10 },
      });
      const model2 = makeDbModel({
        id: 'model-2',
        providerId: 'prov-2',
        ranking: { score: 0.8, successRate: 1.0, avgLatencyMs: 200, sampleSize: 10 },
      });

      const provider1 = makeDbProvider({ id: 'prov-1', priority: 5, models: [model1] });
      const provider2 = makeDbProvider({ id: 'prov-2', priority: 1, models: [model2] });

      const { persistence, usageTracker } = createMocks({ providers: [provider1, provider2] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available[0].model.id).toBe('model-2'); // provider priority 1
      expect(available[1].model.id).toBe('model-1'); // provider priority 5
    });

    it('should treat null ranking score as 0', async () => {
      const modelRanked = makeDbModel({
        id: 'model-ranked',
        ranking: { score: 0.3, successRate: 0.5, avgLatencyMs: 1000, sampleSize: 5 },
      });
      const modelUnranked = makeDbModel({ id: 'model-unranked', ranking: null });

      const provider = makeDbProvider({ models: [modelUnranked, modelRanked] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available[0].model.id).toBe('model-ranked');
      expect(available[1].model.id).toBe('model-unranked');
    });

    it('should select first available via selectBestModel', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 200, sampleSize: 50 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.selectBestModel();

      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('model-b'); // highest score
    });
  });

  describe('rate limit filtering', () => {
    it('should skip providers that are rate-limited', async () => {
      const model1 = makeDbModel({
        id: 'model-1',
        providerId: 'prov-limited',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 100, sampleSize: 50 },
      });
      const model2 = makeDbModel({
        id: 'model-2',
        providerId: 'prov-ok',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });

      const provLimited = makeDbProvider({ id: 'prov-limited', models: [model1] });
      const provOk = makeDbProvider({ id: 'prov-ok', models: [model2] });

      const { persistence, usageTracker } = createMocks({
        providers: [provLimited, provOk],
        canUseProvider: (id: string) => id !== 'prov-limited',
      });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available).toHaveLength(1);
      expect(available[0].model.id).toBe('model-2');
    });

    it('should skip models that are rate-limited', async () => {
      const modelLimited = makeDbModel({
        id: 'model-limited',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 100, sampleSize: 50 },
      });
      const modelOk = makeDbModel({
        id: 'model-ok',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });

      const provider = makeDbProvider({ models: [modelLimited, modelOk] });

      const { persistence, usageTracker } = createMocks({
        providers: [provider],
        canUseModel: (id: string) => id !== 'model-limited',
      });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();

      expect(available).toHaveLength(1);
      expect(available[0].model.id).toBe('model-ok');
    });

    it('should return null when all models are rate-limited', async () => {
      const model1 = makeDbModel({ id: 'model-1' });
      const provider = makeDbProvider({ models: [model1] });

      const { persistence, usageTracker } = createMocks({
        providers: [provider],
        canUseModel: false,
      });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.selectBestModel();
      expect(result).toBeNull();
    });

    it('should skip disabled providers', async () => {
      const model = makeDbModel({ id: 'model-1' });
      const provider = makeDbProvider({ id: 'prov-disabled', isEnabled: false, models: [model] });

      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();
      expect(available).toHaveLength(0);
    });

    it('should skip providers without API key', async () => {
      const model = makeDbModel({ id: 'model-1' });
      const provider = makeDbProvider({ id: 'prov-nokey', apiKey: null, models: [model] });

      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();
      expect(available).toHaveLength(0);
    });

    it('should skip disabled models', async () => {
      const enabledModel = makeDbModel({ id: 'enabled', isEnabled: true });
      const disabledModel = makeDbModel({ id: 'disabled', isEnabled: false });
      const provider = makeDbProvider({ models: [enabledModel, disabledModel] });

      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();
      expect(available).toHaveLength(1);
      expect(available[0].model.id).toBe('enabled');
    });
  });

  describe('getNextModel (excluded models)', () => {
    it('should skip excluded model IDs', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 100, sampleSize: 50 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        ranking: { score: 0.7, successRate: 0.9, avgLatencyMs: 300, sampleSize: 20 },
      });
      const modelC = makeDbModel({
        id: 'model-c',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB, modelC] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.getNextModel(['model-a']);

      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('model-b'); // next best after excluding model-a
    });

    it('should skip multiple excluded models', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 100, sampleSize: 50 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        ranking: { score: 0.7, successRate: 0.9, avgLatencyMs: 300, sampleSize: 20 },
      });
      const modelC = makeDbModel({
        id: 'model-c',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB, modelC] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.getNextModel(['model-a', 'model-b']);

      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('model-c');
    });

    it('should return null when all models are excluded', async () => {
      const modelA = makeDbModel({ id: 'model-a' });
      const modelB = makeDbModel({ id: 'model-b' });

      const provider = makeDbProvider({ models: [modelA, modelB] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.getNextModel(['model-a', 'model-b']);
      expect(result).toBeNull();
    });

    it('should return first model when no exclusions', async () => {
      const modelA = makeDbModel({
        id: 'model-a',
        ranking: { score: 0.9, successRate: 1.0, avgLatencyMs: 100, sampleSize: 50 },
      });
      const modelB = makeDbModel({
        id: 'model-b',
        ranking: { score: 0.5, successRate: 0.8, avgLatencyMs: 500, sampleSize: 10 },
      });

      const provider = makeDbProvider({ models: [modelA, modelB] });
      const { persistence, usageTracker } = createMocks({ providers: [provider] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.getNextModel([]);

      expect(result).not.toBeNull();
      expect(result!.model.id).toBe('model-a');
    });
  });

  describe('empty state', () => {
    it('should return null when no providers exist', async () => {
      const { persistence, usageTracker } = createMocks({ providers: [] });
      const selector = new ModelSelector(persistence, usageTracker);

      const result = await selector.selectBestModel();
      expect(result).toBeNull();
    });

    it('should return empty array from getAvailableModels when no providers', async () => {
      const { persistence, usageTracker } = createMocks({ providers: [] });
      const selector = new ModelSelector(persistence, usageTracker);

      const available = await selector.getAvailableModels();
      expect(available).toEqual([]);
    });
  });
});
