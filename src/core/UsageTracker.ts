// UsageTracker - Tracks rate limits and usage for providers and models
// Refactored to use GacaLogger and GacaPersistence interfaces

import type { GacaLogger } from './interfaces/logger.interface.js';
import type { GacaPersistence } from './interfaces/persistence.interface.js';
import { UsageData } from './types.js';

// In-memory cache for fast rate limit checking
interface UsageCache {
  requestsToday: number;
  requestsThisMinute: number;
  lastRequestAt: Date | null;
  minuteResetAt: Date;
  dayResetAt: Date;
}

export class UsageTracker {
  private persistence: GacaPersistence;
  private logger: GacaLogger;
  private providerUsageCache: Map<string, UsageCache> = new Map();
  private modelUsageCache: Map<string, UsageCache> = new Map();

  constructor(persistence: GacaPersistence, logger: GacaLogger) {
    this.persistence = persistence;
    this.logger = logger;
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
      this.logger.error('Failed to update provider usage in DB', { err: String(err) }),
    );
    this.updateModelUsageInDb(modelId, success, latencyMs, tokensUsed).catch((err) =>
      this.logger.error('Failed to update model usage in DB', { err: String(err) }),
    );
  }

  // Load usage from DB into cache
  async loadProviderUsage(providerId: string): Promise<void> {
    const usage = await this.persistence.getProviderUsage(providerId);

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
    const usage = await this.persistence.getModelUsage(modelId);

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
    await this.persistence.resetProviderDailyCounters(todayMidnight);
    await this.persistence.resetModelDailyCounters(todayMidnight);
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
      this.logger.warn('RPM limit hit', { name, used: cache.requestsThisMinute, limit: rateLimitRpm });
      return false;
    }

    if (rateLimitRpd && cache.requestsToday >= rateLimitRpd) {
      this.logger.warn('RPD limit hit', { name, used: cache.requestsToday, limit: rateLimitRpd });
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

    await this.persistence.upsertProviderUsage({
      providerId,
      incrementRequests: true,
      requestsThisMinute: cache?.requestsThisMinute || 1,
      tokensUsed,
    });
  }

  private async updateModelUsageInDb(
    modelId: string,
    success: boolean,
    latencyMs: number,
    tokensUsed?: number,
  ): Promise<void> {
    const cache = this.modelUsageCache.get(modelId);

    await this.persistence.upsertModelUsage({
      modelId,
      success,
      latencyMs,
      tokensUsed,
      requestsThisMinute: cache?.requestsThisMinute || 1,
    });
  }
}
