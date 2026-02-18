import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RankingService } from '../RankingService.js';
import type { GacaLogger } from '../interfaces/logger.interface.js';
import type { GacaPersistence, ModelUsageEntity, ModelRankingEntity, ModelEntity, ProviderEntity } from '../interfaces/persistence.interface.js';

// Mock logger
function createMockLogger(): GacaLogger {
  return {
    debug: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// Helper: create a mock GacaPersistence with just the methods RankingService uses
function createMockPersistence(
  overrides: {
    usageData?: { modelId: string; successCount: number; totalCalls: number; avgLatencyMs: number } | null;
  } = {},
) {
  const upsertRankingSpy = vi.fn().mockResolvedValue(undefined);

  const persistence: Partial<GacaPersistence> = {
    getModelUsage: vi.fn().mockImplementation(async (modelId: string): Promise<ModelUsageEntity | null> => {
      if (!overrides.usageData || overrides.usageData.modelId !== modelId) {
        return null;
      }
      return {
        modelId: overrides.usageData.modelId,
        requestsToday: 0,
        requestsThisMinute: 0,
        lastRequestAt: null,
        minuteResetAt: null,
        dayResetAt: null,
        totalCalls: overrides.usageData.totalCalls,
        successCount: overrides.usageData.successCount,
        failureCount: overrides.usageData.totalCalls - overrides.usageData.successCount,
        avgLatencyMs: overrides.usageData.avgLatencyMs,
        totalTokensUsed: 0,
      };
    }),
    getModelRanking: vi.fn().mockResolvedValue(null),
    upsertModelRanking: upsertRankingSpy,
    getAllRankings: vi.fn().mockResolvedValue([]),
    getEnabledModels: vi.fn().mockResolvedValue([]),
  };

  return {
    persistence: persistence as GacaPersistence,
    upsertSpy: upsertRankingSpy,
  };
}

describe('RankingService', () => {
  describe('weights management', () => {
    it('should use default weights', () => {
      const { persistence } = createMockPersistence();
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);
      const weights = service.getWeights();

      expect(weights.successRate).toBe(0.4);
      expect(weights.latency).toBe(0.3);
      expect(weights.quality).toBe(0.3);
    });

    it('should accept custom weights in constructor', () => {
      const { persistence } = createMockPersistence();
      const logger = createMockLogger();
      const customWeights = { successRate: 0.5, latency: 0.2, quality: 0.3 };
      const service = new RankingService(persistence, logger, customWeights);

      expect(service.getWeights()).toEqual(customWeights);
    });

    it('should update weights partially via setWeights', () => {
      const { persistence } = createMockPersistence();
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      service.setWeights({ successRate: 0.6 });
      const weights = service.getWeights();

      expect(weights.successRate).toBe(0.6);
      expect(weights.latency).toBe(0.3); // unchanged
      expect(weights.quality).toBe(0.3); // unchanged
    });

    it('should return a copy of weights (not a reference)', () => {
      const { persistence } = createMockPersistence();
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      const w1 = service.getWeights();
      w1.successRate = 0.99;
      const w2 = service.getWeights();

      expect(w2.successRate).toBe(0.4); // original unchanged
    });
  });

  describe('score calculation (via recalculateForModel)', () => {
    // Score formula:
    //   successRate * w.successRate + latencyScore * w.latency + qualityScore * w.quality
    //   latencyScore = 1 - min(avgLatencyMs / 10000, 1)
    //   qualityScore defaults to 0.5 when not provided

    it('should calculate correct score for perfect model', async () => {
      // 100% success, 0ms latency → score = 1.0 * 0.4 + 1.0 * 0.3 + 0.5 * 0.3 = 0.85
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-1', successCount: 100, totalCalls: 100, avgLatencyMs: 0 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-1');

      expect(upsertSpy).toHaveBeenCalledOnce();
      const callArg = upsertSpy.mock.calls[0][0];
      expect(callArg.score).toBe(0.85);
      expect(callArg.successRate).toBe(1);
      expect(callArg.sampleSize).toBe(100);
    });

    it('should calculate correct score for average model', async () => {
      // 80% success, 2000ms latency →
      //   successRate = 0.8
      //   latencyScore = 1 - (2000/10000) = 0.8
      //   score = 0.8 * 0.4 + 0.8 * 0.3 + 0.5 * 0.3 = 0.32 + 0.24 + 0.15 = 0.71
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-2', successCount: 80, totalCalls: 100, avgLatencyMs: 2000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-2');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.71);
    });

    it('should calculate correct score for slow model', async () => {
      // 90% success, 5000ms latency →
      //   latencyScore = 1 - 0.5 = 0.5
      //   score = 0.9 * 0.4 + 0.5 * 0.3 + 0.5 * 0.3 = 0.36 + 0.15 + 0.15 = 0.66
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-3', successCount: 90, totalCalls: 100, avgLatencyMs: 5000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-3');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.66);
    });

    it('should use custom weights in score calculation', async () => {
      // 100% success, 0ms latency, weights: success=1.0, latency=0, quality=0
      // score = 1.0 * 1.0 + 1.0 * 0.0 + 0.5 * 0.0 = 1.0
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-4', successCount: 50, totalCalls: 50, avgLatencyMs: 0 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger, { successRate: 1.0, latency: 0, quality: 0 });

      await service.recalculateForModel('model-4');

      expect(upsertSpy.mock.calls[0][0].score).toBe(1.0);
    });
  });

  describe('edge cases', () => {
    it('should handle 0 samples (no usage data)', async () => {
      const { persistence, upsertSpy } = createMockPersistence({ usageData: null });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-none');

      // Should not upsert anything when no usage data
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should handle 0 totalCalls', async () => {
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-zero', successCount: 0, totalCalls: 0, avgLatencyMs: 0 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-zero');

      // totalCalls === 0 → early return, no upsert
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should handle all failures (0% success rate)', async () => {
      // 0% success, 3000ms latency →
      //   latencyScore = 1 - 0.3 = 0.7
      //   score = 0 * 0.4 + 0.7 * 0.3 + 0.5 * 0.3 = 0 + 0.21 + 0.15 = 0.36
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-fail', successCount: 0, totalCalls: 50, avgLatencyMs: 3000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-fail');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.36);
      expect(upsertSpy.mock.calls[0][0].successRate).toBe(0);
    });

    it('should handle perfect score (100% success, 0 latency)', async () => {
      // Already tested above, but with different sample size
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-perfect', successCount: 1, totalCalls: 1, avgLatencyMs: 0 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-perfect');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.85);
      expect(upsertSpy.mock.calls[0][0].sampleSize).toBe(1);
    });

    it('should cap extreme latency at 10000ms (latencyScore = 0)', async () => {
      // 100% success, 50000ms latency (capped to 10000) →
      //   latencyScore = 1 - min(50000/10000, 1) = 1 - 1 = 0
      //   score = 1.0 * 0.4 + 0 * 0.3 + 0.5 * 0.3 = 0.4 + 0 + 0.15 = 0.55
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-slow', successCount: 100, totalCalls: 100, avgLatencyMs: 50000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-slow');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.55);
    });

    it('should handle latency at exactly 10000ms boundary', async () => {
      // 100% success, 10000ms latency →
      //   latencyScore = 1 - min(10000/10000, 1) = 0
      //   score = 0.4 + 0 + 0.15 = 0.55
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-boundary', successCount: 100, totalCalls: 100, avgLatencyMs: 10000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-boundary');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.55);
    });

    it('should handle worst possible score (0% success, extreme latency)', async () => {
      // 0% success, extreme latency →
      //   score = 0 * 0.4 + 0 * 0.3 + 0.5 * 0.3 = 0.15
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-worst', successCount: 0, totalCalls: 100, avgLatencyMs: 99999 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      await service.recalculateForModel('model-worst');

      const score = upsertSpy.mock.calls[0][0].score;
      expect(score).toBe(0.15);
    });
  });

  describe('maybeRecalculate', () => {
    it('should not recalculate before reaching interval (100 requests)', async () => {
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-x', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      // Call 99 times — should NOT trigger recalculation
      for (let i = 0; i < 99; i++) {
        await service.maybeRecalculate('model-x');
      }
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should recalculate at exactly the 100th request', async () => {
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-y', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      // Call 100 times — should trigger on the 100th
      for (let i = 0; i < 100; i++) {
        await service.maybeRecalculate('model-y');
      }
      expect(upsertSpy).toHaveBeenCalledOnce();
    });

    it('should track counts independently per model', async () => {
      const { persistence, upsertSpy } = createMockPersistence({
        usageData: { modelId: 'model-a', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const logger = createMockLogger();
      const service = new RankingService(persistence, logger);

      // 50 calls to model-a, 50 calls to model-b — neither should trigger
      for (let i = 0; i < 50; i++) {
        await service.maybeRecalculate('model-a');
        await service.maybeRecalculate('model-b');
      }
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });
});
