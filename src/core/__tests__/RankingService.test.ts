import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RankingService } from '../RankingService.js';

// Mock logger to suppress output during tests
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper: create a mock PrismaClient with just the methods RankingService uses
function createMockPrisma(overrides: {
  usageData?: { modelId: string; successCount: number; totalCalls: number; avgLatencyMs: number } | null;
} = {}) {
  const upsertSpy = vi.fn().mockResolvedValue({});

  return {
    prisma: {
      aIModelUsage: {
        findUnique: vi.fn().mockResolvedValue(overrides.usageData ?? null),
      },
      aIModelRanking: {
        upsert: upsertSpy,
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      aIModel: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any,
    upsertSpy,
  };
}

describe('RankingService', () => {
  describe('weights management', () => {
    it('should use default weights', () => {
      const { prisma } = createMockPrisma();
      const service = new RankingService(prisma);
      const weights = service.getWeights();

      expect(weights.successRate).toBe(0.4);
      expect(weights.latency).toBe(0.3);
      expect(weights.quality).toBe(0.3);
    });

    it('should accept custom weights in constructor', () => {
      const { prisma } = createMockPrisma();
      const customWeights = { successRate: 0.5, latency: 0.2, quality: 0.3 };
      const service = new RankingService(prisma, customWeights);

      expect(service.getWeights()).toEqual(customWeights);
    });

    it('should update weights partially via setWeights', () => {
      const { prisma } = createMockPrisma();
      const service = new RankingService(prisma);

      service.setWeights({ successRate: 0.6 });
      const weights = service.getWeights();

      expect(weights.successRate).toBe(0.6);
      expect(weights.latency).toBe(0.3); // unchanged
      expect(weights.quality).toBe(0.3); // unchanged
    });

    it('should return a copy of weights (not a reference)', () => {
      const { prisma } = createMockPrisma();
      const service = new RankingService(prisma);

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
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-1', successCount: 100, totalCalls: 100, avgLatencyMs: 0 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-1');

      expect(upsertSpy).toHaveBeenCalledOnce();
      const createData = upsertSpy.mock.calls[0][0].create;
      expect(createData.score).toBe(0.85);
      expect(createData.successRate).toBe(1);
      expect(createData.sampleSize).toBe(100);
    });

    it('should calculate correct score for average model', async () => {
      // 80% success, 2000ms latency →
      //   successRate = 0.8
      //   latencyScore = 1 - (2000/10000) = 0.8
      //   score = 0.8 * 0.4 + 0.8 * 0.3 + 0.5 * 0.3 = 0.32 + 0.24 + 0.15 = 0.71
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-2', successCount: 80, totalCalls: 100, avgLatencyMs: 2000 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-2');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.71);
    });

    it('should calculate correct score for slow model', async () => {
      // 90% success, 5000ms latency →
      //   latencyScore = 1 - 0.5 = 0.5
      //   score = 0.9 * 0.4 + 0.5 * 0.3 + 0.5 * 0.3 = 0.36 + 0.15 + 0.15 = 0.66
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-3', successCount: 90, totalCalls: 100, avgLatencyMs: 5000 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-3');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.66);
    });

    it('should use custom weights in score calculation', async () => {
      // 100% success, 0ms latency, weights: success=1.0, latency=0, quality=0
      // score = 1.0 * 1.0 + 1.0 * 0.0 + 0.5 * 0.0 = 1.0
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-4', successCount: 50, totalCalls: 50, avgLatencyMs: 0 },
      });
      const service = new RankingService(prisma, { successRate: 1.0, latency: 0, quality: 0 });

      await service.recalculateForModel('model-4');

      expect(upsertSpy.mock.calls[0][0].create.score).toBe(1.0);
    });
  });

  describe('edge cases', () => {
    it('should handle 0 samples (no usage data)', async () => {
      const { prisma, upsertSpy } = createMockPrisma({ usageData: null });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-none');

      // Should not upsert anything when no usage data
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should handle 0 totalCalls', async () => {
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-zero', successCount: 0, totalCalls: 0, avgLatencyMs: 0 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-zero');

      // totalCalls === 0 → early return, no upsert
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should handle all failures (0% success rate)', async () => {
      // 0% success, 3000ms latency →
      //   latencyScore = 1 - 0.3 = 0.7
      //   score = 0 * 0.4 + 0.7 * 0.3 + 0.5 * 0.3 = 0 + 0.21 + 0.15 = 0.36
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-fail', successCount: 0, totalCalls: 50, avgLatencyMs: 3000 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-fail');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.36);
      expect(upsertSpy.mock.calls[0][0].create.successRate).toBe(0);
    });

    it('should handle perfect score (100% success, 0 latency)', async () => {
      // Already tested above, but with different sample size
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-perfect', successCount: 1, totalCalls: 1, avgLatencyMs: 0 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-perfect');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.85);
      expect(upsertSpy.mock.calls[0][0].create.sampleSize).toBe(1);
    });

    it('should cap extreme latency at 10000ms (latencyScore = 0)', async () => {
      // 100% success, 50000ms latency (capped to 10000) →
      //   latencyScore = 1 - min(50000/10000, 1) = 1 - 1 = 0
      //   score = 1.0 * 0.4 + 0 * 0.3 + 0.5 * 0.3 = 0.4 + 0 + 0.15 = 0.55
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-slow', successCount: 100, totalCalls: 100, avgLatencyMs: 50000 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-slow');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.55);
    });

    it('should handle latency at exactly 10000ms boundary', async () => {
      // 100% success, 10000ms latency →
      //   latencyScore = 1 - min(10000/10000, 1) = 0
      //   score = 0.4 + 0 + 0.15 = 0.55
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-boundary', successCount: 100, totalCalls: 100, avgLatencyMs: 10000 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-boundary');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.55);
    });

    it('should handle worst possible score (0% success, extreme latency)', async () => {
      // 0% success, extreme latency →
      //   score = 0 * 0.4 + 0 * 0.3 + 0.5 * 0.3 = 0.15
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-worst', successCount: 0, totalCalls: 100, avgLatencyMs: 99999 },
      });
      const service = new RankingService(prisma);

      await service.recalculateForModel('model-worst');

      const score = upsertSpy.mock.calls[0][0].create.score;
      expect(score).toBe(0.15);
    });
  });

  describe('maybeRecalculate', () => {
    it('should not recalculate before reaching interval (100 requests)', async () => {
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-x', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const service = new RankingService(prisma);

      // Call 99 times — should NOT trigger recalculation
      for (let i = 0; i < 99; i++) {
        await service.maybeRecalculate('model-x');
      }
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('should recalculate at exactly the 100th request', async () => {
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-y', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const service = new RankingService(prisma);

      // Call 100 times — should trigger on the 100th
      for (let i = 0; i < 100; i++) {
        await service.maybeRecalculate('model-y');
      }
      expect(upsertSpy).toHaveBeenCalledOnce();
    });

    it('should track counts independently per model', async () => {
      const { prisma, upsertSpy } = createMockPrisma({
        usageData: { modelId: 'model-a', successCount: 50, totalCalls: 50, avgLatencyMs: 1000 },
      });
      const service = new RankingService(prisma);

      // 50 calls to model-a, 50 calls to model-b — neither should trigger
      for (let i = 0; i < 50; i++) {
        await service.maybeRecalculate('model-a');
        await service.maybeRecalculate('model-b');
      }
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });
});
