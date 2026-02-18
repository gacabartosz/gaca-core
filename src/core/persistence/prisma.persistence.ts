// PrismaPersistence - Reference implementation using Prisma
// This is the default persistence layer for gaca-core standalone

import { PrismaClient } from '@prisma/client';
import type {
  GacaPersistence,
  ProviderEntity,
  ModelEntity,
  ModelRankingEntity,
  ModelUsageEntity,
  ProviderUsageEntity,
  FailoverEventEntity,
} from '../interfaces/persistence.interface.js';

export class PrismaPersistence implements GacaPersistence {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // ==================== PROVIDERS ====================

  async findProviderById(id: string) {
    return this.prisma.aIProvider.findUnique({
      where: { id },
      include: { models: { where: { isEnabled: true } } },
    });
  }

  async getEnabledProvidersWithModels() {
    return this.prisma.aIProvider.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
      include: {
        models: {
          where: { isEnabled: true },
          include: { usage: true, ranking: true },
          orderBy: [{ isDefault: 'desc' }],
        },
        usage: true,
      },
    });
  }

  // ==================== MODELS ====================

  async findModelById(id: string) {
    return this.prisma.aIModel.findUnique({
      where: { id },
      include: {
        provider: { include: { usage: true } },
        ranking: true,
        usage: true,
      },
    });
  }

  async getEnabledModels() {
    return this.prisma.aIModel.findMany({
      where: { isEnabled: true },
      include: { usage: true },
    });
  }

  // ==================== USAGE TRACKING ====================

  async getProviderUsage(providerId: string) {
    return this.prisma.aIProviderUsage.findUnique({
      where: { providerId },
    });
  }

  async upsertProviderUsage(data: {
    providerId: string;
    incrementRequests: boolean;
    requestsThisMinute?: number;
    tokensUsed?: number;
  }) {
    await this.prisma.aIProviderUsage.upsert({
      where: { providerId: data.providerId },
      create: {
        providerId: data.providerId,
        requestsToday: 1,
        requestsThisMinute: 1,
        lastRequestAt: new Date(),
        minuteResetAt: new Date(),
        dayResetAt: new Date(),
        totalTokensUsed: data.tokensUsed || 0,
      },
      update: {
        requestsToday: data.incrementRequests ? { increment: 1 } : undefined,
        requestsThisMinute: data.requestsThisMinute || 1,
        lastRequestAt: new Date(),
        totalTokensUsed: data.tokensUsed ? { increment: data.tokensUsed } : undefined,
      },
    });
  }

  async getModelUsage(modelId: string) {
    return this.prisma.aIModelUsage.findUnique({
      where: { modelId },
    });
  }

  async upsertModelUsage(data: {
    modelId: string;
    success: boolean;
    latencyMs: number;
    tokensUsed?: number;
    requestsThisMinute?: number;
  }) {
    const existing = await this.prisma.aIModelUsage.findUnique({
      where: { modelId: data.modelId },
    });

    if (!existing) {
      await this.prisma.aIModelUsage.create({
        data: {
          modelId: data.modelId,
          requestsToday: 1,
          requestsThisMinute: 1,
          lastRequestAt: new Date(),
          minuteResetAt: new Date(),
          dayResetAt: new Date(),
          totalCalls: 1,
          successCount: data.success ? 1 : 0,
          failureCount: data.success ? 0 : 1,
          avgLatencyMs: data.latencyMs,
          totalTokensUsed: data.tokensUsed || 0,
        },
      });
    } else {
      const newTotalCalls = existing.totalCalls + 1;
      const newAvgLatency = data.success
        ? Math.round(existing.avgLatencyMs + (data.latencyMs - existing.avgLatencyMs) / newTotalCalls)
        : existing.avgLatencyMs;

      await this.prisma.aIModelUsage.update({
        where: { modelId: data.modelId },
        data: {
          requestsToday: { increment: 1 },
          requestsThisMinute: data.requestsThisMinute || 1,
          lastRequestAt: new Date(),
          totalCalls: { increment: 1 },
          successCount: data.success ? { increment: 1 } : undefined,
          failureCount: data.success ? undefined : { increment: 1 },
          totalTokensUsed: data.tokensUsed ? { increment: data.tokensUsed } : undefined,
          avgLatencyMs: newAvgLatency,
        },
      });
    }
  }

  async resetProviderDailyCounters(beforeDate: Date) {
    await this.prisma.aIProviderUsage.updateMany({
      where: { dayResetAt: { lt: beforeDate } },
      data: { requestsToday: 0, dayResetAt: beforeDate },
    });
  }

  async resetModelDailyCounters(beforeDate: Date) {
    await this.prisma.aIModelUsage.updateMany({
      where: { dayResetAt: { lt: beforeDate } },
      data: { requestsToday: 0, dayResetAt: beforeDate },
    });
  }

  // ==================== RANKING ====================

  async getModelRanking(modelId: string) {
    return this.prisma.aIModelRanking.findUnique({
      where: { modelId },
    });
  }

  async upsertModelRanking(data: {
    modelId: string;
    score: number;
    successRate: number;
    avgLatencyMs: number;
    avgQualityScore?: number;
    sampleSize: number;
  }) {
    await this.prisma.aIModelRanking.upsert({
      where: { modelId: data.modelId },
      create: {
        modelId: data.modelId,
        successRate: data.successRate,
        avgLatencyMs: data.avgLatencyMs,
        avgQualityScore: data.avgQualityScore ?? 0.5,
        score: data.score,
        sampleSize: data.sampleSize,
        lastCalculatedAt: new Date(),
      },
      update: {
        successRate: data.successRate,
        avgLatencyMs: data.avgLatencyMs,
        avgQualityScore: data.avgQualityScore,
        score: data.score,
        sampleSize: data.sampleSize,
        lastCalculatedAt: new Date(),
      },
    });
  }

  async getAllRankings() {
    return this.prisma.aIModelRanking.findMany({
      orderBy: { score: 'desc' },
      include: {
        model: {
          include: { provider: true },
        },
      },
    });
  }

  // ==================== FAILOVER EVENTS ====================

  async logFailoverEvent(event: FailoverEventEntity) {
    await this.prisma.aIFailoverEvent.create({
      data: {
        fromModelId: event.fromModelId,
        toModelId: event.toModelId,
        reason: event.reason,
        errorMessage: event.errorMessage,
        latencyMs: event.latencyMs,
      },
    });
  }

  async getFailoverEvents(limit: number) {
    return this.prisma.aIFailoverEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}
