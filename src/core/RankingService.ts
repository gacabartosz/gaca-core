// RankingService - Calculates and maintains model rankings

import { PrismaClient } from '@prisma/client';
import { RankingWeights } from './types.js';
import { logger } from './logger.js';

const DEFAULT_WEIGHTS: RankingWeights = {
  successRate: 0.4,
  latency: 0.3,
  quality: 0.3,
};

// Recalculate ranking every N requests
const RECALCULATE_INTERVAL = 100;

export class RankingService {
  private prisma: PrismaClient;
  private weights: RankingWeights;
  private requestCounts: Map<string, number> = new Map();

  constructor(prisma: PrismaClient, weights: RankingWeights = DEFAULT_WEIGHTS) {
    this.prisma = prisma;
    this.weights = weights;
  }

  // Update weights
  setWeights(weights: Partial<RankingWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  // Get current weights
  getWeights(): RankingWeights {
    return { ...this.weights };
  }

  // Check if we should recalculate ranking for a model
  async maybeRecalculate(modelId: string): Promise<void> {
    const count = (this.requestCounts.get(modelId) || 0) + 1;
    this.requestCounts.set(modelId, count);

    if (count >= RECALCULATE_INTERVAL) {
      this.requestCounts.set(modelId, 0);
      await this.recalculateForModel(modelId);
    }
  }

  // Force recalculate ranking for a specific model
  async recalculateForModel(modelId: string): Promise<void> {
    const usage = await this.prisma.aIModelUsage.findUnique({
      where: { modelId },
    });

    if (!usage || usage.totalCalls === 0) {
      return;
    }

    const score = this.calculateScore({
      successCount: usage.successCount,
      totalCalls: usage.totalCalls,
      avgLatencyMs: usage.avgLatencyMs,
    });

    await this.prisma.aIModelRanking.upsert({
      where: { modelId },
      create: {
        modelId,
        successRate: usage.totalCalls > 0 ? usage.successCount / usage.totalCalls : 0,
        avgLatencyMs: usage.avgLatencyMs,
        avgQualityScore: 0.5, // Default quality score
        score,
        sampleSize: usage.totalCalls,
        lastCalculatedAt: new Date(),
      },
      update: {
        successRate: usage.totalCalls > 0 ? usage.successCount / usage.totalCalls : 0,
        avgLatencyMs: usage.avgLatencyMs,
        score,
        sampleSize: usage.totalCalls,
        lastCalculatedAt: new Date(),
      },
    });

    logger.info({ modelId, score: score.toFixed(3) }, 'Recalculated ranking');
  }

  // Recalculate rankings for all models
  async recalculateAll(): Promise<void> {
    const models = await this.prisma.aIModel.findMany({
      where: { isEnabled: true },
      include: { usage: true },
    });

    for (const model of models) {
      if (model.usage && model.usage.totalCalls > 0) {
        await this.recalculateForModel(model.id);
      }
    }

    logger.info({ modelCount: models.length }, 'Recalculated all rankings');
  }

  // Get ranking for a model
  async getRanking(modelId: string): Promise<{
    score: number;
    successRate: number;
    avgLatencyMs: number;
    sampleSize: number;
  } | null> {
    const ranking = await this.prisma.aIModelRanking.findUnique({
      where: { modelId },
    });

    if (!ranking) return null;

    return {
      score: ranking.score,
      successRate: ranking.successRate,
      avgLatencyMs: ranking.avgLatencyMs,
      sampleSize: ranking.sampleSize,
    };
  }

  // Get all rankings sorted by score
  async getAllRankings(): Promise<
    Array<{
      modelId: string;
      modelName: string;
      providerName: string;
      score: number;
      successRate: number;
      avgLatencyMs: number;
      sampleSize: number;
    }>
  > {
    const rankings = await this.prisma.aIModelRanking.findMany({
      orderBy: { score: 'desc' },
      include: {
        model: {
          include: {
            provider: true,
          },
        },
      },
    });

    return rankings.map((r) => ({
      modelId: r.modelId,
      modelName: r.model.displayName || r.model.name,
      providerName: r.model.provider.name,
      score: r.score,
      successRate: r.successRate,
      avgLatencyMs: r.avgLatencyMs,
      sampleSize: r.sampleSize,
    }));
  }

  // Update quality score manually (e.g., from user feedback)
  async updateQualityScore(modelId: string, qualityScore: number): Promise<void> {
    const ranking = await this.prisma.aIModelRanking.findUnique({
      where: { modelId },
    });

    if (!ranking) return;

    const newScore = this.calculateScore({
      successCount: ranking.successRate * ranking.sampleSize,
      totalCalls: ranking.sampleSize,
      avgLatencyMs: ranking.avgLatencyMs,
      qualityScore,
    });

    await this.prisma.aIModelRanking.update({
      where: { modelId },
      data: {
        avgQualityScore: qualityScore,
        score: newScore,
        lastCalculatedAt: new Date(),
      },
    });
  }

  private calculateScore(data: {
    successCount: number;
    totalCalls: number;
    avgLatencyMs: number;
    qualityScore?: number;
  }): number {
    const { successCount, totalCalls, avgLatencyMs, qualityScore = 0.5 } = data;

    // Success rate: 0.0 - 1.0
    const successRate = totalCalls > 0 ? successCount / totalCalls : 0;

    // Normalized latency: cap at 10000ms, lower is better
    const normalizedLatency = Math.min(avgLatencyMs / 10000, 1);
    const latencyScore = 1 - normalizedLatency;

    // Calculate weighted score
    const score =
      successRate * this.weights.successRate +
      latencyScore * this.weights.latency +
      qualityScore * this.weights.quality;

    return Math.round(score * 1000) / 1000; // Round to 3 decimal places
  }
}
