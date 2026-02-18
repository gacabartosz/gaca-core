// UsageTracker - Tracks rate limits and usage for providers and models

import { PrismaClient } from '@prisma/client';
import { UsageData } from './types.js';
import { logger } from './logger.js';

// In-memory cache for fast rate limit checking
interface UsageCache {
  requestsToday: number;
  requestsThisMinute: number;
  lastRequestAt: Date | null;
  minuteResetAt: Date;
  dayResetAt: Date;
}

export class UsageTracker {
  private prisma: PrismaClient;
  private providerUsageCache: Map<string, UsageCache> = new Map();
  private modelUsageCache: Map<string, UsageCache> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Check if provider can be used (rate limits)
  canUseProvider(providerId: string, rateLimitRpm: number | null, rateLimitRpd: number | null): boolean {
    const cache = this.getOrCreateProviderCache(providerId);
    return this.checkLimits(cache, rateLimitRpm, rateLimitRpd, `Provider ${providerId}`);
  }

  // Check if model can be used (rate limits)
  canUseModel(modelId: string, rateLimitRpm: number | null, rateLimitRpd: number | null): boolean {
    const cache = this.getOrCreateModelCache(modelId);
    return this.checkLimits(cache, rateLimitRpm, rateLimitRpd, `Model ${modelId}`);
  }

  // Track usage after a request
  async track(data: UsageData): Promise<void> {
    const { providerId, modelId, success, latencyMs, tokensUsed } = data;

    // Update provider cache
    const providerCache = this.getOrCreateProviderCache(providerId);
    providerCache.requestsToday++;
    providerCache.requestsThisMinute++;
    providerCache.lastRequestAt = new Date();

    // Update model cache
    const modelCache = this.getOrCreateModelCache(modelId);
    modelCache.requestsToday++;
    modelCache.requestsThisMinute++;
    modelCache.lastRequestAt = new Date();

    // Update DB asynchronously (don't await to not block)
    this.updateProviderUsageInDb(providerId, success, latencyMs, tokensUsed).catch((err) =>
      logger.error({ err }, 'Failed to update provider usage in DB'),
    );
    this.updateModelUsageInDb(modelId, success, latencyMs, tokensUsed).catch((err) =>
      logger.error({ err }, 'Failed to update model usage in DB'),
    );
  }

  // Load usage from DB into cache
  async loadProviderUsage(providerId: string): Promise<void> {
    const usage = await this.prisma.aIProviderUsage.findUnique({
      where: { providerId },
    });

    if (usage) {
      this.providerUsageCache.set(providerId, {
        requestsToday: usage.requestsToday,
        requestsThisMinute: usage.requestsThisMinute,
        lastRequestAt: usage.lastRequestAt,
        minuteResetAt: usage.minuteResetAt || new Date(),
        dayResetAt: usage.dayResetAt || new Date(),
      });
    }
  }

  // Load model usage from DB into cache
  async loadModelUsage(modelId: string): Promise<void> {
    const usage = await this.prisma.aIModelUsage.findUnique({
      where: { modelId },
    });

    if (usage) {
      this.modelUsageCache.set(modelId, {
        requestsToday: usage.requestsToday,
        requestsThisMinute: usage.requestsThisMinute,
        lastRequestAt: usage.lastRequestAt,
        minuteResetAt: usage.minuteResetAt || new Date(),
        dayResetAt: usage.dayResetAt || new Date(),
      });
    }
  }

  // Get usage stats for a provider
  getProviderStats(providerId: string): UsageCache | null {
    return this.providerUsageCache.get(providerId) || null;
  }

  // Get usage stats for a model
  getModelStats(modelId: string): UsageCache | null {
    return this.modelUsageCache.get(modelId) || null;
  }

  // Reset daily counters (should be called by a cron job or at startup)
  async resetDailyCounters(): Promise<void> {
    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);

    // Reset in-memory caches
    for (const [id, cache] of this.providerUsageCache) {
      if (cache.dayResetAt < todayMidnight) {
        cache.requestsToday = 0;
        cache.dayResetAt = todayMidnight;
      }
    }

    for (const [id, cache] of this.modelUsageCache) {
      if (cache.dayResetAt < todayMidnight) {
        cache.requestsToday = 0;
        cache.dayResetAt = todayMidnight;
      }
    }

    // Reset in DB
    await this.prisma.aIProviderUsage.updateMany({
      where: { dayResetAt: { lt: todayMidnight } },
      data: { requestsToday: 0, dayResetAt: todayMidnight },
    });

    await this.prisma.aIModelUsage.updateMany({
      where: { dayResetAt: { lt: todayMidnight } },
      data: { requestsToday: 0, dayResetAt: todayMidnight },
    });
  }

  private getOrCreateProviderCache(providerId: string): UsageCache {
    let cache = this.providerUsageCache.get(providerId);
    if (!cache) {
      cache = this.createEmptyCache();
      this.providerUsageCache.set(providerId, cache);
    }
    return this.maybeResetCache(cache);
  }

  private getOrCreateModelCache(modelId: string): UsageCache {
    let cache = this.modelUsageCache.get(modelId);
    if (!cache) {
      cache = this.createEmptyCache();
      this.modelUsageCache.set(modelId, cache);
    }
    return this.maybeResetCache(cache);
  }

  private createEmptyCache(): UsageCache {
    const now = new Date();
    return {
      requestsToday: 0,
      requestsThisMinute: 0,
      lastRequestAt: null,
      minuteResetAt: now,
      dayResetAt: now,
    };
  }

  private maybeResetCache(cache: UsageCache): UsageCache {
    const now = new Date();

    // Check for minute reset
    const minuteAgo = new Date(now.getTime() - 60000);
    if (cache.minuteResetAt < minuteAgo) {
      cache.requestsThisMinute = 0;
      cache.minuteResetAt = now;
    }

    // Check for day reset (midnight UTC)
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);
    if (cache.dayResetAt < todayMidnight) {
      cache.requestsToday = 0;
      cache.dayResetAt = todayMidnight;
    }

    return cache;
  }

  private checkLimits(
    cache: UsageCache,
    rateLimitRpm: number | null,
    rateLimitRpd: number | null,
    name: string,
  ): boolean {
    if (rateLimitRpm && cache.requestsThisMinute >= rateLimitRpm) {
      logger.warn({ name, used: cache.requestsThisMinute, limit: rateLimitRpm }, 'RPM limit hit');
      return false;
    }

    if (rateLimitRpd && cache.requestsToday >= rateLimitRpd) {
      logger.warn({ name, used: cache.requestsToday, limit: rateLimitRpd }, 'RPD limit hit');
      return false;
    }

    return true;
  }

  private async updateProviderUsageInDb(
    providerId: string,
    success: boolean,
    latencyMs: number,
    tokensUsed?: number,
  ): Promise<void> {
    const cache = this.providerUsageCache.get(providerId);

    await this.prisma.aIProviderUsage.upsert({
      where: { providerId },
      create: {
        providerId,
        requestsToday: 1,
        requestsThisMinute: 1,
        lastRequestAt: new Date(),
        minuteResetAt: new Date(),
        dayResetAt: new Date(),
        totalTokensUsed: tokensUsed || 0,
      },
      update: {
        requestsToday: { increment: 1 },
        requestsThisMinute: cache?.requestsThisMinute || 1,
        lastRequestAt: new Date(),
        totalTokensUsed: tokensUsed ? { increment: tokensUsed } : undefined,
      },
    });
  }

  private async updateModelUsageInDb(
    modelId: string,
    success: boolean,
    latencyMs: number,
    tokensUsed?: number,
  ): Promise<void> {
    const cache = this.modelUsageCache.get(modelId);

    await this.prisma.aIModelUsage.upsert({
      where: { modelId },
      create: {
        modelId,
        requestsToday: 1,
        requestsThisMinute: 1,
        lastRequestAt: new Date(),
        minuteResetAt: new Date(),
        dayResetAt: new Date(),
        totalCalls: 1,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
        avgLatencyMs: latencyMs,
        totalTokensUsed: tokensUsed || 0,
      },
      update: {
        requestsToday: { increment: 1 },
        requestsThisMinute: cache?.requestsThisMinute || 1,
        lastRequestAt: new Date(),
        totalCalls: { increment: 1 },
        successCount: success ? { increment: 1 } : undefined,
        failureCount: success ? undefined : { increment: 1 },
        totalTokensUsed: tokensUsed ? { increment: tokensUsed } : undefined,
        avgLatencyMs: success ? Math.min(Math.round(latencyMs), 30000) : undefined,
      },
    });
  }
}
