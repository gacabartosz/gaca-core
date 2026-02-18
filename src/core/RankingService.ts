// RankingService - Calculates and maintains model rankings
// Refactored to use GacaLogger and GacaPersistence interfaces

import type { GacaLogger } from './interfaces/logger.interface.js';
import type { GacaPersistence } from './interfaces/persistence.interface.js';
import { RankingWeights } from './types.js';

const DEFAULT_WEIGHTS: RankingWeights = {
  successRate: 0.4,
  latency: 0.3,
  quality: 0.3,
};

// Recalculate ranking every N requests
const RECALCULATE_INTERVAL = 100;

export class RankingService {
  private persistence: GacaPersistence;
  private logger: GacaLogger;
  private weights: RankingWeights;
  private requestCounts: Map<string, number> = new Map();

  constructor(persistence: GacaPersistence, logger: GacaLogger, weights: RankingWeights = DEFAULT_WEIGHTS) {
    this.persistence = persistence;
    this.logger = logger;
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
    const usage = await this.persistence.getModelUsage(modelId);

    if (!usage || usage.totalCalls === 0) {
      return;
    }

    const score = this.calculateScore({
      successCount: usage.successCount,
      totalCalls: usage.totalCalls,
      avgLatencyMs: usage.avgLatencyMs,
    });

    await this.persistence.upsertModelRanking({
      modelId,
      successRate: usage.totalCalls > 0 ? usage.successCount / usage.totalCalls : 0,
      avgLatencyMs: usage.avgLatencyMs,
      avgQualityScore: 0.5, // Default quality score
      score,
      sampleSize: usage.totalCalls,
    });

    this.logger.info('Recalculated ranking', { modelId, score: score.toFixed(3) });
  }

  // Recalculate rankings for all models
  async recalculateAll(): Promise<void> {
    const models = await this.persistence.getEnabledModels();
    let count = 0;

    for (const model of models) {
      if (model.usage && model.usage.totalCalls > 0) {
        await this.recalculateForModel(model.id);
        count++;
      }
    }

    this.logger.info('Recalculated all rankings', { modelCount: count });
  }

  // Get ranking for a model
  async getRanking(modelId: string): Promise<{
    score: number;
    successRate: number;
    avgLatencyMs: number;
    sampleSize: number;
  } | null> {
    const ranking = await this.persistence.getModelRanking(modelId);

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
    const rankings = await this.persistence.getAllRankings();

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
    const ranking = await this.persistence.getModelRanking(modelId);

    if (!ranking) return;

    const newScore = this.calculateScore({
      successCount: ranking.successRate * ranking.sampleSize,
      totalCalls: ranking.sampleSize,
      avgLatencyMs: ranking.avgLatencyMs,
      qualityScore,
    });

    await this.persistence.upsertModelRanking({
      modelId,
      score: newScore,
      successRate: ranking.successRate,
      avgLatencyMs: ranking.avgLatencyMs,
      avgQualityScore: qualityScore,
      sampleSize: ranking.sampleSize,
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
