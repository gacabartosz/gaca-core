import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock Prisma
function createMockPrisma() {
  return {
    aIProviderUsage: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue(undefined),
    },
    aIModelUsage: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

describe('UsageTracker', () => {
  let tracker: UsageTracker;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    tracker = new UsageTracker(mockPrisma);
  });

  describe('canUseProvider()', () => {
    it('returns true when under limits', () => {
      expect(tracker.canUseProvider('prov-1', 60, 1000)).toBe(true);
    });

    it('returns false when RPM exhausted', () => {
      // Simulate hitting RPM limit by tracking requests
      for (let i = 0; i < 5; i++) {
        tracker.canUseProvider('prov-1', 5, 1000); // just to create cache
        // Manually track to increment counter
        tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100,
        });
      }

      expect(tracker.canUseProvider('prov-1', 5, 1000)).toBe(false);
    });

    it('returns false when RPD exhausted', () => {
      for (let i = 0; i < 3; i++) {
        tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100,
        });
      }

      expect(tracker.canUseProvider('prov-1', 100, 3)).toBe(false);
    });

    it('returns true when limits are null (unlimited)', () => {
      tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
      });

      expect(tracker.canUseProvider('prov-1', null, null)).toBe(true);
    });
  });

  describe('canUseModel()', () => {
    it('returns true when under limits', () => {
      expect(tracker.canUseModel('model-1', 60, 1000)).toBe(true);
    });

    it('returns false when RPM exhausted', () => {
      for (let i = 0; i < 10; i++) {
        tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100,
        });
      }

      expect(tracker.canUseModel('model-1', 10, 1000)).toBe(false);
    });

    it('returns false when RPD exhausted', () => {
      for (let i = 0; i < 5; i++) {
        tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100,
        });
      }

      expect(tracker.canUseModel('model-1', 100, 5)).toBe(false);
    });
  });

  describe('track()', () => {
    it('increments counters correctly', async () => {
      await tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
      });

      const providerStats = tracker.getProviderStats('prov-1');
      expect(providerStats).not.toBeNull();
      expect(providerStats!.requestsToday).toBe(1);
      expect(providerStats!.requestsThisMinute).toBe(1);

      const modelStats = tracker.getModelStats('model-1');
      expect(modelStats).not.toBeNull();
      expect(modelStats!.requestsToday).toBe(1);
      expect(modelStats!.requestsThisMinute).toBe(1);
    });

    it('increments counters for multiple requests', async () => {
      for (let i = 0; i < 3; i++) {
        await tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100 + i * 100,
        });
      }

      const providerStats = tracker.getProviderStats('prov-1');
      expect(providerStats!.requestsToday).toBe(3);
      expect(providerStats!.requestsThisMinute).toBe(3);
    });

    it('updates lastRequestAt', async () => {
      const beforeTrack = new Date();
      await tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
      });

      const stats = tracker.getProviderStats('prov-1');
      expect(stats!.lastRequestAt).not.toBeNull();
      expect(stats!.lastRequestAt!.getTime()).toBeGreaterThanOrEqual(beforeTrack.getTime());
    });

    it('calls DB update for provider and model', async () => {
      await tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
        tokensUsed: 25,
      });

      // Give async DB calls a chance to run
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPrisma.aIProviderUsage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId: 'prov-1' },
        }),
      );

      // Model usage - should call create since findUnique returns null
      expect(mockPrisma.aIModelUsage.create).toHaveBeenCalled();
    });
  });

  describe('getProviderStats()', () => {
    it('returns null for unknown provider', () => {
      expect(tracker.getProviderStats('unknown')).toBeNull();
    });

    it('returns stats after tracking', async () => {
      await tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
      });

      const stats = tracker.getProviderStats('prov-1');
      expect(stats).not.toBeNull();
      expect(stats!.requestsToday).toBe(1);
    });
  });

  describe('getModelStats()', () => {
    it('returns null for unknown model', () => {
      expect(tracker.getModelStats('unknown')).toBeNull();
    });

    it('returns stats after tracking', async () => {
      await tracker.track({
        providerId: 'prov-1',
        modelId: 'model-1',
        success: true,
        latencyMs: 100,
      });

      const stats = tracker.getModelStats('model-1');
      expect(stats).not.toBeNull();
      expect(stats!.requestsToday).toBe(1);
    });
  });

  describe('resetDailyCounters()', () => {
    it('resets daily counters in cache and DB', async () => {
      // Track some requests
      for (let i = 0; i < 5; i++) {
        await tracker.track({
          providerId: 'prov-1',
          modelId: 'model-1',
          success: true,
          latencyMs: 100,
        });
      }

      expect(tracker.getProviderStats('prov-1')!.requestsToday).toBe(5);

      // Simulate that the day reset was in the past
      const stats = tracker.getProviderStats('prov-1')!;
      stats.dayResetAt = new Date(Date.now() - 86400000 * 2); // 2 days ago

      const modelStats = tracker.getModelStats('model-1')!;
      modelStats.dayResetAt = new Date(Date.now() - 86400000 * 2);

      await tracker.resetDailyCounters();

      expect(tracker.getProviderStats('prov-1')!.requestsToday).toBe(0);
      expect(tracker.getModelStats('model-1')!.requestsToday).toBe(0);
      expect(mockPrisma.aIProviderUsage.updateMany).toHaveBeenCalled();
      expect(mockPrisma.aIModelUsage.updateMany).toHaveBeenCalled();
    });
  });
});
